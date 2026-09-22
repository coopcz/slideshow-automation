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
    audience: 'LDS parents and older Church members who want scripture study to feel useful, clear, realistic, and spiritually grounded',
    goal: 'Help an LDS mom teach or apply one specific gospel insight, with a quiet and natural mention of Latter Study only when it genuinely fits.',
    voice: 'Write like a thoughtful LDS mom explaining one helpful idea to a friend. Warm, specific, plainspoken, doctrinally careful, easy for parents and older adults to follow, never preachy, salesy, combative, childish, or over-polished.',
    word_spacing: 'balanced',
    image_instructions: 'Choose concrete scripture study, family, faith, learning, object, setting, or story images that support each slide.',
    progression: 'Use one cover slide followed by six numbered teaching points. Each point needs a short headline and one useful supporting sentence.',
    aspect_ratio: '9:16',
    prompt_template: 'Create a slideshow about {{topic}}. Connect the lesson to consistent scripture study for individuals and families, and naturally mention {{product_name}} near the end.',
    slide_count: 7,
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
            purpose: { type: 'string', enum: ['cover', 'context', 'insight', 'example', 'practice', 'reflection', 'close'] },
            image_id: { type: 'string' },
            image_hint: { type: 'string' },
            headline: { type: 'string' },
            body: { type: 'string' },
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
          required: ['order', 'purpose', 'image_id', 'image_hint', 'headline', 'body', 'text_items']
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

const topicBatchSchema = {
  name: 'slideshow_batch_topics',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      topics: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['topics']
  }
};

const slideshowRevisionSchema = {
  name: 'slideshow_copy_revision',
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
            headline: { type: 'string' },
            body: { type: 'string' }
          },
          required: ['order', 'headline', 'body']
        }
      }
    },
    required: ['title', 'slides']
  }
};

function imagePromptBlock(images) {
  if (!images.length) return 'No local images are available. Return image_id as an empty string.';
  return 'For each slide, return image_id as an empty string. Write image_hint as a concrete visual search phrase describing the ideal uploaded local-library image for that slide. A separate matching step will choose images from the local library after the slide text is finalized.';
}

function captionGuidance(recipe) {
  if (recipe.word_spacing === 'concise') return 'Use a 3 to 7 word headline and no more than 10 body words.';
  if (recipe.word_spacing === 'detailed') return 'Use a 3 to 8 word headline and 10 to 18 body words.';
  return 'Use a 3 to 8 word headline and 8 to 16 body words.';
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

Create exactly 7 slides in this fixed structure:
- Slide 1 is the cover. Its headline is "6 Things We Learn from [specific topic]" or an equally clear title. Its body is exactly "Brought to you by ${recipe.product_name}".
- Slides 2 through 7 contain six numbered teaching points. Start each headline with its number, for example "1. Joseph heard the same message again".
- Each numbered slide has one direct supporting sentence of 8 to 16 words.
- Return a concrete, different full-screen image hint for every slide.
- Set purpose to cover for slide 1. Use the other purposes naturally for the six teaching slides.
- Return text_items as an empty array; the app applies the fixed TikTok typography.

Human writing rules:
- Sound like one real LDS mom with lived experience, not a ministry brand or a generic inspirational account.
- Write for busy parents and older Church members. Use familiar everyday words, short sentences, and one clear idea at a time.
- Aim for roughly a sixth-grade reading level without sounding childish or talking down to the reader.
- Prefer direct wording such as "This helps us notice..." over abstract wording such as "This facilitates deeper spiritual comprehension."
- Keep common LDS terms when they are the clearest words, but avoid academic, theological, corporate, and therapy-style language.
- Make every slide advance the thought. Do not restate the hook, recycle the same lesson, or use interchangeable captions.
- Use concrete details such as a rushed morning, a child asking a blunt question, a verse read differently, a Primary lesson, family scripture study, or a quiet prompting when relevant.
- Do not fabricate a personal anecdote, a child's words, or a testimony. If the user did not supply a real experience, use an honest scenario such as "If your child says..." or "Some mornings..." rather than pretending it happened to the creator.
- Never use I, me, my, we, or our unless the user supplied that exact lived experience. A warm human voice does not require a fake first-person story.
- Vary sentence length and slide purpose. Do not make every slide a tip, a question, or a motivational statement.
- Avoid rhetorical filler, slogans, em dashes, semicolons, hashtags, clickbait, and formulaic three-part lists.
- Never invent quotations, doctrine, scripture references, historical claims, or personal testimony. When a reference is important, name it accurately and conservatively.
- Mention ${recipe.product_name} only in the cover body. Do not mention it again.
- Keep the copy readable on a phone.

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

function revisionPrompt(slideshow, instruction) {
  const currentCopy = {
    title: slideshow.title,
    slides: slideshow.slides.map((slide, index) => {
      const items = [...(slide.text_items || [])].sort((a, b) => a.order - b.order);
      return {
        order: index,
        headline: String(items[0]?.text || ''),
        body: items.slice(1).map((item) => item.text).join(' ').trim()
      };
    })
  };

  return `Revise the wording of an existing LDS TikTok slideshow.

The user's editing instruction:
${instruction}

Always follow these writing standards:
- Write for LDS parents and older Church members.
- Use familiar everyday words, short sentences, active voice, and one idea at a time.
- Aim for roughly a sixth-grade reading level without sounding childish or patronizing.
- Keep headlines to about 3 to 8 words and supporting sentences to about 8 to 16 words.
- Sound like a thoughtful LDS mom helping a friend: warm, natural, specific, and doctrinally careful.
- Avoid academic, theological, corporate, therapy-style, trendy, flowery, or vague wording.
- Preserve the intended doctrine and factual meaning. Never invent scripture quotations, references, history, personal stories, or testimony.
- Keep every slide meaningfully different. Do not repeat the same lesson in new words.
- Preserve the number at the beginning of numbered headlines unless the user clearly asks for a different structure.
- Preserve any existing "Brought to you by" attribution unless the user specifically asks to change it.
- Return exactly ${currentCopy.slides.length} slides in the same order. Do not add, remove, or combine slides.
- Change only the title and wording. Images, formatting, and layout are preserved by the app.

Current slideshow copy:
${JSON.stringify(currentCopy, null, 2)}`;
}

function parseJsonText(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

async function callRevisionLlm(slideshow, instruction) {
  const prompt = revisionPrompt(slideshow, instruction);
  if (config.llm.openaiKey) {
    const client = new OpenAI({ apiKey: config.llm.openaiKey });
    const response = await client.chat.completions.create({
      model: config.llm.openaiModel,
      response_format: { type: 'json_schema', json_schema: slideshowRevisionSchema },
      messages: [{ role: 'user', content: prompt }]
    });
    return parseJsonText(response.choices[0].message.content);
  }
  if (config.llm.anthropicKey) {
    const client = new Anthropic({ apiKey: config.llm.anthropicKey });
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1800,
      messages: [{ role: 'user', content: `${prompt}\n\nReturn only JSON with this shape: {"title":"...","slides":[{"order":0,"headline":"...","body":"..."}]}` }]
    });
    return parseJsonText(response.content[0]?.text);
  }
  throw new Error('Connect an OpenAI or Anthropic API key before using AI revisions.');
}

