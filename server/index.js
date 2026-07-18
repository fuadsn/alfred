import express from "express";
import multer from "multer";
import debriefRouter from "./routes/debrief.js";
import enrichRouter from "./routes/enrich.js";
import transcribeRouter from "./routes/transcribe.js";

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use("/api", transcribeRouter);
app.use("/api", debriefRouter);
app.use("/api", enrichRouter);

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({ error: error.message });
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  return res.status(status).json({ error: error.message || "Internal server error." });
});

app.listen(port, () => {
  console.log(`Debrief server listening on http://localhost:${port}`);
});
