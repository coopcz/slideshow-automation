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
import {
  defaultRecipe as coreDefaultRecipe,
  generateBatchTopics,
  generateSlideshowFromPrompt as coreGenerateSlideshowFromPrompt,
  normalizeRecipePayload,
  rowToRecipe as coreRowToRecipe,
  runRecipeAutomation
} from '../automation/core.js';

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

function defaultRecipe() {
  return {
    name: 'Latter Study evergreen slideshow',
    product_name: 'Latter Study',
    audience: 'LDS individuals and families who want consistent scripture study',
    goal: 'Promote Latter Study as a faithful AI-assisted scripture study app while teaching useful gospel study ideas.',
    voice: 'Faithful, thoughtful, respectful, practical, never combative.',
    prompt_template: 'Create a slideshow about {{topic}}. Connect the lesson to consistent scripture study for individuals and families, and naturally mention Latter Study near the end.',
    slide_count: 8,
    export_as_video: 0,
    transition: 'none',
    image_strategy: 'relevant',
    output_mode: 'editable_and_render'
  };
}

function rowToRecipe(row) {
  if (!row) return null;
  return {
    ...row,
    slide_count: Number(row.slide_count),
    export_as_video: Boolean(row.export_as_video)
  };
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

const imageMatchSchema = {
  name: 'slideshow_image_matches',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            order: { type: 'integer' },
            image_id: { type: 'string' },
            rationale: { type: 'string' }
          },
          required: ['order', 'image_id', 'rationale']
        }
      }
    },
    required: ['matches']
  }
};

function imagePromptBlock(images) {
  if (!images.length) return 'No local images are available. Return image_id as an empty string.';
  return 'For each slide, return image_id as an empty string. Write image_hint as a concrete visual search phrase describing the ideal image for that slide. A separate matching step will choose images from the local library after the slide text is finalized.';
}

