import express from 'express';
import { v4 as uuid } from 'uuid';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db, nowIso, rowToSlideshow } from '../db/index.js';
import { config } from '../config.js';
import { createSlide, createTextItem, defaultSettings, normalizeSlideshow } from '../model/defaults.js';
import { enqueueRender } from '../queue/renderQueue.js';
import { reloadSchedules } from '../scheduler.js';

export const automationRouter = express.Router();

function templateFromSlideshow(slideshow) {
  return {
    settings: slideshow.settings,
    slides: slideshow.slides.map((slide, index) => ({
      ...slide,
      order: index,
      image_url: '',
      image_urls: [],
      text_items: slide.text_items.map((item, itemIndex) => ({ ...item, id: uuid(), text: '', order: itemIndex }))
    }))
  };
}

function fallbackGenerated(prompt) {
  const count = Number(prompt.match(/\b(\d+)\s+slides?\b/i)?.[1] || 5);
  return normalizeSlideshow({
    title: prompt.slice(0, 70) || 'Generated slideshow',
    settings: defaultSettings,
    slides: Array.from({ length: Math.max(1, Math.min(count, 12)) }, (_, index) => createSlide({
      order: index,
      text_items: [createTextItem({
        order: 0,
        text: index === 0 ? prompt : `Point ${index}`,
        font_size: index === 0 ? 'extra_large' : 'large',
        text_style: 'outline',
        text_position: index === 0 ? 'center' : 'bottom'
      })]
    }))
  });
}

async function callLlm(prompt) {
  const schemaPrompt = `Return only JSON matching this schema: {"title":"string","slides":[{"order":0,"text_items":[{"text":"string","font_size":"extra_large","text_style":"outline","text_position":"top","font":"BebasNeue-Regular"}]}]}. User request: ${prompt}`;
  if (config.llm.openaiKey) {
    const client = new OpenAI({ apiKey: config.llm.openaiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: schemaPrompt }]
    });
    return JSON.parse(response.choices[0].message.content);
  }
  if (config.llm.anthropicKey) {
    const client = new Anthropic({ apiKey: config.llm.anthropicKey });
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1800,
      messages: [{ role: 'user', content: schemaPrompt }]
    });
    return JSON.parse(response.content[0].text);
  }
  return null;
}

automationRouter.get('/capabilities', (_req, res) => {
  res.json({ llm_enabled: Boolean(config.llm.openaiKey || config.llm.anthropicKey) });
});

automationRouter.post('/generate', async (req, res) => {
  const prompt = req.body.prompt || '';
  const generated = await callLlm(prompt).catch(() => null);
  if (!generated) return res.json({ ...fallbackGenerated(prompt), llm_used: false });
  const slideshow = normalizeSlideshow({
    title: generated.title,
    slides: generated.slides.map((slide, index) => createSlide({
      order: index,
      text_items: (slide.text_items || []).map((item, itemIndex) => createTextItem({
        ...item,
        order: itemIndex,
        text_alignment: item.text_alignment || 'center',
        text_width: item.text_width || '80%'
      }))
    }))
  });
  res.json({ ...slideshow, llm_used: true });
});

automationRouter.post('/templates', (req, res) => {
  const source = normalizeSlideshow(req.body);
  const template = templateFromSlideshow(source);
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO templates (id, name, settings, slides, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.body.name || source.title || 'Template', JSON.stringify(template.settings), JSON.stringify(template.slides), now, now);
  res.status(201).json({ id, name: req.body.name || source.title, ...template });
});

automationRouter.get('/templates', (_req, res) => {
  res.json(db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all().map((row) => ({
    ...row,
    settings: JSON.parse(row.settings),
    slides: JSON.parse(row.slides)
  })));
});

automationRouter.post('/batch', async (req, res) => {
  const prompts = String(req.body.prompts || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const imageUrls = req.body.image_urls || [];
  const created = [];
  for (const prompt of prompts) {
    const generated = fallbackGenerated(prompt);
    generated.slides = generated.slides.map((slide, index) => ({ ...slide, image_url: imageUrls[index % Math.max(imageUrls.length, 1)] || '' }));
    const id = uuid();
    const now = nowIso();
    db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)`).run(id, generated.title, JSON.stringify(generated.settings), JSON.stringify(generated.slides), now, now);
    const jobId = uuid();
    db.prepare(`INSERT INTO jobs (id, slideshow_id, type, status, progress, message, created_at, updated_at)
      VALUES (?, ?, 'render', 'queued', 0, 'Queued', ?, ?)`).run(jobId, id, now, now);
    enqueueRender(jobId, id);
    created.push({ slideshow_id: id, job_id: jobId, title: generated.title });
  }
  res.status(202).json(created);
});

automationRouter.get('/schedules', (_req, res) => {
  res.json(db.prepare('SELECT * FROM schedules ORDER BY updated_at DESC').all().map((row) => ({
    ...row,
    prompts: JSON.parse(row.prompts),
    enabled: Boolean(row.enabled)
  })));
});

automationRouter.post('/schedules', (req, res) => {
  const id = uuid();
  const now = nowIso();
  const prompts = String(req.body.prompts || '').split('\n').map((line) => line.trim()).filter(Boolean);
  db.prepare(`INSERT INTO schedules (id, name, cron, template_id, prompts, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    req.body.name || 'Scheduled batch',
    req.body.cron || '0 9 * * *',
    req.body.template_id || '',
    JSON.stringify(prompts),
    req.body.enabled === false ? 0 : 1,
    now,
    now
  );
  reloadSchedules();
  res.status(201).json({ id, name: req.body.name || 'Scheduled batch', cron: req.body.cron || '0 9 * * *', template_id: req.body.template_id || '', prompts, enabled: req.body.enabled !== false });
});

automationRouter.delete('/schedules/:id', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  reloadSchedules();
  res.status(204).end();
});
