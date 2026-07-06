import cron from 'node-cron';
import { v4 as uuid } from 'uuid';
import { db, nowIso } from './db/index.js';
import { enqueueRender } from './queue/renderQueue.js';
import { createSlide, createTextItem, defaultSettings, normalizeSlideshow } from './model/defaults.js';
import { rowToRecipe, runRecipeAutomation } from './automation/core.js';

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

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDays(value) {
  return [...new Set(parseJsonArray(value).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function normalizeTimes(value) {
  return [...new Set(parseJsonArray(value).map((time) => String(time || '').trim()).filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort();
}

export function cronExpressionForTime(time, daysOfWeek) {
  const [hour = '9', minute = '0'] = String(time || '09:00').split(':');
  const days = daysOfWeek.length ? daysOfWeek.join(',') : '1-5';
  return `${Number(minute)} ${Number(hour)} * * ${days}`;
}

async function runSchedule(schedule) {
  if (schedule.recipe_id) {
    const recipe = rowToRecipe(db.prepare('SELECT * FROM automation_recipes WHERE id = ?').get(schedule.recipe_id));
    if (!recipe) return;
    const prompts = parseJsonArray(schedule.prompts);
    const topic = prompts.length
      ? prompts[Number(schedule.prompt_index || 0) % prompts.length]
      : (schedule.topic || '');
    const nextIndex = prompts.length ? (Number(schedule.prompt_index || 0) + 1) % prompts.length : 0;
    db.prepare('UPDATE schedules SET prompt_index = ? WHERE id = ?').run(nextIndex, schedule.id);
    await runRecipeAutomation(recipe, topic, 'Queued by automation schedule');
    return;
  }

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
    if (row.recipe_id) {
      const days = normalizeDays(row.days_of_week);
      const times = normalizeTimes(row.times);
      for (const time of times) {
        const expression = cronExpressionForTime(time, days);
        if (!cron.validate(expression)) continue;
        const options = row.timezone && row.timezone !== 'local' ? { timezone: row.timezone } : undefined;
        tasks.set(`${row.id}:${time}`, cron.schedule(expression, () => {
          runSchedule(row).catch((error) => console.warn(`Scheduled automation failed: ${error.message}`));
        }, options));
      }
      continue;
    }

    if (!cron.validate(row.cron)) continue;
    tasks.set(row.id, cron.schedule(row.cron, () => {
      runSchedule(row).catch((error) => console.warn(`Scheduled batch failed: ${error.message}`));
    }));
  }
}
