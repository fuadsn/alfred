import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const FFMPEG_BINARY = "ffmpeg";
const CHUNK_DURATION_SECONDS = 15 * 60;
const MAX_CHUNK_BYTES = 25 * 1024 * 1024;

function runFfmpeg(args, inputBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_BINARY, args);
    const outputChunks = [];
    const errorChunks = [];
    let settled = false;

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    ffmpeg.stdout.on("data", (chunk) => outputChunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => errorChunks.push(chunk));
    ffmpeg.stdin.on("error", () => {});

    ffmpeg.once("error", (error) => {
      const stderr = Buffer.concat(errorChunks).toString().trim();
      fail(
        new Error(`ffmpeg failed to start: ${error.message}${stderr ? `\n${stderr}` : ""}`),
      );
    });

    ffmpeg.once("close", (code) => {
      if (settled) {
        return;
      }

      if (code !== 0) {
        const stderr = Buffer.concat(errorChunks).toString().trim();
        fail(new Error(`ffmpeg exited with code ${code}${stderr ? `:\n${stderr}` : ""}`));
        return;
      }

      settled = true;
      resolve(Buffer.concat(outputChunks));
    });

    if (inputBuffer) {
      ffmpeg.stdin.end(inputBuffer);
    } else {
      ffmpeg.stdin.end();
    }
  });
}

export async function remuxOpusToOgg(buffer) {
  try {
    return await runFfmpeg(
      ["-i", "pipe:0", "-c:a", "copy", "-f", "ogg", "pipe:1"],
      buffer,
    );
  } catch (error) {
    console.error(`ffmpeg opus remux failed: ${error.message}`);
    return null;
  }
}

export async function extractAndChunkMonoAudio(buffer, originalFilename) {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "debrief-ffmpeg-"));
  const originalExtension = path.extname(originalFilename).toLowerCase();
  const safeExtension = /^\.[a-z0-9]+$/.test(originalExtension) ? originalExtension : ".input";
  const inputPath = path.join(temporaryDirectory, `source${safeExtension}`);
  const outputPattern = path.join(temporaryDirectory, "chunk-%03d.mp3");

  try {
    await writeFile(inputPath, buffer);
    await runFfmpeg([
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-f",
      "segment",
      "-segment_time",
      String(CHUNK_DURATION_SECONDS),
      "-reset_timestamps",
      "1",
      outputPattern,
    ]);

    const chunkFilenames = (await readdir(temporaryDirectory))
      .filter((filename) => /^chunk-\d{3}\.mp3$/.test(filename))
      .sort();

    if (chunkFilenames.length === 0) {
      throw new Error("ffmpeg produced no audio chunks.");
    }

    const chunks = [];

    for (const filename of chunkFilenames) {
      const chunkBuffer = await readFile(path.join(temporaryDirectory, filename));

      if (chunkBuffer.length >= MAX_CHUNK_BYTES) {
        throw new Error(`${filename} exceeds the 25 MB transcription limit.`);
      }

      chunks.push({
        buffer: chunkBuffer,
        filename,
        type: "audio/mpeg",
      });
    }

    return chunks;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
