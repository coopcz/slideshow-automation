import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import { db, nowIso } from '../db/index.js';
import { config } from '../config.js';
import { createSlide, createTextItem, defaultSettings, normalizeSlideshow } from '../model/defaults.js';
import { enqueueRender } from '../queue/renderQueue.js';
import { ensureImageDescriptions, selectBestImage } from '../ai/imageLibrary.js';

export function defaultRecipe() {
  return {
    name: 'Latter Study evergreen slideshow',
    slideshow_type: 'educational',
    product_name: 'Latter Study',
    audience: 'LDS individuals and families who want consistent scripture study',
    goal: 'Promote Latter Study as a faithful AI-assisted scripture study app while teaching useful gospel study ideas.',
    voice: 'Faithful, thoughtful, respectful, practical, never combative.',
    word_spacing: 'balanced',
    image_instructions: 'Choose concrete scripture study, family, faith, learning, object, setting, or story images that support each slide.',
    progression: 'Hook the viewer, explain the study principle, show why it matters, give practical application, then mention the product naturally near the end.',
    aspect_ratio: '9:16',
    prompt_template: 'Create a slideshow about {{topic}}. Connect the lesson to consistent scripture study for individuals and families, and naturally mention {{product_name}} near the end.',
    slide_count: 8,
    export_as_video: false,
    transition: 'none',
    image_strategy: 'relevant',
    output_mode: 'editable_and_render'
  };
}

function stringValue(value, fallback) {
  const next = String(value ?? '').trim();
  return next || fallback;
}

function enumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function normalizeRecipePayload(payload = {}, existing = null) {
  const defaults = existing || defaultRecipe();
  return {
    ...defaults,
    ...payload,
    name: stringValue(payload.name ?? defaults.name, defaultRecipe().name),
    slideshow_type: enumValue(payload.slideshow_type ?? defaults.slideshow_type, ['educational', 'product', 'story', 'promo', 'tutorial', 'testimonial'], defaultRecipe().slideshow_type),
    product_name: stringValue(payload.product_name ?? defaults.product_name, defaultRecipe().product_name),
    audience: stringValue(payload.audience ?? defaults.audience, defaultRecipe().audience),
    goal: stringValue(payload.goal ?? defaults.goal, defaultRecipe().goal),
    voice: stringValue(payload.voice ?? defaults.voice, defaultRecipe().voice),
    word_spacing: enumValue(payload.word_spacing ?? defaults.word_spacing, ['concise', 'balanced', 'detailed'], defaultRecipe().word_spacing),
    image_instructions: stringValue(payload.image_instructions ?? defaults.image_instructions, defaultRecipe().image_instructions),
    progression: stringValue(payload.progression ?? defaults.progression, defaultRecipe().progression),
    aspect_ratio: enumValue(payload.aspect_ratio ?? defaults.aspect_ratio, ['4:5', '9:16', '1:1', '16:9'], defaultRecipe().aspect_ratio),
    prompt_template: stringValue(payload.prompt_template ?? defaults.prompt_template, defaultRecipe().prompt_template),
    slide_count: Math.max(3, Math.min(Number(payload.slide_count ?? defaults.slide_count), 15)),
    export_as_video: Boolean(payload.export_as_video ?? defaults.export_as_video),
    transition: enumValue(payload.transition ?? defaults.transition, ['none', 'fade'], defaultRecipe().transition),
    image_strategy: enumValue(payload.image_strategy ?? defaults.image_strategy, ['relevant', 'literal', 'varied', 'product_first'], defaultRecipe().image_strategy),
    output_mode: enumValue(payload.output_mode ?? defaults.output_mode, ['editable_and_render', 'editable_only'], defaultRecipe().output_mode)
  };
}

