# Debrief

## Setup

Requirements: Node.js 20.19+ and `ffmpeg` available on `PATH` for `.opus` uploads.

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

## WhatsApp voice notes

Save or export the voice note from WhatsApp mobile, Web, or Desktop, then upload the saved file through the normal upload control. There is no WhatsApp bot or webhook.

WhatsApp `.opus` uploads are remuxed to an Ogg container with `ffmpeg` before transcription; the audio is copied without re-encoding. If remuxing fails or `ffmpeg` is unavailable, the server logs the error and forwards the original file to OpenAI.

If recording, upload, or transcription fails, paste a transcript directly. The files in `fixtures/` are ready-to-use demo fallbacks.