async function callLlm(prompt, images = [], recipe = defaultRecipe()) {
  const schemaPrompt = `Create a TikTok-native vertical slideshow for a scripture study app called ${recipe.product_name || 'Latter Study'}.

Audience: ${recipe.audience || defaultRecipe().audience}
Goal: ${recipe.goal || defaultRecipe().goal}
Voice: ${recipe.voice || defaultRecipe().voice}
Required slide count: ${recipe.slide_count || 8}

The slideshow should feel thoughtful, faithful, and useful. Use more substantive slide copy than a meme caption. Create exactly ${recipe.slide_count || 8} slides. Each slide should have exactly one text item, but that text can contain two short lines separated by a newline: a hook/headline and a supporting sentence. Keep the full caption readable on a phone, about 14 to 28 words total. If the prompt asks about controversy or sensitive religious topics, frame claims carefully, avoid attacking other faiths, and focus on learning, context, scripture, and sincere discipleship.

Use TikTokSans-Regular, outline, center alignment, center position, and 80% width for every text item. Do not use background text styles. Include a final slide that naturally mentions ${recipe.product_name || 'Latter Study'} as an AI-assisted scripture study app for consistent personal and family study.

${imagePromptBlock(images)}

User request: ${prompt}`;
  if (config.llm.openaiKey) {
    const client = new OpenAI({ apiKey: config.llm.openaiKey });
    const response = await client.chat.completions.create({
      model: config.llm.openaiModel,
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

function imageLibraryPrompt(images) {
  return images.map((image) => {
    const description = String(image.description || '').slice(0, 300);
    return `- ${image.id}: ${image.original_name}${description ? ` — ${description}` : ''}`;
  }).join('\n');
}

function slideMatchingPrompt(slides) {
  return slides.map((slide, index) => {
    const text = (slide.text_items || []).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
    return `Slide ${slide.order ?? index}: hint="${slide.image_hint || ''}" text="${text}"`;
  }).join('\n');
}

async function matchImagesWithLlm(slides, images, topicContext = '') {
  if (!config.llm.openaiKey || !images.length || !slides.length) return new Map();
  const client = new OpenAI({ apiKey: config.llm.openaiKey });
  const prompt = `Choose the best local image for each generated slideshow slide.

Topic/request:
${topicContext}

Rules:
- Match the visible content of the image to the specific slide text and image hint.
- Prefer concrete story, setting, object, action, and mood matches over generic religious images.
- Use a different image_id for each slide unless there are fewer images than slides.
- Only choose image_id values from the local image library.

Slides:
${slideMatchingPrompt(slides)}

Local image library:
${imageLibraryPrompt(images)}`;

  const response = await client.chat.completions.create({
    model: config.llm.openaiModel,
    response_format: { type: 'json_schema', json_schema: imageMatchSchema },
    messages: [{ role: 'user', content: prompt }]
  });
  const parsed = JSON.parse(response.choices[0].message.content);
  return new Map((parsed.matches || []).map((match) => [Number(match.order), match.image_id]));
}

function recipePrompt(recipe, topic = '') {
  const base = recipe.prompt_template || defaultRecipe().prompt_template;
  return base
    .replaceAll('{{topic}}', topic || 'a timely scripture study topic')
    .replaceAll('{{product_name}}', recipe.product_name || 'Latter Study')
    .replaceAll('{{audience}}', recipe.audience || defaultRecipe().audience)
    .replaceAll('{{goal}}', recipe.goal || defaultRecipe().goal)
    .replaceAll('{{voice}}', recipe.voice || defaultRecipe().voice);
}

function applyImages(slides, images, topicContext = '', preferredImageIds = new Map()) {
  const byId = new Map(images.map((image) => [image.id, image]));
  const used = new Set();
  return slides.map((slide, index) => {
    const preferred = byId.get(preferredImageIds.get(Number(slide.order ?? index)));
    const requested = byId.get(slide.image_id);
    const scoringSlide = {
      ...slide,
      topic_context: topicContext,
      requested_image_context: requested
        ? `${requested.original_name} ${requested.description || ''}`
        : ''
    };
    const chosen = preferred && !used.has(preferred.id)
      ? preferred
      : selectBestImage(scoringSlide, images, used);
    if (chosen) used.add(chosen.id);
    return {
      ...slide,
      image_url: chosen?.url || '',
      image_urls: chosen?.url ? [chosen.url] : []
    };
  });
}

function nativeCaptionItems(items = []) {
  const text = items
    .map((item) => String(item.text || '').trim())
    .filter(Boolean)
    .join('\n');

  return [createTextItem({
    order: 0,
    text,
    font: 'TikTokSans-Regular',
    font_size: text.length > 130 ? 'medium' : 'large',
    text_style: 'outline',
    text_position: 'center',
    text_alignment: 'center',
    text_width: '80%'
  })];
}

async function generateSlideshowFromPrompt(prompt, recipe = defaultRecipe()) {
  const images = await ensureImageDescriptions().catch((error) => {
    console.warn(`Image description indexing failed: ${error.message}`);
    return db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 120').all();
  });
  const generated = await callLlm(prompt, images, recipe).catch(() => null);
  if (!generated) {
    const fallback = fallbackGenerated(prompt);
    fallback.settings = { ...fallback.settings, export_as_video: Boolean(recipe.export_as_video), transition: recipe.transition || 'none' };
    fallback.slides = applyImages(fallback.slides, images, prompt);
    return { slideshow: fallback, llm_used: false };
  }
  const preferredImageIds = await matchImagesWithLlm(generated.slides, images, prompt).catch((error) => {
    console.warn(`LLM image matching failed, falling back to local scorer: ${error.message}`);
    return new Map();
  });
  const slideshow = normalizeSlideshow({
    title: generated.title,
    settings: {
      ...defaultSettings,
      export_as_video: Boolean(recipe.export_as_video),
      transition: recipe.transition || 'none'
    },
    slides: applyImages(generated.slides, images, prompt, preferredImageIds).map((slide, index) => createSlide({
      order: index,
      image_url: slide.image_url,
      image_urls: slide.image_urls,
      text_items: nativeCaptionItems(slide.text_items)
    }))
  });
  return { slideshow, llm_used: true };
}

function insertSlideshow(slideshow, status = 'draft') {
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, slideshow.title, JSON.stringify(slideshow.settings), JSON.stringify(slideshow.slides), status, now, now);
  return { id, created_at: now, updated_at: now, status, ...slideshow };
}

function enqueueSlideshowRender(slideshowId, message = 'Queued') {
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO jobs (id, slideshow_id, type, status, progress, message, created_at, updated_at)
    VALUES (?, ?, 'render', 'queued', 0, ?, ?, ?)`).run(id, slideshowId, message, now, now);
  enqueueRender(id, slideshowId);
  return id;
}

automationRouter.get('/capabilities', (_req, res) => {
  res.json({ llm_enabled: Boolean(config.llm.openaiKey || config.llm.anthropicKey) });
});

automationRouter.post('/generate', async (req, res) => {
  const prompt = req.body.prompt || '';
  const { slideshow, llm_used: llmUsed } = await coreGenerateSlideshowFromPrompt(prompt, coreDefaultRecipe());
  res.json({ ...slideshow, llm_used: llmUsed });
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

automationRouter.get('/recipes', (_req, res) => {
  res.json(db.prepare('SELECT * FROM automation_recipes ORDER BY updated_at DESC').all().map(coreRowToRecipe));
});

automationRouter.post('/recipes', (req, res) => {
  const id = uuid();
  const now = nowIso();
  const recipe = normalizeRecipePayload(req.body);
  db.prepare(`INSERT INTO automation_recipes
    (id, name, slideshow_type, product_name, audience, goal, voice, word_spacing, image_instructions, progression, aspect_ratio, prompt_template, slide_count, export_as_video, transition, image_strategy, output_mode, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    recipe.name,
    recipe.slideshow_type,
    recipe.product_name,
    recipe.audience,
    recipe.goal,
    recipe.voice,
    recipe.word_spacing,
    recipe.image_instructions,
    recipe.progression,
    recipe.aspect_ratio,
    recipe.prompt_template,
    recipe.slide_count,
    recipe.export_as_video ? 1 : 0,
    recipe.transition,
    recipe.image_strategy,
    recipe.output_mode,
    now,
    now
  );
  res.status(201).json(coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(id)));
});

automationRouter.put('/recipes/:id', (req, res) => {
  const existing = coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Automation recipe not found' });
  const next = normalizeRecipePayload(req.body, existing);
  const now = nowIso();
  db.prepare(`UPDATE automation_recipes SET
    name = ?, slideshow_type = ?, product_name = ?, audience = ?, goal = ?, voice = ?,
    word_spacing = ?, image_instructions = ?, progression = ?, aspect_ratio = ?, prompt_template = ?,
    slide_count = ?, export_as_video = ?, transition = ?, image_strategy = ?, output_mode = ?, updated_at = ?
    WHERE id = ?`).run(
    next.name,
    next.slideshow_type,
    next.product_name,
    next.audience,
    next.goal,
    next.voice,
    next.word_spacing,
    next.image_instructions,
    next.progression,
    next.aspect_ratio,
    next.prompt_template,
    next.slide_count,
    next.export_as_video ? 1 : 0,
    next.transition,
    next.image_strategy,
    next.output_mode,
    now,
    req.params.id
  );
  res.json(coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(req.params.id)));
});

