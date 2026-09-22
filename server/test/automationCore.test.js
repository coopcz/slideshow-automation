import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applySlideshowRevision, buildSchemaPrompt, defaultRecipe, generateBatchTopics, normalizeRecipePayload } from '../src/automation/core.js';
import { config } from '../src/config.js';
import { cronExpressionForTime } from '../src/scheduler.js';

test('normalizeRecipePayload clamps and defaults recipe settings', () => {
  const recipe = normalizeRecipePayload({
    name: '',
    slide_count: 99,
    word_spacing: 'verbose',
    aspect_ratio: '3:2',
    export_as_video: true
  });

  assert.equal(recipe.name, defaultRecipe().name);
  assert.equal(recipe.slide_count, 15);
  assert.equal(recipe.word_spacing, 'balanced');
  assert.equal(recipe.aspect_ratio, '9:16');
  assert.equal(recipe.export_as_video, true);
});

test('buildSchemaPrompt includes automation creative controls', () => {
  const recipe = normalizeRecipePayload({
    product_name: 'Example App',
    slideshow_type: 'tutorial',
    word_spacing: 'concise',
    image_instructions: 'Use bright product screenshots and family study photos.',
    progression: 'Problem, insight, workflow, result.',
    slide_count: 6
  });
  const prompt = buildSchemaPrompt('Topic goes here', [], recipe);

  assert.match(prompt, /tutorial slideshow for Example App/);
  assert.match(prompt, /Caption spacing: concise/);
  assert.match(prompt, /Use bright product screenshots/);
  assert.match(prompt, /Problem, insight, workflow, result/);
  assert.match(prompt, /Create exactly 7 slides in this fixed structure/);
  assert.match(prompt, /Slides 2 through 7 contain six numbered teaching points/);
  assert.match(prompt, /sixth-grade reading level/);
  assert.match(prompt, /parents and older Church members/);
});

test('applySlideshowRevision changes copy while preserving slide design and images', () => {
  const slideshow = {
    title: 'Original title',
    settings: { aspect_ratio: '9:16' },
    slides: [{
      id: 'slide-1',
      order: 0,
      image_url: '/uploads/photo.jpg',
      overrides: { background_opacity: 12 },
      text_items: [
        { id: 'headline-1', order: 0, role: 'headline', text: 'Hard wording', font: 'TikTokSans-Regular' },
        { id: 'body-1', order: 1, role: 'body', text: 'An unnecessarily complicated explanation.', font: 'TikTokSans-Regular' }
      ]
    }]
  };
  const revised = applySlideshowRevision(slideshow, {
    title: 'Clear title',
    slides: [{ order: 0, headline: 'Simple wording', body: 'A clear explanation for families.' }]
  });

  assert.equal(revised.title, 'Clear title');
  assert.equal(revised.slides[0].id, 'slide-1');
  assert.equal(revised.slides[0].image_url, '/uploads/photo.jpg');
  assert.deepEqual(revised.slides[0].overrides, { background_opacity: 12 });
  assert.equal(revised.slides[0].text_items[0].id, 'headline-1');
  assert.equal(revised.slides[0].text_items[0].text, 'Simple wording');
  assert.equal(revised.slides[0].text_items[1].text, 'A clear explanation for families.');
});

test('cronExpressionForTime creates one precise weekly expression per selected time', () => {
  assert.equal(cronExpressionForTime('10:30', [1, 3, 5]), '30 10 * * 1,3,5');
});

test('generateBatchTopics falls back to requested theme without an LLM key', async () => {
  const openaiKey = config.llm.openaiKey;
  const anthropicKey = config.llm.anthropicKey;
  config.llm.openaiKey = '';
  config.llm.anthropicKey = '';
  try {
    const topics = await generateBatchTopics('Book of Mormon study habits', defaultRecipe(), 3);

    assert.equal(topics.length, 3);
    assert.match(topics[0], /Book of Mormon study habits/);
  } finally {
    config.llm.openaiKey = openaiKey;
    config.llm.anthropicKey = anthropicKey;
  }
});
