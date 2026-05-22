import express from 'express';
import { v4 as uuid } from 'uuid';
import { db, nowIso } from '../db/index.js';
import { enqueueRender } from '../queue/renderQueue.js';

export const renderRouter = express.Router();

renderRouter.post('/slideshows/:id/render', (req, res) => {
  const slideshow = db.prepare('SELECT id FROM slideshows WHERE id = ?').get(req.params.id);
  if (!slideshow) return res.status(404).json({ error: 'Slideshow not found' });
  const id = uuid();
  const now = nowIso();
  db.prepare(`INSERT INTO jobs (id, slideshow_id, type, status, progress, message, created_at, updated_at)
    VALUES (?, ?, 'render', 'queued', 0, 'Queued', ?, ?)`).run(id, req.params.id, now, now);
  enqueueRender(id, req.params.id);
  res.status(202).json({ job_id: id });
});