automationRouter.delete('/recipes/:id', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE recipe_id = ?').run(req.params.id);
  db.prepare('DELETE FROM automation_recipes WHERE id = ?').run(req.params.id);
  reloadSchedules();
  res.status(204).end();
});

automationRouter.post('/recipes/:id/run', async (req, res) => {
  const recipe = coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(req.params.id));
  if (!recipe) return res.status(404).json({ error: 'Automation recipe not found' });
  const result = await runRecipeAutomation(recipe, req.body.topic || req.body.prompt || '', 'Queued by automation recipe');
  res.status(202).json(result);
});

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToBatchRun(row) {
  if (!row) return null;
  return {
    ...row,
    total_topics: Number(row.total_topics || 0),
    completed_topics: Number(row.completed_topics || 0),
    topics: parseJsonArray(row.topics),
    results: parseJsonArray(row.results)
  };
}

function updateBatchRun(id, patch) {
  const existing = rowToBatchRun(db.prepare('SELECT * FROM automation_batch_runs WHERE id = ?').get(id));
  if (!existing) return null;
  const next = { ...existing, ...patch, updated_at: nowIso() };
  db.prepare(`UPDATE automation_batch_runs SET
    status = ?, total_topics = ?, completed_topics = ?, topics = ?, results = ?, error = ?, updated_at = ?
    WHERE id = ?`).run(
    next.status,
    next.total_topics,
    next.completed_topics,
    JSON.stringify(next.topics || []),
    JSON.stringify(next.results || []),
    next.error || null,
    next.updated_at,
    id
  );
  return next;
}

