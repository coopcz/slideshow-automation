import cron from 'node-cron';
import { v4 as uuid } from 'uuid';
import { db, nowIso } from './db/index.js';
import { enqueueRender } from './queue/renderQueue.js';
import { createSlide, createTextItem, defaultSettings, normalizeSlideshow } from './model/defaults.js';

const tasks = new Map();

function fallbackGenerated(prompt, template) {
  if (template) {
    return normalizeSlideshow({
      title: prompt.slice(0, 70) || 'Scheduled slideshow',
      settings: template.settings,
      slides: template.slides.map((slide, index) => ({
        ...slide,
        order: index,
        text_items: slide.text_items.map((item, itemIndex) => ({
          ...item,
          id: uuid(),
          order: itemIndex,
          text: itemIndex === 0 ? prompt : ''
        }))
      }))
    });
  }
  return normalizeSlideshow({
    title: prompt.slice(0, 70) || 'Scheduled slideshow',
    settings: defaultSettings,
    slides: [createSlide({ text_items: [createTextItem({ text: prompt, order: 0 })] })]
  });
}

function runSchedule(schedule) {
  const templateRow = db.prepare('SELECT * FROM templates WHERE id = ?').get(schedule.template_id);
  const template = templateRow ? { settings: JSON.parse(templateRow.settings), slides: JSON.parse(templateRow.slides) } : null;
  const prompts = JSON.parse(schedule.prompts);
  for (const prompt of prompts) {
    const slideshow = fallbackGenerated(prompt, template);
    const slideshowId = uuid();
    const jobId = uuid();
    const now = nowIso();
    db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'draft', ?, ?)`).run(slideshowId, slideshow.title, JSON.stringify(slideshow.settings), JSON.stringify(slideshow.slides), now, now);
    db.prepare(`INSERT INTO jobs (id, slideshow_id, type, status, progress, message, created_at, updated_at)
      VALUES (?, ?, 'render', 'queued', 0, 'Queued by schedule', ?, ?)`).run(jobId, slideshowId, now, now);
    enqueueRender(jobId, slideshowId);
  }
}

export function reloadSchedules() {
  for (const task of tasks.values()) task.stop();
  tasks.clear();
  const rows = db.prepare('SELECT * FROM schedules WHERE enabled = 1').all();
  for (const row of rows) {
    if (!cron.validate(row.cron)) continue;
    tasks.set(row.id, cron.schedule(row.cron, () => runSchedule(row)));
  }
}
