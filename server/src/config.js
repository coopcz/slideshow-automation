import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const rootDir = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || 'data');

export const config = {
  rootDir,
  dataDir,
  port: Number(process.env.PORT || 4000),
  host: process.env.SERVER_HOST || '127.0.0.1',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  uploadsDir: path.join(dataDir, 'uploads'),
  exportsDir: path.join(dataDir, 'exports'),
  dbPath: path.join(dataDir, 'slideshows.db'),
  exportTtlDays: Number(process.env.EXPORT_TTL_DAYS || 7),
  googleDrive: {
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
    oauthClientFile: process.env.GOOGLE_OAUTH_CLIENT_FILE || '',
    oauthTokenFile: process.env.GOOGLE_OAUTH_TOKEN_FILE || path.join(dataDir, 'google-drive-token.json'),
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
    serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || ''
  },
  llm: {
    openaiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-5.5',
    imageDescriptionModel: process.env.OPENAI_IMAGE_DESCRIPTION_MODEL || process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
    anthropicKey: process.env.ANTHROPIC_API_KEY || ''
  }
};