function revisedTextItems(slide, revision) {
  const existing = [...(slide.text_items || [])].sort((a, b) => a.order - b.order);
  const headline = String(revision?.headline || existing[0]?.text || '').trim();
  const body = String(revision?.body || '').trim();
  const headlineItem = {
    ...(existing[0] || createTextItem({ role: 'headline' })),
    text: headline,
    role: 'headline',
    order: 0
  };
  if (!body) return [headlineItem];
  const bodyItem = {
    ...(existing[1] || createTextItem({ role: 'body', font_size: 'large' })),
    text: body,
    role: 'body',
    order: 1
  };
  return [headlineItem, bodyItem];
}

export function applySlideshowRevision(slideshow, revision) {
  const revisions = new Map((revision?.slides || []).map((slide) => [Number(slide.order), slide]));
  return {
    ...slideshow,
    title: String(revision?.title || slideshow.title).trim() || slideshow.title,
    slides: slideshow.slides.map((slide, index) => ({
      ...slide,
      text_items: revisedTextItems(slide, revisions.get(index))
    }))
  };
}

export async function reviseSlideshowCopy(slideshow, instruction) {
  const cleanInstruction = String(instruction || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!cleanInstruction) throw new Error('Add an instruction for the AI first.');
  const revision = await callRevisionLlm(slideshow, cleanInstruction);
  if (!Array.isArray(revision?.slides) || revision.slides.length !== slideshow.slides.length) {
    throw new Error('The AI returned the wrong number of slides. Please try again.');
  }
  return applySlideshowRevision(slideshow, revision);
}

function fallbackTopics(theme, count) {
  const base = String(theme || '').trim() || 'scripture study';
  const angles = [
    'a question a child might ask', 'a verse that lands differently as a mom', 'a five minute family study reset',
    'a common scripture study guilt trap', 'a quiet lesson from an ordinary morning', 'context that changes how a familiar verse reads',
    'what to do when family study goes sideways', 'a simple Come Follow Me conversation', 'a gospel principle for an exhausted parent',
    'a faithful response to a hard question', 'a small habit that makes study more honest', 'a lesson worth saving for Sunday'
  ];
  return Array.from({ length: count }, (_, index) => `${base}: ${angles[index % angles.length]}${index >= angles.length ? ` (${Math.floor(index / angles.length) + 1})` : ''}`);
}

function topicTokens(value) {
  return new Set(String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3));
}

