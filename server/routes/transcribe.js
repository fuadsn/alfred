import path from "node:path";
import { Router } from "express";
import multer from "multer";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  toFile,
} from "openai";
import { extractAndChunkMonoAudio, remuxOpusToOgg } from "../ffmpeg.js";

const router = Router();
const LONG_MEDIA_THRESHOLD_BYTES = 24 * 1024 * 1024;
const allowedExtensions = new Set([
  ".webm",
  ".mp4",
  ".m4a",
  ".mp3",
  ".wav",
  ".ogg",
  ".opus",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      const error = new Error(
        "Unsupported audio format. Use webm, mp4, m4a, mp3, wav, ogg, or opus.",
      );
      error.status = 415;
      return callback(error);
    }

    return callback(null, true);
  },
});

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "An audio file is required." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  const mimeType = req.file.mimetype.split(";", 1)[0].trim().toLowerCase();
  const isChunked = mimeType === "video/mp4" || req.file.size > LONG_MEDIA_THRESHOLD_BYTES;
  const transcriptionTimeoutMs = isChunked ? 180_000 : 10_000;

  try {
    const originalExtension = path.extname(req.file.originalname);
    let transcriptionInputs;

    if (isChunked) {
      transcriptionInputs = await extractAndChunkMonoAudio(
        req.file.buffer,
        req.file.originalname,
      );
    } else if (originalExtension.toLowerCase() === ".opus") {
      const remuxedBuffer = await remuxOpusToOgg(req.file.buffer);

      if (remuxedBuffer) {
        transcriptionInputs = [
          {
            buffer: remuxedBuffer,
            filename: `${path.basename(req.file.originalname, originalExtension)}.ogg`,
            type: "audio/ogg",
          },
        ];
      }
    }

    transcriptionInputs ??= [
      {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        type: req.file.mimetype,
      },
    ];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcriptParts = [];

    for (const input of transcriptionInputs) {
      const audioFile = await toFile(input.buffer, input.filename, {
        type: input.type,
      });
      const transcription = await openai.audio.transcriptions.create(
        {
          file: audioFile,
          model: "gpt-4o-transcribe",
        },
        {
          timeout: transcriptionTimeoutMs,
          maxRetries: 0,
        },
      );
      const transcriptPart = transcription.text.trim();

      if (transcriptPart) {
        transcriptParts.push(transcriptPart);
      }
    }

    return res.json({ transcript: transcriptParts.join("\n\n") });
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      return res.status(504).json({
        error: `Transcription timed out after ${transcriptionTimeoutMs / 1_000} seconds.`,
      });
    }

    if (error instanceof APIError && error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error instanceof APIConnectionError) {
      return res.status(502).json({ error: "Could not reach the transcription service." });
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : "Transcription failed.",
    });
  }
});

export default router;
