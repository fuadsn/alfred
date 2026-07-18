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
import { listRecentIssues } from "../linear.js";

const router = Router();
const LONG_MEDIA_THRESHOLD_BYTES = 24 * 1024 * 1024;
const VOCABULARY_CACHE_MS = 5 * 60 * 1_000;
const VOCABULARY_HINT_MAX_LENGTH = 600;
const vocabularyHintCache = { value: "", expires: 0 };
let vocabularyHintFailureLogged = false;
let vocabularyHintAttachmentLogged = false;
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

function buildVocabularyHint(issues) {
  const prefix = "Domain terms: ";
  const terms = [];
  const seen = new Set();
  let length = prefix.length;

  for (const issue of issues) {
    const titleWords =
      typeof issue?.title === "string"
        ? issue.title.match(/[\p{L}\p{N}][\p{L}\p{N}+#.\/-]*/gu) ?? []
        : [];
    const candidates = [issue?.identifier, ...titleWords];

    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }

      const term = candidate.trim();
      const normalizedTerm = term.toLocaleLowerCase();

      if (!term || seen.has(normalizedTerm)) {
        continue;
      }

      const addedLength = term.length + (terms.length > 0 ? 2 : 0);

      if (length + addedLength > VOCABULARY_HINT_MAX_LENGTH) {
        return terms.length > 0 ? `${prefix}${terms.join(", ")}` : "";
      }

      seen.add(normalizedTerm);
      terms.push(term);
      length += addedLength;
    }
  }

  return terms.length > 0 ? `${prefix}${terms.join(", ")}` : "";
}

async function getVocabularyHint() {
  const now = Date.now();

  if (now < vocabularyHintCache.expires) {
    return vocabularyHintCache.value;
  }

  const linearToken = process.env.LINEAR_API_KEY?.trim();

  if (!linearToken) {
    vocabularyHintCache.value = "";
    vocabularyHintCache.expires = now + VOCABULARY_CACHE_MS;
    return "";
  }

  try {
    const issues = await listRecentIssues(linearToken);
    const vocabularyHint = buildVocabularyHint(issues);

    vocabularyHintCache.value = vocabularyHint;
    vocabularyHintCache.expires = now + VOCABULARY_CACHE_MS;

    if (vocabularyHint) {
      console.log(
        `[transcribe] Vocabulary hint fetched from ${issues.length} recent Linear issues (${vocabularyHint.length} chars).`,
      );
    }

    return vocabularyHint;
  } catch (error) {
    vocabularyHintCache.value = "";
    vocabularyHintCache.expires = now + VOCABULARY_CACHE_MS;

    if (!vocabularyHintFailureLogged) {
      console.warn(
        `[transcribe] Linear vocabulary unavailable; continuing without a hint: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
      vocabularyHintFailureLogged = true;
    }

    return "";
  }
}

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "An audio file is required." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  const mimeType = req.file.mimetype.split(";", 1)[0].trim().toLowerCase();
  const isChunked = mimeType === "video/mp4" || req.file.size > LONG_MEDIA_THRESHOLD_BYTES;
  const transcriptionModel =
    req.body?.interim === "1" ? "gpt-4o-mini-transcribe" : "gpt-4o-transcribe";
  const transcriptionTimeoutMs = isChunked ? 180_000 : 45_000;

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
    const vocabularyHint = await getVocabularyHint();

    if (vocabularyHint && !vocabularyHintAttachmentLogged) {
      console.log("[transcribe] Vocabulary hint attached to transcription requests.");
      vocabularyHintAttachmentLogged = true;
    }

    for (const input of transcriptionInputs) {
      const audioFile = await toFile(input.buffer, input.filename, {
        type: input.type,
      });
      const transcription = await openai.audio.transcriptions.create(
        {
          file: audioFile,
          model: transcriptionModel,
          ...(vocabularyHint ? { prompt: vocabularyHint } : {}),
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