export function rowToRecipe(row) {
  if (!row) return null;
  return normalizeRecipePayload({
    ...row,
    slide_count: Number(row.slide_count),
    export_as_video: Boolean(row.export_as_video)
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
  return 'For each slide, return image_id as an empty string. Write image_hint as a concrete visual search phrase describing the ideal uploaded local-library image for that slide. A separate matching step will choose images from the local library after the slide text is finalized.';
}

function captionGuidance(recipe) {
  if (recipe.word_spacing === 'concise') return 'Keep each slide to 8 to 16 words total. Use short lines with generous visual breathing room.';
  if (recipe.word_spacing === 'detailed') return 'Use 18 to 32 words total per slide, split into two readable lines when helpful.';
  return 'Use 14 to 24 words total per slide, split into one hook line and one support line when helpful.';
}

export function buildSchemaPrompt(prompt, images = [], recipe = defaultRecipe()) {
  return `Create a ${recipe.slideshow_type} slideshow for ${recipe.product_name}.

Audience: ${recipe.audience}
Goal: ${recipe.goal}
Voice: ${recipe.voice}
Required slide count: ${recipe.slide_count}
Caption spacing: ${recipe.word_spacing}. ${captionGuidance(recipe)}
Progression: ${recipe.progression}
Image instructions: ${recipe.image_instructions}
Image strategy: ${recipe.image_strategy}

Create exactly ${recipe.slide_count} slides. Each slide should have exactly one text item. Keep the copy readable on a phone, avoid background text styles, and make the product placement feel natural instead of repeated. If the topic is sensitive or controversial, frame claims carefully and focus on learning, context, scripture, and sincere discipleship.

Use TikTokSans-Regular, outline, center alignment, center position, and 80% width for every text item.

${imagePromptBlock(images)}

User request:
${prompt}`;
}

async function callLlm(prompt, images = [], recipe = defaultRecipe()) {
  const schemaPrompt = buildSchemaPrompt(prompt, images, recipe);
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
      max_tokens: 2200,
      messages: [{ role: 'user', content: schemaPrompt }]
    });
    return JSON.parse(response.content[0].text);
  }
  return null;
}

function fallbackGenerated(prompt, recipe = defaultRecipe()) {
  const count = Math.max(3, Math.min(Number(recipe.slide_count || 8), 15));
  return normalizeSlideshow({
    title: prompt.slice(0, 70) || 'Generated slideshow',
    settings: {
      ...defaultSettings,
      aspect_ratio: recipe.aspect_ratio,
      export_as_video: Boolean(recipe.export_as_video),
      transition: recipe.transition || 'none'
    },
    slides: Array.from({ length: count }, (_, index) => createSlide({
      order: index,
      image_hint: index === 0 ? recipe.image_instructions : recipe.progression,
      text_items: [createTextItem({
        order: 0,
        text: index === 0 ? prompt : `Point ${index + 1}`,
        font_size: index === 0 ? 'extra_large' : 'large',
        text_style: 'outline',
        text_position: 'center'
      })]
    }))
  });
}

function imageLibraryPrompt(images) {
  return images.map((image) => {
    const description = String(image.description || '').slice(0, 300);
    return `- ${image.id}: ${image.original_name}${description ? ` - ${description}` : ''}`;
  }).join('\n');
}

function slideMatchingPrompt(slides) {
  return slides.map((slide, index) => {
    const text = (slide.text_items || []).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim();
    return `Slide ${slide.order ?? index}: hint="${slide.image_hint || ''}" text="${text}"`;
  }).join('\n');
}

