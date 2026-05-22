import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import { compositeSlide, wrapText } from '../src/renderer/compositeSlide.js';

test('wrapText breaks long text into bounded lines', () => {
  const lines = wrapText('A practical local slideshow renderer', 180, 42, 'Inter-Bold');
  assert.ok(lines.length > 1);
});

test('compositeSlide returns a full-resolution PNG buffer', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slideshow-render-'));
  const inputPath = path.join(tmp, 'sample.png');
  await sharp({
    create: { width: 200, height: 200, channels: 3, background: '#c84f31' }
  }).png().toFile(inputPath);

  const buffer = await compositeSlide({
    settings: { aspect_ratio: '1:1', text_position: 'center', is_bg_overlay_on: true, background_opacity: 20 },
    slide: {
      image_layout: 'single',
      image_url: 'sample.png',
      image_urls: [],
      text_items: [{
        id: 'text',
        text: 'Hello render',
        font: 'Inter-Bold',
        font_size: 'large',
        text_style: 'white_background',
        text_width: '80%',
        text_position: 'center',
        text_alignment: 'center',
        order: 0
      }],
      overrides: {}
    },
    resolveImagePath: () => inputPath
  });

  const metadata = await sharp(buffer).metadata();
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1080);
  assert.equal(metadata.format, 'png');
  fs.rmSync(tmp, { recursive: true, force: true });
});
