# Slideshow Automation

Self-hosted local web app for creating image slideshows, editing text overlays, and exporting either MP4 video or a ZIP of rendered PNG slides. It is single-user, filesystem-backed, and has no accounts, credits, TikTok integration, or external image sourcing.

## Features

- Upload JPG, PNG, and WebP images into a local image library.
- Compose slides with one image or simple grids: `single`, `1:2`, `2:1`, `2:2`, `1:3`.
- Reorder, duplicate, and delete slides with `dnd-kit`.
- Add multiple styled text overlays per slide.
- Configure aspect ratios: `4:5`, `9:16`, `1:1`, `16:9`.
- Persist slideshows, images, render jobs, templates, and export history in SQLite.
- Render server-side PNGs with Sharp.
- Export MP4 with FFmpeg or a ZIP containing a folder of rendered PNG slides.
- Optional LLM prompt generation when `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` is configured.
- Auto-cleanup of export folders older than `EXPORT_TTL_DAYS`.

## Requirements

- Node.js 22+
- FFmpeg installed locally for MP4 export
- Docker, if using `docker-compose`

## Local Development

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`.

The Express API runs on `http://localhost:4000`. Uploaded images and rendered outputs are stored under `data/uploads` and `data/exports`.

## Docker

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:4000`. The Docker image includes FFmpeg and serves the built React app from Express.

## Environment Variables

- `PORT`: Express server port. Default: `4000`.
- `CLIENT_ORIGIN`: Vite dev origin for CORS. Default: `http://localhost:5173`.
- `DATA_DIR`: Directory for SQLite, uploads, and exports. Default: `./data`.
- `EXPORT_TTL_DAYS`: Export cleanup age. Default: `7`.
- `OPENAI_API_KEY`: Enables prompt-to-slideshow generation with OpenAI.
- `ANTHROPIC_API_KEY`: Enables prompt-to-slideshow generation with Anthropic if OpenAI is not set.

## Fonts

Server-side rendering looks for these optional files in `server/renderer/fonts/`:

- `BebasNeue-Regular.ttf`
- `CormorantGaramond-Regular.ttf`
- `CormorantGaramond-Italic.ttf`
- `Anton.ttf`
- `Inter-Bold.ttf`

The app falls back to system/browser fonts when these files are missing. Before redistributing font files, verify and include each font's license. The Google Fonts families referenced by the browser preview are commonly available under the SIL Open Font License, but you should keep the license files alongside bundled TTFs.

## API

- `POST /api/slideshows`: create a slideshow.
- `GET /api/slideshows`: list slideshows.
- `GET /api/slideshows/:id`: load one slideshow.
- `PUT /api/slideshows/:id`: save a slideshow.
- `POST /api/slideshows/:id/render`: enqueue a render job.
- `GET /api/jobs/:job_id/status`: poll render status.
- `GET /api/jobs/:job_id/download`: download completed ZIP or MP4. ZIP exports contain a named folder with `slide_01.png`, `slide_02.png`, and so on.
- `GET /api/images`: list uploaded images.
- `POST /api/images`: bulk upload images with form field `images`.
- `DELETE /api/images/:id`: delete an uploaded image.
- `GET /api/exports`: list completed exports.

## Tests

```bash
npm run test
```

Renderer tests cover text wrapping and the pure slide compositor path that returns a PNG buffer.