async function processBatchRun(batchId, recipe, theme, topicCount) {
  try {
    updateBatchRun(batchId, { status: 'generating_topics' });
    const topics = await generateBatchTopics(theme, recipe, topicCount);
    updateBatchRun(batchId, { status: 'generating_slideshows', total_topics: topics.length, topics });

    const results = [];
    for (const topic of topics) {
      const result = await runRecipeAutomation(recipe, topic, `Queued by batch: ${topic.slice(0, 80)}`);
      results.push({
        topic,
        slideshow_id: result.slideshow.id,
        job_id: result.job_id,
        title: result.slideshow.title,
        llm_used: result.llm_used
      });
      updateBatchRun(batchId, { completed_topics: results.length, results });
    }

    updateBatchRun(batchId, { status: 'completed' });
  } catch (error) {
    updateBatchRun(batchId, { status: 'failed', error: error.message });
  }
}

automationRouter.post('/recipes/:id/batch', async (req, res) => {
  const recipe = coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(req.params.id));
  if (!recipe) return res.status(404).json({ error: 'Automation recipe not found' });
  const theme = String(req.body.theme || '').trim();
  if (!theme) return res.status(400).json({ error: 'Add an overarching theme before starting batch mode.' });
  const topicCount = Math.max(1, Math.min(Number(req.body.topic_count || 50), 100));
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO automation_batch_runs
    (id, recipe_id, theme, status, total_topics, completed_topics, topics, results, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, 0, '[]', '[]', ?, ?)`).run(id, recipe.id, theme, topicCount, now, now);
  setImmediate(() => processBatchRun(id, recipe, theme, topicCount));
  res.status(202).json(rowToBatchRun(db.prepare('SELECT * FROM automation_batch_runs WHERE id = ?').get(id)));
});

automationRouter.get('/batch-runs', (_req, res) => {
  res.json(db.prepare('SELECT * FROM automation_batch_runs ORDER BY updated_at DESC LIMIT 20').all().map(rowToBatchRun));
});

automationRouter.post('/batch', async (req, res) => {
  const prompts = String(req.body.prompts || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const created = [];
  for (const prompt of prompts) {
    const { slideshow } = await coreGenerateSlideshowFromPrompt(prompt, coreDefaultRecipe());
    const saved = insertSlideshow(slideshow, 'draft');
    const jobId = enqueueSlideshowRender(saved.id, 'Queued');
    created.push({ slideshow_id: saved.id, job_id: jobId, title: saved.title });
  }
  res.status(202).json(created);
});

function normalizeDays(days) {
  const source = Array.isArray(days) ? days : [];
  return [...new Set(source.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function normalizeTimes(times) {
  const source = Array.isArray(times) ? times : [];
  return [...new Set(source
    .map((time) => String(time || '').trim())
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))]
    .sort();
}

function rowToSchedule(row) {
  if (!row) return null;
  const prompts = parseJsonArray(row.prompts);
  return {
    ...row,
    prompts,
    prompt_index: Number(row.prompt_index || 0),
    days_of_week: normalizeDays(parseJsonArray(row.days_of_week)),
    times: normalizeTimes(parseJsonArray(row.times)),
    enabled: Boolean(row.enabled)
  };
}

function normalizeSchedulePayload(payload = {}, existing = {}) {
  const rawPrompts = payload.prompts ?? existing.prompts ?? [];
  const prompts = Array.isArray(rawPrompts)
    ? rawPrompts.map((p) => String(p).trim()).filter(Boolean)
    : String(rawPrompts).split('\n').map((p) => p.trim()).filter(Boolean);
  return {
    name: String(payload.name ?? existing.name ?? 'Scheduled automation').trim() || 'Scheduled automation',
    prompts,
    topic: prompts[0] ?? String(payload.topic ?? existing.topic ?? '').trim(),
    days_of_week: normalizeDays(payload.days_of_week ?? existing.days_of_week ?? [1, 2, 3, 4, 5]),
    times: normalizeTimes(payload.times ?? existing.times ?? ['09:00']),
    timezone: String(payload.timezone ?? existing.timezone ?? 'local').trim() || 'local',
    enabled: Boolean(payload.enabled ?? existing.enabled ?? true)
  };
}

function cronFromSchedule(schedule) {
  const [hour = '9', minute = '0'] = (schedule.times[0] || '09:00').split(':');
  const days = schedule.days_of_week.length ? schedule.days_of_week.join(',') : '1-5';
  return `${Number(minute)} ${Number(hour)} * * ${days}`;
}

automationRouter.get('/runs', (_req, res) => {
  const rows = db.prepare(`SELECT jobs.*, slideshows.title, slideshows.created_at AS slideshow_created_at
    FROM jobs JOIN slideshows ON slideshows.id = jobs.slideshow_id
    ORDER BY jobs.updated_at DESC LIMIT 40`).all();
  res.json(rows.map((job) => ({
    ...job,
    output_name: job.output_path ? job.output_path.split('/').pop() : null
  })));
});

automationRouter.get('/recipes/:id/schedules', (req, res) => {
  res.json(db.prepare('SELECT * FROM schedules WHERE recipe_id = ? ORDER BY updated_at DESC').all(req.params.id).map(rowToSchedule));
});

automationRouter.post('/recipes/:id/schedules', (req, res) => {
  const recipe = coreRowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(req.params.id));
  if (!recipe) return res.status(404).json({ error: 'Automation recipe not found' });
  const schedule = normalizeSchedulePayload(req.body);
  if (!schedule.prompts.length) return res.status(400).json({ error: 'Add at least one prompt before scheduling.' });
  if (!schedule.days_of_week.length || !schedule.times.length) return res.status(400).json({ error: 'Choose at least one day and one run time.' });
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO schedules
    (id, name, cron, template_id, recipe_id, topic, days_of_week, times, timezone, prompts, prompt_index, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    schedule.name,
    cronFromSchedule(schedule),
    '',
    recipe.id,
    schedule.topic,
    JSON.stringify(schedule.days_of_week),
    JSON.stringify(schedule.times),
    schedule.timezone,
    JSON.stringify(schedule.prompts),
    0,
    schedule.enabled ? 1 : 0,
    now,
    now
  );
  reloadSchedules();
  res.status(201).json(rowToSchedule(db.prepare('SELECT * FROM schedules WHERE id = ?').get(id)));
});

automationRouter.put('/recipes/:recipeId/schedules/:scheduleId', (req, res) => {
  const existing = rowToSchedule(db.prepare('SELECT * FROM schedules WHERE id = ? AND recipe_id = ?').get(req.params.scheduleId, req.params.recipeId));
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });
  const schedule = normalizeSchedulePayload(req.body, existing);
  if (!schedule.prompts.length) return res.status(400).json({ error: 'Add at least one prompt before scheduling.' });
  if (!schedule.days_of_week.length || !schedule.times.length) return res.status(400).json({ error: 'Choose at least one day and one run time.' });
  const now = nowIso();
  db.prepare(`UPDATE schedules SET name = ?, cron = ?, topic = ?, days_of_week = ?, times = ?, timezone = ?, prompts = ?, enabled = ?, updated_at = ?
    WHERE id = ? AND recipe_id = ?`).run(
    schedule.name,
    cronFromSchedule(schedule),
    schedule.topic,
    JSON.stringify(schedule.days_of_week),
    JSON.stringify(schedule.times),
    schedule.timezone,
    JSON.stringify(schedule.prompts),
    schedule.enabled ? 1 : 0,
    now,
    req.params.scheduleId,
    req.params.recipeId
  );
  reloadSchedules();
  res.json(rowToSchedule(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.scheduleId)));
});

automationRouter.delete('/recipes/:recipeId/schedules/:scheduleId', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id = ? AND recipe_id = ?').run(req.params.scheduleId, req.params.recipeId);
  reloadSchedules();
  res.status(204).end();
});

automationRouter.get('/schedules', (_req, res) => {
  res.json(db.prepare('SELECT * FROM schedules ORDER BY updated_at DESC').all().map(rowToSchedule));
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

automationRouter.patch('/schedules/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const now = nowIso();
  if (req.body.enabled !== undefined) {
    db.prepare('UPDATE schedules SET enabled = ?, updated_at = ? WHERE id = ?').run(req.body.enabled ? 1 : 0, now, req.params.id);
    reloadSchedules();
  }
  res.json(rowToSchedule(db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id)));
});

automationRouter.delete('/schedules/:id', (req, res) => {
  db.prepare('DELETE FROM schedules WHERE id = ?').run(req.params.id);
  reloadSchedules();
  res.status(204).end();
});
