import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { db, nowIso } from '../db/index.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] || '.bin';
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else {
      const error = new Error('Only JPG, PNG, and WebP uploads are supported');
      error.status = 400;
      error.publicMessage = error.message;
      cb(error);
    }
  }
});

export const imagesRouter = express.Router();

imagesRouter.get('/', (_req, res) => {
  res.json(db.prepare('SELECT * FROM images ORDER BY created_at DESC').all());
});

imagesRouter.post('/', upload.array('images', 50), async (req, res, next) => {
  const files = req.files || [];
  try {
    const allowedFormats = new Set(['jpeg', 'png', 'webp']);
    for (const file of files) {
      const metadata = await sharp(file.path).metadata();
      if (!allowedFormats.has(metadata.format)) throw new Error('An uploaded file is not a valid JPG, PNG, or WebP image');
    }

    const now = nowIso();
    const rows = files.map((file) => {
      const id = uuid();
      const url = `/uploads/${file.filename}`;
      const originalName = path.basename(file.originalname).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'image';
      db.prepare(`INSERT INTO images (id, filename, original_name, mime_type, size, url, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '', ?)`).run(id, file.filename, originalName, file.mimetype, file.size, url, now);
      return { id, filename: file.filename, original_name: originalName, mime_type: file.mimetype, size: file.size, url, description: '', created_at: now };
    });
    res.status(201).json(rows);
  } catch (error) {
    for (const file of files) fs.rmSync(file.path, { force: true });
    error.status = 400;
    error.publicMessage = 'One or more files were not valid JPG, PNG, or WebP images';
    next(error);
  }
});

imagesRouter.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM images WHERE id = ?').run(req.params.id);
  fs.rmSync(path.join(config.uploadsDir, row.filename), { force: true });
  res.status(204).end();
});
