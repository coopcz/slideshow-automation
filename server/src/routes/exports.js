import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config.js';
import { db } from '../db/index.js';

export const exportsRouter = express.Router();

exportsRouter.get('/', (_req, res) => {
  const jobs = db.prepare(`SELECT jobs.*, slideshows.title
    FROM jobs JOIN slideshows ON slideshows.id = jobs.slideshow_id
    WHERE jobs.status = 'completed' ORDER BY jobs.updated_at DESC`).all();
  res.json(jobs.map((job) => ({ ...job, output_name: job.output_path ? path.basename(job.output_path) : null })));
});

exportsRouter.delete('/:slideshowId', (req, res) => {
  fs.rmSync(path.join(config.exportsDir, req.params.slideshowId), { recursive: true, force: true });
  db.prepare('UPDATE jobs SET output_path = NULL WHERE slideshow_id = ?').run(req.params.slideshowId);
  res.status(204).end();
});
