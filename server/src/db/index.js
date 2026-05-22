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

const imageColumns = db.prepare('PRAGMA table_info(images)').all().map((column) => column.name);
if (!imageColumns.includes('description')) {
  db.prepare("ALTER TABLE images ADD COLUMN description TEXT NOT NULL DEFAULT ''").run();
}

const recipeTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'automation_recipes'").get();
if (!recipeTable) {
  db.exec(`CREATE TABLE automation_recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_name TEXT NOT NULL,
    audience TEXT NOT NULL,
    goal TEXT NOT NULL,
    voice TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    slide_count INTEGER NOT NULL DEFAULT 8,
    export_as_video INTEGER NOT NULL DEFAULT 0,
    transition TEXT NOT NULL DEFAULT 'none',
    image_strategy TEXT NOT NULL DEFAULT 'relevant',
    output_mode TEXT NOT NULL DEFAULT 'editable_and_render',
    last_run_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
}

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
