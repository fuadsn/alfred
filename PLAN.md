## Verdict (§5.4 draft)

**Pick: model returns `items` + `recap_line` + `detected_language`; frontend assembles the Slack draft.**  
Same one-call latency, smaller schema, and columns/draft cannot diverge; mrkdwn layout is pure presentation (not worth model tokens or format bugs).

**Contract change:** drop top-level `draft`; add `recap_line: string`. Assemble as `*Session recap*\n\n{recap_line}\n\n*Decisions*\n...` from items by category.

---

## Build plan (codex)

1. **Scaffold + schema lock** — `package.json`, `server/`, `client/` (Vite+React+Tailwind), `.env.example`, shared `types.ts` with §7 shape as amended above. *Done:* monorepo boots; types export `Item`, `DebriefResponse`. *Verify:* `npm i` both; types compile.

2. **API smoke (Fuad, 0–20m)** — live `gpt-4o-transcribe` on real `.opus`/`.ogg`; note if ffmpeg remux needed. *Done:* keys work; format decision written in one comment. *Verify:* one successful STT response logged.

3. **`POST /transcribe`** — `server/routes/transcribe.js` (+ optional `ffmpegRemux` if step 2 failed). Accepts webm/mp4/m4a/mp3/wav/ogg/opus; no `language` param; >10s → clear error. *Done:* audio → `{ transcript }`. *Verify:* curl each format; timeout path returns 4xx/5xx with message.

4. **`POST /debrief` + prompt** — `server/routes/debrief.js`, `server/prompt.ts` (Appendix A few-shots, ignore-bucket, EN normalize, source_quote verbatim). Structured outputs: `items[]` + `recap_line` + `detected_language`. *Done:* Example 1 transcript → ≥1 of each category + English recap_line. *Verify:* curl both Appendix transcripts; check source_quotes not translated.

5. **Frontend input shell** — mic (MediaRecorder), file upload, paste textarea, shared editable transcript field. *Done:* all three fill same textarea; submit disabled until non-empty text. *Verify:* record, upload, paste each leave text ready.

6. **Wire pipeline UI** — call `/transcribe` then `/debrief`; loading/error states; on STT fail drop to paste. *Done:* end-to-end path works with spinner + error copy. *Verify:* happy path + kill STT → paste → debrief.

7. **Results render** — three columns by `category` (`text` + `reasoning` + `source_quote`); draft block from assembler; copy button. *Done:* columns match items; draft = deterministic Slack mrkdwn; clipboard works. *Verify:* paste Example 1; columns/draft agree; paste into Slack preview looks right.

8. **Polish + demo backups** — non-Latin font check; commit backup audio + transcript under `fixtures/`. *Done:* acceptance §12 checklist green except live timing. *Verify:* code-switched fixture; pipeline <20s; backup paste path alone.
