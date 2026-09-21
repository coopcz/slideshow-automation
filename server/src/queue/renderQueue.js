import path from 'node:path';
import { db, nowIso, rowToSlideshow } from '../db/index.js';
import { renderSlideshow } from '../renderer/renderSlideshow.js';
import { googleDriveConfigured, uploadRenderedSlideshow } from '../integrations/googleDrive.js';

const queue = [];
let active = false;

function updateJob(id, fields) {
  const current = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!current) return;
  const next = { ...current, ...fields, updated_at: nowIso() };
  db.prepare(`UPDATE jobs SET status = ?, progress = ?, message = ?, output_path = ?, drive_file_id = ?, drive_url = ?, error = ?, updated_at = ? WHERE id = ?`)
    .run(next.status, next.progress, next.message, next.output_path, next.drive_file_id, next.drive_url, next.error, next.updated_at, id);
}

async function runNext() {
  if (active || queue.length === 0) return;
  active = true;
  const { jobId, slideshowId } = queue.shift();
  try {
    updateJob(jobId, { status: 'processing', progress: 1, message: 'Preparing render...' });
    const row = db.prepare('SELECT * FROM slideshows WHERE id = ?').get(slideshowId);
    if (!row) throw new Error('Slideshow not found');
    const slideshow = rowToSlideshow(row);
    const result = await renderSlideshow({
      slideshow,
      onProgress: ({ progress, message }) => updateJob(jobId, { status: 'processing', progress, message })
    });
    let driveUpload = null;
    let driveError = null;
    if (googleDriveConfigured()) {
      updateJob(jobId, { status: 'processing', progress: 94, message: 'Uploading to Google Drive...' });
      try {
        driveUpload = await uploadRenderedSlideshow({ slideshow, outputPath: result.outputPath, framePaths: result.framePaths });
      } catch (error) {
        driveError = error.message;
      }
    }
    updateJob(jobId, {
      status: 'completed',
      progress: 100,
      output_path: result.outputPath,
      drive_file_id: driveUpload?.id || null,
      drive_url: driveUpload?.url || null,
      message: driveUpload ? 'Render complete and uploaded to Google Drive' : driveError ? `Render complete. Drive upload failed: ${driveError}` : 'Render complete'
    });
    db.prepare('UPDATE slideshows SET status = ?, updated_at = ? WHERE id = ?').run('rendered', nowIso(), slideshowId);
  } catch (error) {
    updateJob(jobId, { status: 'failed', progress: 100, message: 'Render failed', error: error.message });
    db.prepare('UPDATE slideshows SET status = ?, updated_at = ? WHERE id = ?').run('failed', nowIso(), slideshowId);
  } finally {
    active = false;
    runNext();
  }
}

export function enqueueRender(jobId, slideshowId) {
  queue.push({ jobId, slideshowId });
  setImmediate(runNext);
}

export function publicJob(job) {
  if (!job) return null;
  return {
    ...job,
    output_name: job.output_path ? path.basename(job.output_path) : null
  };
}
