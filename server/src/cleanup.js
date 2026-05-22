import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

export function cleanupOldExports() {
  const ttlMs = config.exportTtlDays * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(config.exportsDir)) return;
  for (const entry of fs.readdirSync(config.exportsDir, { withFileTypes: true })) {
    const fullPath = path.join(config.exportsDir, entry.name);
    const stat = fs.statSync(fullPath);
    if (Date.now() - stat.mtimeMs > ttlMs) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}
