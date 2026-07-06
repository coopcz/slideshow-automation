CREATE TABLE IF NOT EXISTS slideshows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  settings TEXT NOT NULL,
  slides TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  slideshow_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  output_path TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(slideshow_id) REFERENCES slideshows(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT NOT NULL,
  slides TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  template_id TEXT NOT NULL,
  recipe_id TEXT,
  topic TEXT NOT NULL DEFAULT '',
  days_of_week TEXT NOT NULL DEFAULT '[]',
  times TEXT NOT NULL DEFAULT '[]',
  timezone TEXT NOT NULL DEFAULT 'local',
  prompts TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slideshow_type TEXT NOT NULL DEFAULT 'educational',
  product_name TEXT NOT NULL,
  audience TEXT NOT NULL,
  goal TEXT NOT NULL,
  voice TEXT NOT NULL,
  word_spacing TEXT NOT NULL DEFAULT 'balanced',
  image_instructions TEXT NOT NULL DEFAULT '',
  progression TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '9:16',
  prompt_template TEXT NOT NULL,
  slide_count INTEGER NOT NULL DEFAULT 8,
  export_as_video INTEGER NOT NULL DEFAULT 0,
  transition TEXT NOT NULL DEFAULT 'none',
  image_strategy TEXT NOT NULL DEFAULT 'relevant',
  output_mode TEXT NOT NULL DEFAULT 'editable_and_render',
  last_run_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_batch_runs (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  status TEXT NOT NULL,
  total_topics INTEGER NOT NULL DEFAULT 0,
  completed_topics INTEGER NOT NULL DEFAULT 0,
  topics TEXT NOT NULL DEFAULT '[]',
  results TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(recipe_id) REFERENCES automation_recipes(id) ON DELETE CASCADE
);
