import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';

export const exportsRouter = express.Router();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exportsRouter.get('/', (_req, res) => {
  const jobs = db.prepare(`SELECT jobs.*, slideshows.title
    FROM jobs JOIN slideshows ON slideshows.id = jobs.slideshow_id
    WHERE jobs.status = 'completed' ORDER BY jobs.updated_at DESC`).all();
  res.json(jobs.map((job) => ({ ...job, output_name: job.output_path ? path.basename(job.output_path) : null })));
});

exportsRouter.delete('/:slideshowId', (req, res) => {
  if (!uuidPattern.test(req.params.slideshowId)) return res.status(400).json({ error: 'Invalid slideshow ID' });
  const exportPath = path.resolve(config.exportsDir, req.params.slideshowId);
  const exportRoot = `${path.resolve(config.exportsDir)}${path.sep}`;
  if (!exportPath.startsWith(exportRoot)) return res.status(400).json({ error: 'Invalid export path' });
  fs.rmSync(exportPath, { recursive: true, force: true });
  db.prepare('UPDATE jobs SET output_path = NULL WHERE slideshow_id = ?').run(req.params.slideshowId);
  res.status(204).end();
});
