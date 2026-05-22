import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.exportsDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schemaPath = path.resolve(fileURLToPath(new URL('./schema.sql', import.meta.url)));
db.exec(fs.readFileSync(schemaPath, 'utf8'));

export function nowIso() {
  return new Date().toISOString();
}

export function rowToSlideshow(row) {
  if (!row) return null;
  return {
    ...row,
    settings: JSON.parse(row.settings),
    slides: JSON.parse(row.slides)
  };
}

export function rowToJob(row) {
  if (!row) return null;
  return row;
}
