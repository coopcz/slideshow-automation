import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP uploads are supported'));
  }
});

export const imagesRouter = express.Router();

imagesRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM images ORDER BY created_at DESC').all());
});

imagesRouter.post('/', upload.array('images', 50), (req, res) => {
  const now = nowIso();
  const rows = req.files.map((file) => {
    const id = uuid();
    const url = `/uploads/${file.filename}`;
    db.prepare(`INSERT INTO images (id, filename, original_name, mime_type, size, url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, file.filename, file.originalname, file.mimetype, file.size, url, now);
    return { id, filename: file.filename, original_name: file.originalname, mime_type: file.mimetype, size: file.size, url, created_at: now };
  });
  res.status(201).json(rows);
});

imagesRouter.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  fs.rmSync(path.join(config.uploadsDir, row.filename), { force: true });
  res.status(204).end();
});
