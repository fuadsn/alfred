import path from "node:path";
import { Router } from "express";
import multer from "multer";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  toFile,
} from "openai";

const router = Router();
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
  limits: { fileSize: 25 * 1024 * 1024 },
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

  try {
    // TODO: Remux .opus here if the live format test shows OpenAI rejects it.
    const audioFile = await toFile(req.file.buffer, req.file.originalname, {
      type: req.file.mimetype,
    });
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await openai.audio.transcriptions.create(
      {
        file: audioFile,
        model: "gpt-4o-transcribe",
      },
      {
        timeout: 10_000,
        maxRetries: 0,
      },
    );

    return res.json({ transcript: transcription.text });
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      return res.status(504).json({ error: "Transcription timed out after 10 seconds." });
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
