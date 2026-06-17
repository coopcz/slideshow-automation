import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { config } from './config.js';
import './db/index.js';
import { slideshowsRouter } from './routes/slideshows.js';
import { imagesRouter } from './routes/images.js';
import { renderRouter } from './routes/render.js';
import { jobsRouter } from './routes/jobs.js';
import { exportsRouter } from './routes/exports.js';
import { automationRouter } from './routes/automation.js';
import { productsRouter } from './routes/products.js';
import { cleanupOldExports } from './cleanup.js';
import { reloadSchedules } from './scheduler.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.exportsDir, { recursive: true });

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: false }));
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(config.uploadsDir));
app.use('/exports', express.static(config.exportsDir));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/slideshows', slideshowsRouter);
app.use('/api/images', imagesRouter);
app.use('/api', renderRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/exports', exportsRouter);
app.use('/api/automation', automationRouter);
app.use('/api/products', productsRouter);

const clientDist = path.join(config.rootDir, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

cron.schedule('0 3 * * *', cleanupOldExports);
cleanupOldExports();
reloadSchedules();

app.listen(config.port, () => {
  console.log(`Slideshow Automation server listening on http://localhost:${config.port}`);
});
