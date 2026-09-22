# Slideshow Automation

## This readme is made by AI because I ain't got time to do that

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
- `OPENAI_IMAGE_DESCRIPTION_MODEL`: OpenAI vision-capable model used to describe uploaded images before matching. Default: `gpt-4o-mini`.
- `ANTHROPIC_API_KEY`: Enables prompt-to-slideshow generation with Anthropic if OpenAI is not set.
- `GOOGLE_DRIVE_FOLDER_ID`: Optional destination folder. Completed PNG slideshows upload as a folder of individual PNGs; videos upload as MP4 files.
- `GOOGLE_OAUTH_CLIENT_FILE`: Path to a Desktop app OAuth client JSON file. Recommended for uploading to a personal My Drive folder.
- `GOOGLE_OAUTH_TOKEN_FILE`: Where the local authorization token is stored. Default: `./data/google-drive-token.json`.
- `GOOGLE_SERVICE_ACCOUNT_FILE`: Path to a Google service-account JSON key. Share the destination Drive folder with the service account email.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: Inline service-account JSON, useful in hosted environments. Use this or `GOOGLE_SERVICE_ACCOUNT_FILE`, not both.

For a personal Google Drive folder, create a Desktop app OAuth client in Google Cloud, set `GOOGLE_OAUTH_CLIENT_FILE`, and run `npm run google:auth` once. Service accounts should only be used with a Shared Drive because service accounts do not have personal Drive storage quota.

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
OPENAI_IMAGE_DESCRIPTION_MODEL=gpt-4o-mini
```

Restart the dev server after editing `.env`:

```bash
npm run dev
```

### Create versus automation

- **Create** with the “Built-in LDS family recipe” writes seven 9:16 slides using the app's built-in audience, voice, and format rules. It selects images from your uploaded library, renders the slides, and uploads them to the configured Google Drive folder.
- The **Writing recipe** menu on Create can instead use one of your saved recipes. Its audience, goal, voice, image guidance, and `{{topic}}` prompt template shape the copy. Create still renders and uploads immediately, regardless of that recipe's scheduled-output setting.
- **Automation** lets you edit saved recipes and create schedules. A schedule rotates through its topic list, using one topic at each selected day and time. The recipe's scheduled-output setting determines whether that run publishes to Drive or remains a draft. The app server must be running at the scheduled time; missed runs are not replayed.
- Every generated slideshow uses the seven-slide, 9:16 TikTok format. You can review and revise it in the editor. AI revisions do not republish automatically; use the Publish button when ready.

Image matching uses only your local image library. It does not source images from the internet.

### Saved recipe prompt variables

Prompt templates support:

- `{{topic}}`
- `{{product_name}}`
- `{{audience}}`
- `{{goal}}`
- `{{voice}}`

Drive publishing is optional and requires the Google Drive settings above.

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
