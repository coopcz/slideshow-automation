import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import { config } from '../config.js';
import { db } from '../db/index.js';

function imagePath(image) {
  return path.join(config.uploadsDir, image.filename);
}

async function imageDataUrl(image) {
  const buffer = await sharp(imagePath(image))
    .rotate()
    .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

export async function describeImage(image) {
  if (!config.llm.openaiKey) return '';
  const filePath = imagePath(image);
  if (!fs.existsSync(filePath)) return '';

  const client = new OpenAI({ apiKey: config.llm.openaiKey });
  const response = await client.chat.completions.create({
    model: config.llm.openaiModel,
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Describe this image for matching it to inspirational scripture study slideshow slides. Mention objects, setting, mood, people count, colors, and religious or family-study relevance if visible. One sentence only.'
        },
        { type: 'image_url', image_url: { url: await imageDataUrl(image) } }
      ]
    }]
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

export async function ensureImageDescriptions(limit = 40) {
  const images = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT ?').all(limit);
  const next = [];
  for (const image of images) {
    if (image.description) {
      next.push(image);
      continue;
    }
    const description = await describeImage(image).catch(() => '');
    if (description) {
      db.prepare('UPDATE images SET description = ? WHERE id = ?').run(description, image.id);
      next.push({ ...image, description });
    } else {
      next.push(image);
    }
  }
  return next;
}

function tokenize(value) {
  return new Set(String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []);
}

export function selectBestImage(slide, images, usedIds = new Set()) {
  if (!images.length) return null;
  const slideText = [
    slide.image_hint,
    ...(slide.text_items || []).map((item) => item.text)
  ].join(' ');
  const terms = tokenize(slideText);
  let best = null;
  let bestScore = -1;
  for (const image of images) {
    const imageTerms = tokenize(`${image.original_name} ${image.description}`);
    let score = usedIds.has(image.id) ? -2 : 0;
    for (const term of terms) {
      if (imageTerms.has(term)) score += 2;
    }
    if (/family|home|child|children|study|book|scripture|bible|church|temple|journal|prayer|christ|jesus|light/.test(image.description || '')) {
      score += 1;
    }
    if (score > bestScore) {
      best = image;
      bestScore = score;
    }
  }
  return best || images[0];
}
