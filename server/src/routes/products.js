import express from 'express';
import { v4 as uuid } from 'uuid';
import { db, nowIso } from '../db/index.js';

export const productsRouter = express.Router();

productsRouter.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at ASC').all();
  res.json(rows);
});

productsRouter.post('/', (req, res) => {
  const { name, app_name = '', niche = '', brief_overview = '', comprehensive_overview = '', target_audience = '', ai_memory = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const now = nowIso();
  const id = uuid();
  db.prepare(`INSERT INTO products (id, name, app_name, niche, brief_overview, comprehensive_overview, target_audience, ai_memory, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, name.trim(), app_name, niche, brief_overview, comprehensive_overview, target_audience, ai_memory, now, now);
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
});

productsRouter.put('/:id', (req, res) => {
  const { name, app_name = '', niche = '', brief_overview = '', comprehensive_overview = '', target_audience = '', ai_memory = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const now = nowIso();
  db.prepare(`UPDATE products SET name=?, app_name=?, niche=?, brief_overview=?, comprehensive_overview=?, target_audience=?, ai_memory=?, updated_at=? WHERE id=?`)
    .run(name.trim(), app_name, niche, brief_overview, comprehensive_overview, target_audience, ai_memory, now, req.params.id);
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

productsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});
