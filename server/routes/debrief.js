import { Router } from "express";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import { DEBRIEF_RESPONSE_SCHEMA, DEBRIEF_SYSTEM_PROMPT } from "../prompt.js";

const router = Router();

router.post("/debrief", async (req, res) => {
  const transcript = typeof req.body?.transcript === "string" ? req.body.transcript.trim() : "";

  if (!transcript) {
    return res.status(400).json({ error: "A transcript is required." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.responses.create(
      {
        model: "gpt-5.6",
        input: [
          { role: "system", content: DEBRIEF_SYSTEM_PROMPT },
          { role: "user", content: transcript },
        ],
        reasoning: { effort: "low" },
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "debrief_response",
            description: "A classified work-session debrief and one-line English recap.",
            strict: true,
            schema: DEBRIEF_RESPONSE_SCHEMA,
          },
        },
      },
      {
        timeout: 60_000,
        maxRetries: 0,
      },
    );

    if (!response.output_text) {
      return res.status(502).json({ error: "The debrief service returned no output." });
    }

    return res.json(JSON.parse(response.output_text));
  } catch (error) {
    if (error instanceof APIConnectionTimeoutError) {
      return res.status(504).json({ error: "Debrief generation timed out after 60 seconds." });
    }

    if (error instanceof APIError && error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    if (error instanceof APIConnectionError) {
      return res.status(502).json({ error: "Could not reach the debrief service." });
    }

    return res.status(500).json({
      error: error instanceof Error ? error.message : "Debrief generation failed.",
    });
  }
});

export default router;
