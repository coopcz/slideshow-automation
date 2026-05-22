import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { config } from '../config.js';
import { compositeSlide } from './compositeSlide.js';
import { assembleVideo } from './assembleVideo.js';

function resolveImagePath(url) {
  const filename = path.basename(String(url || ''));
  return path.join(config.uploadsDir, filename);
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function safeFolderName(title, id) {
  const slug = String(title || 'slideshow')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || id;
}

function zipDirectory(files, outputPath, folderName) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve(outputPath));
    archive.on('error', reject);
    archive.pipe(output);
    files.forEach((file, index) => {
      archive.file(file, { name: `${folderName}/slide_${String(index + 1).padStart(2, '0')}.png` });
    });
    archive.finalize();
  });
}

export async function renderSlideshow({ slideshow, onProgress = () => {} }) {
  const outDir = path.join(config.exportsDir, slideshow.id);
  ensureCleanDir(outDir);
  const frameDir = path.join(outDir, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });

  const slides = [...slideshow.slides].sort((a, b) => a.order - b.order);
  const frames = [];
  for (let index = 0; index < slides.length; index += 1) {
    onProgress({ progress: Math.round((index / Math.max(slides.length, 1)) * 70), message: `Compositing slide ${index + 1} of ${slides.length}...` });
    const buffer = await compositeSlide({ slide: slides[index], settings: slideshow.settings, resolveImagePath });
    const framePath = path.join(frameDir, `slide_${String(index + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(framePath, buffer);
    frames.push({ path: framePath, duration: slides[index].duration || slideshow.settings.slide_duration || 4 });
  }

  if (slideshow.settings.export_as_video) {
    onProgress({ progress: 82, message: 'Assembling video...' });
    const outputPath = path.join(outDir, `${slideshow.id}.mp4`);
    await assembleVideo({ frames, outputPath, duration: slideshow.settings.slide_duration || 4, transition: slideshow.settings.transition || 'none' });
    return { outputPath, type: 'video/mp4' };
  }

  onProgress({ progress: 86, message: 'Creating image ZIP...' });
  const outputPath = path.join(outDir, `${slideshow.id}.zip`);
  await zipDirectory(frames.map((frame) => frame.path), outputPath, safeFolderName(slideshow.title, slideshow.id));
  return { outputPath, type: 'application/zip' };
}
