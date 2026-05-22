import express from 'express';
import { v4 as uuid } from 'uuid';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db, nowIso, rowToSlideshow } from '../db/index.js';
import { config } from '../config.js';
import { createSlide, createTextItem, defaultSettings, normalizeSlideshow } from '../model/defaults.js';
import { enqueueRender } from '../queue/renderQueue.js';
import { reloadSchedules } from '../scheduler.js';
import { ensureImageDescriptions, selectBestImage } from '../ai/imageLibrary.js';

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

const slideshowSchema = {
  name: 'slideshow_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            order: { type: 'integer' },
            image_id: { type: 'string' },
            image_hint: { type: 'string' },
            text_items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  text: { type: 'string' },
                  font_size: { type: 'string', enum: ['extra_small', 'small', 'medium', 'large', 'extra_large', 'extra_extra_large'] },
                  text_style: { type: 'string', enum: ['outline', 'whiteText', 'blackText', 'yellowText', 'white_background', 'black_background', 'white_50_background', 'black_50_background'] },
                  text_position: { type: 'string', enum: ['top', 'center', 'bottom'] },
                  text_alignment: { type: 'string', enum: ['left', 'center', 'right'] },
                  text_width: { type: 'string', enum: ['50%', '80%', '100%'] },
                  font: { type: 'string', enum: ['TikTokSans-Regular', 'BebasNeue-Regular', 'CormorantGaramond-Regular', 'CormorantGaramond-Italic', 'Anton', 'Inter-Bold'] }
                },
                required: ['text', 'font_size', 'text_style', 'text_position', 'text_alignment', 'text_width', 'font']
              }
            }
          },
          required: ['order', 'image_id', 'image_hint', 'text_items']
        }
      }
    },
    required: ['title', 'slides']
  }
};

function imagePromptBlock(images) {
  if (!images.length) return 'No local images are available. Return image_id as an empty string.';
  return `Choose one image_id per slide from this local image library. Reuse only if necessary:\n${images.map((image) => `- ${image.id}: ${image.original_name}${image.description ? ` — ${image.description}` : ''}`).join('\n')}`;
}

async function callLlm(prompt, images = []) {
  const schemaPrompt = `Create a TikTok-native vertical slideshow for a scripture study app called Latter Study.

The slideshow should feel thoughtful, faithful, and useful for individuals and families. Use more substantive slide copy than a meme caption: each slide should usually have 2 text items, one short headline and one supporting sentence. Keep each text item readable on a phone, about 8 to 18 words. If the prompt asks about controversy or sensitive religious topics, frame claims carefully, avoid attacking other faiths, and focus on learning, context, scripture, and sincere discipleship.

Use TikTokSans-Regular unless another font is explicitly requested. Prefer outline or black_50_background for legible native captions. Include a final slide that naturally mentions Latter Study as an AI-assisted scripture study app for consistent personal and family study.

${imagePromptBlock(images)}

User request: ${prompt}`;
  if (config.llm.openaiKey) {
    const client = new OpenAI({ apiKey: config.llm.openaiKey });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_schema', json_schema: slideshowSchema },
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

function applyImages(slides, images) {
  const byId = new Map(images.map((image) => [image.id, image]));
  const used = new Set();
  return slides.map((slide) => {
    const chosen = byId.get(slide.image_id) || selectBestImage(slide, images, used);
    if (chosen) used.add(chosen.id);
    return {
      ...slide,
      image_url: chosen?.url || '',
      image_urls: chosen?.url ? [chosen.url] : []
    };
  });
}

automationRouter.get('/capabilities', (_req, res) => {
  res.json({ llm_enabled: Boolean(config.llm.openaiKey || config.llm.anthropicKey) });
});

automationRouter.post('/generate', async (req, res) => {
  const prompt = req.body.prompt || '';
  const images = await ensureImageDescriptions().catch(() => db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 40').all());
  const generated = await callLlm(prompt, images).catch(() => null);
  if (!generated) {
    const fallback = fallbackGenerated(prompt);
    fallback.slides = applyImages(fallback.slides, images);
    return res.json({ ...fallback, llm_used: false });
  }
  const slideshow = normalizeSlideshow({
    title: generated.title,
    slides: applyImages(generated.slides, images).map((slide, index) => createSlide({
      order: index,
      image_url: slide.image_url,
      image_urls: slide.image_urls,
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
  const images = await ensureImageDescriptions().catch(() => db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 40').all());
  const created = [];
  for (const prompt of prompts) {
    const plan = await callLlm(prompt, images).catch(() => null);
    const generated = plan ? normalizeSlideshow({
      title: plan.title,
      slides: applyImages(plan.slides, images).map((slide, index) => createSlide({
        order: index,
        image_url: slide.image_url,
        image_urls: slide.image_urls,
        text_items: (slide.text_items || []).map((item, itemIndex) => createTextItem({ ...item, order: itemIndex }))
      }))
    }) : fallbackGenerated(prompt);
    if (!plan) generated.slides = applyImages(generated.slides, images);
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
