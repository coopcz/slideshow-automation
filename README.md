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
- `OPENAI_MODEL`: OpenAI model used for slideshow writing and image-library matching. Default: `gpt-5.5`.
- `ANTHROPIC_API_KEY`: Enables prompt-to-slideshow generation with Anthropic if OpenAI is not set.

## Fonts

The app defaults to TikTok Sans for new text overlays and generated prompt slideshows. TikTok released TikTok Sans as a free/open-source font under the SIL Open Font License; the bundled license is at `server/renderer/fonts/TikTokSans-OFL.txt`.

Server-side rendering also looks for these optional files in `server/renderer/fonts/`:

- `BebasNeue-Regular.ttf`
- `CormorantGaramond-Regular.ttf`
- `CormorantGaramond-Italic.ttf`
- `Anton.ttf`
- `Inter-Bold.ttf`

The app falls back to system/browser fonts when optional files are missing. Before redistributing additional font files, verify and include each font's license.

## Automation Setup

Prompt generation is enabled when `OPENAI_API_KEY` is present in the root `.env` file:

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.5
```

Restart the dev server after editing `.env`:

```bash
npm run dev
```

How the local automation is intended to work:

1. Upload a library of your own source images.
2. Use **Generate from prompt** for one slideshow idea. The server describes your uploaded images with OpenAI when needed, then asks the model to write the slideshow and choose relevant local images for each slide.
3. Adjust the generated slideshow in the composer.
4. Click **Save as template** when the structure looks right. Templates preserve layout/style/slide count, but clear specific text and image choices.
5. Use **Batch prompts, one per line** only when you want to create several separate slideshows at once. Each line becomes its own generated slideshow and render job.
6. Download outputs from **My Exports**. Use **Render PNG ZIP** for individual image slides, or **Render MP4** for video.

Image matching uses only your local image library. It does not source images from the internet.

### Saved Automation Recipes

Use **Automation Studio** when you want a reusable “set it up once, run it later” workflow:

1. Fill in product, audience, goal, voice rules, slide count, output format, and prompt template.
2. Click **Save recipe**.
3. Later, choose the recipe, enter only the current topic, and click **Run saved automation**.
4. The app generates a slideshow, matches uploaded local images, opens the result in the editor, and can queue the export automatically.

Prompt templates support:

- `{{topic}}`
- `{{product_name}}`
- `{{audience}}`
- `{{goal}}`
- `{{voice}}`

This is the local equivalent of an automation campaign. It does not publish anywhere.

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