function topicSimilarity(left, right) {
  const a = topicTokens(left);
  const b = topicTokens(right);
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function normalizeTopics(topics, theme, count) {
  const seen = new Set();
  const clean = [];
  for (const rawTopic of Array.isArray(topics) ? topics : []) {
    const topic = String(rawTopic || '').replace(/\s+/g, ' ').trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key) || clean.some((existing) => topicSimilarity(existing, topic) >= 0.62)) continue;
    seen.add(key);
    clean.push(topic);
    if (clean.length === count) break;
  }
  if (clean.length >= count) return clean;
  return [...clean, ...fallbackTopics(theme, count - clean.length)];
}

function topicGenerationPrompt(recipe, theme, count) {
  const recentTitles = db.prepare('SELECT title FROM slideshows ORDER BY created_at DESC LIMIT 80').all().map((row) => row.title).filter(Boolean);
  return `Generate ${count} distinct slideshow topics for a batch automation run.

Overarching theme:
${theme}

Recipe context:
- Type: ${recipe.slideshow_type}
- Product: ${recipe.product_name}
- Audience: ${recipe.audience}
- Goal: ${recipe.goal}
- Voice: ${recipe.voice}
- Progression: ${recipe.progression}

Recent slideshow titles to avoid repeating or lightly rewording:
${recentTitles.length ? recentTitles.map((title) => `- ${title}`).join('\n') : '- None yet'}

Each topic must have a distinct human situation, scripture-study question, doctrinal lens, family moment, or practical outcome. A different verse pasted into the same topic pattern does not count as unique. Avoid generic themes such as "finding peace," "trusting God," or "making scripture study a habit" unless the topic includes a sharply specific angle. Avoid duplicates, numbering, and title formulas. Keep each topic under 90 characters.`;
}

export async function generateBatchTopics(theme, recipeInput = defaultRecipe(), count = 50) {
  const recipe = normalizeRecipePayload(recipeInput);
  const topicCount = Math.max(1, Math.min(Number(count || 50), 100));
  const prompt = topicGenerationPrompt(recipe, theme, topicCount);

  if (config.llm.openaiKey) {
    const client = new OpenAI({ apiKey: config.llm.openaiKey });
    const response = await client.chat.completions.create({
      model: config.llm.openaiModel,
      response_format: { type: 'json_schema', json_schema: topicBatchSchema },
      messages: [{ role: 'user', content: prompt }]
    });
    const parsed = JSON.parse(response.choices[0].message.content);
    return normalizeTopics(parsed.topics, theme, topicCount);
  }

  if (config.llm.anthropicKey) {
    const client = new Anthropic({ apiKey: config.llm.anthropicKey });
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 2200,
      messages: [{ role: 'user', content: `${prompt}\n\nReturn only JSON in this exact shape: {"topics":["topic"]}` }]
    });
    const parsed = JSON.parse(response.content[0].text);
    return normalizeTopics(parsed.topics, theme, topicCount);
  }

  return fallbackTopics(theme, topicCount);
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

function nativeCaptionItems(slide = {}, recipe = defaultRecipe()) {
  const sourceText = (slide.text_items || []).map((item) => String(item.text || '').trim()).filter(Boolean);
  const headline = String(slide.headline || sourceText[0] || '').trim();
  const body = String(slide.body || sourceText.slice(1).join(' ') || '').trim();
  const headlineSize = headline.length > 58 ? 'large' : 'extra_large';
  const centered = true;
  const items = [createTextItem({
    order: 0,
    role: 'headline',
    text: headline,
    font: 'TikTokSans-Regular',
    font_size: headlineSize,
    text_style: 'outline',
    text_position: 'center',
    text_alignment: centered ? 'center' : 'left',
    text_width: '100%'
  })];
  if (body) items.push(createTextItem({
    order: 1,
    role: 'body',
    text: body,
    font: 'TikTokSans-Regular',
    font_size: body.length > 105 ? 'medium' : 'large',
    text_style: 'outline',
    text_position: 'center',
    text_alignment: centered ? 'center' : 'left',
    text_width: '100%'
  }));
  return items;
}

function compositionForSlide(slide = {}, index = 0) {
  const purpose = slide.purpose || (index === 0 ? 'hook' : 'insight');
  const positionByPurpose = {
    cover: 'center',
    context: 'bottom',
    insight: 'top',
    example: 'bottom',
    practice: 'center',
    reflection: 'center',
    close: 'center'
  };
  return {
    aspect_ratio: null,
    text_position: positionByPurpose[purpose] || 'center',
    is_bg_overlay_on: true,
    background_opacity: 12
  };
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
      transition: recipe.transition || 'none',
      is_bg_overlay_on: true,
      background_opacity: 12
    },
    slides: applyImages(generated.slides, images, prompt, recipe, preferredImageIds).map((slide, index) => createSlide({
      order: index,
      image_url: slide.image_url,
      image_urls: slide.image_urls,
      purpose: slide.purpose,
      image_hint: slide.image_hint,
      overrides: compositionForSlide(slide, index),
      text_items: nativeCaptionItems(slide, recipe)
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