async function matchImagesWithLlm(slides, images, topicContext = '', recipe = defaultRecipe()) {
  if (!config.llm.openaiKey || !images.length || !slides.length) return new Map();
  const client = new OpenAI({ apiKey: config.llm.openaiKey });
  const prompt = `Choose the best local image for each generated slideshow slide.

Topic/request:
${topicContext}

Recipe image instructions:
${recipe.image_instructions}

Rules:
- Match visible image content to the slide text, image hint, and recipe instructions.
- Prefer concrete story, setting, object, action, mood, and product relevance over generic imagery.
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

function applyImages(slides, images, topicContext = '', recipe = defaultRecipe(), preferredImageIds = new Map()) {
  const byId = new Map(images.map((image) => [image.id, image]));
  const used = new Set();
  return slides.map((slide, index) => {
    const preferred = byId.get(preferredImageIds.get(Number(slide.order ?? index)));
    const requested = byId.get(slide.image_id);
    const scoringSlide = {
      ...slide,
      topic_context: `${topicContext} ${recipe.image_instructions} ${recipe.progression}`,
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

function nativeCaptionItems(items = [], recipe = defaultRecipe()) {
  const text = items
    .map((item) => String(item.text || '').trim())
    .filter(Boolean)
    .join('\n');

  const fontSize = recipe.word_spacing === 'detailed' || text.length > 130 ? 'medium' : 'large';
  const textWidth = recipe.word_spacing === 'concise' ? '80%' : '100%';

  return [createTextItem({
    order: 0,
    text,
    font: 'TikTokSans-Regular',
    font_size: fontSize,
    text_style: 'outline',
    text_position: 'center',
    text_alignment: 'center',
    text_width: textWidth
  })];
}

export function recipePrompt(recipe, topic = '') {
  const base = recipe.prompt_template || defaultRecipe().prompt_template;
  return base
    .replaceAll('{{topic}}', topic || 'a timely scripture study topic')
    .replaceAll('{{product_name}}', recipe.product_name || defaultRecipe().product_name)
    .replaceAll('{{audience}}', recipe.audience || defaultRecipe().audience)
    .replaceAll('{{goal}}', recipe.goal || defaultRecipe().goal)
    .replaceAll('{{voice}}', recipe.voice || defaultRecipe().voice);
}

export async function generateSlideshowFromPrompt(prompt, recipeInput = defaultRecipe()) {
  const recipe = normalizeRecipePayload(recipeInput);
  const images = await ensureImageDescriptions().catch((error) => {
    console.warn(`Image description indexing failed: ${error.message}`);
    return db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 120').all();
  });
  const generated = await callLlm(prompt, images, recipe).catch(() => null);
  if (!generated) {
    const fallback = fallbackGenerated(prompt, recipe);
    fallback.slides = applyImages(fallback.slides, images, prompt, recipe);
    return { slideshow: fallback, llm_used: false };
  }
  const preferredImageIds = await matchImagesWithLlm(generated.slides, images, prompt, recipe).catch((error) => {
    console.warn(`LLM image matching failed, falling back to local scorer: ${error.message}`);
    return new Map();
  });
  const slideshow = normalizeSlideshow({
    title: generated.title,
    settings: {
      ...defaultSettings,
      aspect_ratio: recipe.aspect_ratio,
      export_as_video: Boolean(recipe.export_as_video),
      transition: recipe.transition || 'none'
    },
    slides: applyImages(generated.slides, images, prompt, recipe, preferredImageIds).map((slide, index) => createSlide({
      order: index,
      image_url: slide.image_url,
      image_urls: slide.image_urls,
      text_items: nativeCaptionItems(slide.text_items, recipe)
    }))
  });
  return { slideshow, llm_used: true };
}

export function insertSlideshow(slideshow, status = 'draft') {
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, slideshow.title, JSON.stringify(slideshow.settings), JSON.stringify(slideshow.slides), status, now, now);
  return { id, created_at: now, updated_at: now, status, ...slideshow };
}

export function enqueueSlideshowRender(slideshowId, message = 'Queued') {
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO jobs (id, slideshow_id, type, status, progress, message, created_at, updated_at)
    VALUES (?, ?, 'render', 'queued', 0, ?, ?, ?)`).run(id, slideshowId, message, now, now);
  enqueueRender(id, slideshowId);
  return id;
}

export async function runRecipeAutomation(recipe, topic = '', message = 'Queued by automation recipe') {
  const normalized = normalizeRecipePayload(recipe);
  const prompt = recipePrompt(normalized, topic);
  const { slideshow, llm_used: llmUsed } = await generateSlideshowFromPrompt(prompt, normalized);
  const saved = insertSlideshow(slideshow, 'draft');
  let jobId = null;
  if (normalized.output_mode !== 'editable_only') {
    jobId = enqueueSlideshowRender(saved.id, message);
  }
  db.prepare('UPDATE automation_recipes SET last_run_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), normalized.id);
  return { slideshow: saved, job_id: jobId, llm_used: llmUsed };
}
