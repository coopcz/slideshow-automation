import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectBestImage } from '../src/ai/imageLibrary.js';

const images = [
  {
    id: 'family',
    original_name: 'family-home-study.jpg',
    description: 'Parents and children reading scripture together at a kitchen table.',
    url: '/uploads/family.jpg'
  },
  {
    id: 'temple',
    original_name: 'temple-evening.jpg',
    description: 'A bright temple exterior at sunset with warm light and a peaceful sky.',
    url: '/uploads/temple.jpg'
  },
  {
    id: 'journal',
    original_name: 'study-journal.jpg',
    description: 'An open notebook and Bible on a desk for quiet scripture study.',
    url: '/uploads/journal.jpg'
  },
  {
    id: 'sheep',
    original_name: 'lost-sheep-hillside.jpg',
    description: 'A white sheep standing alone on a green hillside, suggesting the parable of the lost sheep.',
    url: '/uploads/sheep.jpg'
  }
];

test('selectBestImage matches the slide visual hint and caption', () => {
  const selected = selectBestImage({
    image_hint: 'family scripture study at home',
    text_items: [{ text: 'Make scripture study easier for your family tonight.' }]
  }, images);

  assert.equal(selected.id, 'family');
});

test('selectBestImage avoids reused images while unused options remain', () => {
  const selected = selectBestImage({
    image_hint: 'family scripture study at home',
    text_items: [{ text: 'Make scripture study easier for your family tonight.' }]
  }, images, new Set(['family']));

  assert.notEqual(selected.id, 'family');
});

test('selectBestImage prioritizes generated slide text over stale requested image context', () => {
  const selected = selectBestImage({
    image_hint: 'one sheep on a hillside',
    requested_image_context: 'family-home-study.jpg Parents and children reading scripture together at a kitchen table.',
    text_items: [{ text: 'The lost sheep parable shows how the Savior searches patiently and personally.' }]
  }, images);

  assert.equal(selected.id, 'sheep');
});

test('selectBestImage uses run topic context when the slide hint is generic', () => {
  const selected = selectBestImage({
    image_hint: 'peaceful gospel lesson',
    topic_context: 'Create a slideshow about the parable of the lost sheep.',
    text_items: [{ text: 'This story teaches patient rescue and personal care.' }]
  }, images);

  assert.equal(selected.id, 'sheep');
});
