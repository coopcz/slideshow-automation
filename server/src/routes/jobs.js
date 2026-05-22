import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db } from '../db/index.js';
import { publicJob } from '../queue/renderQueue.js';

export const jobsRouter = express.Router();

jobsRouter.get('/:id/status', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(publicJob(job));
});

jobsRouter.get('/:id/download', (req, res) => {
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed' || !job.output_path || !fs.existsSync(job.output_path)) {
    return res.status(409).json({ error: 'Job output is not ready' });
  }
  res.download(job.output_path, path.basename(job.output_path));
});
