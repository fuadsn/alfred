## Verdict (enrichment architecture)

**Pick: keep `POST /api/debrief` frozen; add `POST /api/enrich` that runs a Responses API tool-calling loop over Linear (`search`, `get`, `create`, `update`).**  
Classification stays a strict one-shot schema call; enrichment is optional, retriable with a personal token, and never re-classifies. Tool-calling inside `/debrief` would couple a working deterministic path to flaky multi-round tool I/O.

**Auth:** personal Linear API token (request header or env), no OAuth. **Branch:** `v2/intelligence-layer` only.

---

## Build plan (codex)

1. **Branch + contract** — branch `v2/intelligence-layer`; document enrich response on action items: `linear: { issue_id, identifier, url, action: "linked"|"created"|"updated"|null, confidence }`. *Done:* branch exists; contract comment in `server/routes/enrich.js` stub. *Verify:* `git branch` shows v2; main clean.

2. **Long-media ingest** — `server/routes/transcribe.js` (+ shared `server/ffmpeg.js`): raise multer limit (e.g. 500MB); if video/mp4 or file >~24MB, ffmpeg extract mono audio (mp3/ogg); split audio into <25MB / ~10–15min chunks; sequential `gpt-4o-transcribe`; stitch transcript. Keep existing opus→ogg remux. *Done:* large Gmeet-style mp4 → full transcript. *Verify:* curl small audio still works; large mp4 returns concatenated text, not 413.

3. **Linear client** — `server/linear.js`: REST with `Authorization: <token>`; `searchIssues(query)`, `getIssue(id)`, `createIssue({title,description,teamId})`, `updateIssue(id, patch)`. Team id from env or first team. *Done:* unit-smoke with real token lists/searches. *Verify:* CLI or curl wrapper hits Linear; 401 on bad token.

4. **`POST /api/enrich`** — `server/routes/enrich.js` + register in `server/index.js`. Body: `{ items, recap_line?, detected_language? }`; header `X-Linear-Api-Key`. Responses API tool loop: only action_items get tools; model must search before create; returns items with `linear` attachments + optional `enrichment_notes`. No Linear key → 400. *Done:* sample action “auth bug” links or creates a real issue. *Verify:* curl enrich with debrief JSON; non-action items unchanged.

5. **Enrich prompt** — `server/enrichPrompt.js`: resolve vague refs (“that onboarding ticket”) via search; prefer link over create; create only when no confident match; never invent issue ids. *Done:* few-shot with ambiguous vs explicit identifiers. *Verify:* fixture transcript → grounded links without hallucinated IDs.

6. **Frontend settings + pipeline** — `client/src/App.jsx`: Linear token field (localStorage); after `/api/debrief` success, if token set call `/api/enrich`; loading state “Linking to Linear…”. Enrich failure shows warning, keeps debrief results. *Done:* debrief-only still works with empty token. *Verify:* no token → columns only; with token → enrich runs.

7. **Results UI** — `client/src/Results.jsx`: action items show Linear badge (identifier + link); show created vs linked. Draft assembler optional line with issue links. *Done:* clickable issue URLs. *Verify:* enrich response renders; copy draft includes identifiers.

8. **Demo path + acceptance** — fixtures: long-audio note (or script), vague-ref transcript; README section for `LINEAR_API_KEY` / UI token. *Done:* paste path → debrief → enrich → issue visible in Linear. *Verify:* full pipeline under demo network; main branch still demo-v1 only.
