# Debrief

## Setup

Requirements: Node.js 20.19+ and `ffmpeg` available on `PATH` for `.opus` uploads and long-media processing.

```sh
cp .env.example .env
```

Add your OpenAI API key to `.env`:

```sh
OPENAI_API_KEY=your_key_here
```

Install dependencies and start the client, server, and Tailwind watcher:

```sh
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to the Express server on port 3001.

## Input paths

- **Record:** start the microphone, stop when finished, then click **Transcribe**.
- **Upload:** choose an MP3, WAV, M4A, MP4, OGG, OPUS, or WEBM file, then click **Transcribe**.
- **Paste:** paste or type directly into the transcript textarea, edit as needed, then click **Create debrief**.

All three paths use the same editable transcript textarea before generating results.

## Linear enrichment (v2)

Linear enrichment is optional. Provide a personal Linear API key either as `LINEAR_API_KEY` in `.env` or in the app's collapsible **Settings** row. The in-app key is stored in the browser's local storage and sent only to this app's server when enrichment runs.

After a debrief is generated, enrichment searches the connected Linear workspace for action-item references. It prefers linking an existing issue, can create an issue when no confident match exists, and can update an existing issue when the action explicitly requires a change. Enrichment failures leave the original debrief intact.

**Warning:** create and update actions write to real issues in the connected Linear workspace. Use a workspace and API key where those changes are intended.

## WhatsApp voice notes

Save or export the voice note from WhatsApp mobile, Web, or Desktop, then upload the saved file through the normal upload control. There is no WhatsApp bot or webhook.

WhatsApp `.opus` uploads are remuxed to an Ogg container with `ffmpeg` before transcription; the audio is copied without re-encoding. If remuxing fails or `ffmpeg` is unavailable, the server logs the error and forwards the original file to OpenAI.

## Long media (v2)

MP4 video and files larger than 24 MB are automatically converted to mono audio with `ffmpeg`, split into sequential sub-25 MB chunks, transcribed one chunk at a time, and stitched back into a single transcript.

If recording, upload, or transcription fails, paste a transcript directly. The files in `fixtures/` are ready-to-use demo fallbacks.
