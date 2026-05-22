import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');

export const config = {
  rootDir,
  dataDir,
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadsDir: path.join(dataDir, 'uploads'),
  exportsDir: path.join(dataDir, 'exports'),
  dbPath: path.join(dataDir, 'slideshows.db'),
  exportTtlDays: Number(process.env.EXPORT_TTL_DAYS || 7),
  llm: {
    openaiKey: process.env.OPENAI_API_KEY || '',
    anthropicKey: process.env.ANTHROPIC_API_KEY || ''
  }
};
