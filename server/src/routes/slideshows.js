import express from 'express';
import { v4 as uuid } from 'uuid';
import { db, nowIso, rowToSlideshow } from '../db/index.js';
import { normalizeSlideshow } from '../model/defaults.js';

export const slideshowsRouter = express.Router();

slideshowsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM slideshows ORDER BY updated_at DESC').all();
  res.json(rows.map(rowToSlideshow));
});

slideshowsRouter.post('/', (req, res) => {
  const id = uuid();
  const now = nowIso();
  const slideshow = normalizeSlideshow(req.body);
  db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    slideshow.title,
    JSON.stringify(slideshow.settings),
    JSON.stringify(slideshow.slides),
    'draft',
    now,
    now
  );
  res.status(201).json({ id, status: 'draft', created_at: now, updated_at: now, ...slideshow });
});

slideshowsRouter.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM slideshows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Slideshow not found' });
  res.json(rowToSlideshow(row));
});

slideshowsRouter.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM slideshows WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Slideshow not found' });
  const normalized = normalizeSlideshow(req.body);
  const now = nowIso();
  db.prepare(`UPDATE slideshows SET title = ?, settings = ?, slides = ?, status = ?, updated_at = ? WHERE id = ?`)
    .run(normalized.title, JSON.stringify(normalized.settings), JSON.stringify(normalized.slides), req.body.status || existing.status, now, req.params.id);
  res.json(rowToSlideshow(db.prepare('SELECT * FROM slideshows WHERE id = ?').get(req.params.id)));
});

slideshowsRouter.post('/:id/duplicate', (req, res) => {
  const row = db.prepare('SELECT * FROM slideshows WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Slideshow not found' });
  const source = rowToSlideshow(row);
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO slideshows (id, title, settings, slides, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)`).run(
    id,
    `${source.title} copy`,
    JSON.stringify(source.settings),
    JSON.stringify(source.slides),
    now,
    now
  );
  res.status(201).json(rowToSlideshow(db.prepare('SELECT * FROM slideshows WHERE id = ?').get(id)));
});

slideshowsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM slideshows WHERE id = ?').run(req.params.id);
  res.status(204).end();
});
