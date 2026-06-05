import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import sharp from 'sharp';
import { config } from '../config.js';

function imagePath(image) {
  return path.join(config.uploadsDir, image.filename);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(error, attempt) {
  const message = String(error?.message || '');
  const msMatch = message.match(/try again in (\d+)ms/i);
  if (msMatch) return Number(msMatch[1]) + 1000;
  const secondMatch = message.match(/try again in ([\d.]+)s/i);
  if (secondMatch) return Math.ceil(Number(secondMatch[1]) * 1000) + 1000;
  return Math.min(30000, 1500 * 2 ** attempt);
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
    model: config.llm.imageDescriptionModel,
    max_tokens: 120,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Describe this image for matching it to scripture study slideshow slides. Mention visible people, objects, setting, actions, era or story clues, mood, colors, and any scripture, religious, family, study, or app relevance. Be concrete and visual. One sentence only.'
        },
        { type: 'image_url', image_url: { url: await imageDataUrl(image) } }
      ]
    }]
  });
  return response.choices[0]?.message?.content?.trim() || '';
}

async function describeImageWithRetry(image) {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await describeImage(image);
    } catch (error) {
      lastError = error;
      const status = error?.status;
      const retryable = status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || error?.code === 'ENOTFOUND';
      if (!retryable || attempt === 4) break;
      const delay = retryDelay(error, attempt);
      console.warn(`Image description retry ${attempt + 1}/5 for ${image.original_name} after ${delay}ms: ${error.message}`);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function ensureImageDescriptions(limit = 120) {
  const { db } = await import('../db/index.js');
  const images = db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT ?').all(limit);
  const next = [];
  for (const image of images) {
    if (image.description) {
      next.push(image);
      continue;
    }
    let description = '';
    try {
      description = await describeImageWithRetry(image);
    } catch (error) {
      console.warn(`Image description failed for ${image.original_name}: ${error.message}`);
    }
    if (description) {
      db.prepare('UPDATE images SET description = ? WHERE id = ?').run(description, image.id);
      next.push({ ...image, description });
    } else {
      next.push(image);
    }
  }
  return next;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have',
  'how', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'this',
  'to', 'with', 'you', 'your'
]);

const RELATED_TERMS = {
  bible: ['book', 'scripture', 'study', 'pages'],
  child: ['children', 'family', 'home'],
  children: ['child', 'family', 'home'],
  christ: ['jesus', 'light', 'faith'],
  church: ['chapel', 'temple', 'worship'],
  faith: ['light', 'prayer', 'worship'],
  family: ['home', 'children', 'child', 'parents'],
  jesus: ['christ', 'light', 'faith'],
  journal: ['notebook', 'writing', 'study'],
  prayer: ['kneeling', 'hands', 'faith', 'light'],
  scripture: ['bible', 'book', 'study', 'pages'],
  study: ['book', 'scripture', 'bible', 'journal'],
  temple: ['church', 'chapel', 'worship']
};

function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/ies$/, 'y')
    .replace(/(ing|ed)$/, '')
    .replace(/s$/, '');
}

function terms(value) {
  return (String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [])
    .map(normalizeTerm)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));
}

function weightedTerms(parts) {
  const weights = new Map();
  for (const [value, weight] of parts) {
    for (const term of terms(value)) {
      weights.set(term, (weights.get(term) || 0) + weight);
      for (const related of RELATED_TERMS[term] || []) {
        weights.set(related, (weights.get(related) || 0) + weight * 0.45);
      }
    }
  }
  return weights;
}

function imageTermFrequencies(images) {
  const frequencies = new Map();
  for (const image of images) {
    const imageText = `${image.original_name} ${image.description}`;
    for (const term of new Set(terms(imageText))) {
      frequencies.set(term, (frequencies.get(term) || 0) + 1);
    }
  }
  return frequencies;
}

export function selectBestImage(slide, images, usedIds = new Set()) {
  if (!images.length) return null;
  const pool = images.some((image) => !usedIds.has(image.id))
    ? images.filter((image) => !usedIds.has(image.id))
    : images;
  const frequencies = imageTermFrequencies(images);
  const slideWeights = weightedTerms([
    [slide.image_hint, 4],
    [(slide.text_items || []).map((item) => item.text).join(' '), 2],
    [slide.topic_context, 1.5],
    [slide.requested_image_context, 0.25]
  ]);
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const image of pool) {
    const imageText = `${image.original_name} ${image.description}`;
    const imageTerms = new Set(terms(imageText));
    let score = usedIds.has(image.id) ? -2 : 0;
    for (const [term, weight] of slideWeights) {
      if (imageTerms.has(term)) {
        const frequency = frequencies.get(term) || 1;
        score += weight * (1 + Math.log(images.length / frequency));
      }
    }

    const lowerImageText = imageText.toLowerCase();
    const hintWords = terms(slide.image_hint);
    if (hintWords.length && hintWords.every((term) => lowerImageText.includes(term))) {
      score += 4;
    }
    if (/family|home|child|children|study|book|scripture|bible|church|temple|journal|prayer|christ|jesus|light/.test(lowerImageText)) {
      score += 1;
    }
    if (score > bestScore) {
      best = image;
      bestScore = score;
    }
  }
  return best || pool[0] || images[0];
}
