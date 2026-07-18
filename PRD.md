# Debrief — PRD

**Track:** Everyday Productivity
**Build window:** 3 hours, solo build, Codex handling implementation
**Extends:** Shipshape's proven loop (STT → visible reasoning → autonomous action), new domain

---

## 1. Summary

Debrief turns one raw voice note — recorded directly, uploaded, or exported from WhatsApp, in any language or code-switched mix of languages — into a classified breakdown: decisions made, open questions, action items, plus a single ready-to-send recap message, with every classification showing *why* the agent put it there.

## 2. Problem

After any working session (standup, client call, pairing session, planning meeting), the useful output is tangled up in someone's head or a messy voice memo — very often a WhatsApp voice note, since that's where a large share of real-world work voice notes actually live, frequently in a code-switched mix of languages rather than clean single-language audio. Separating "what did we decide" from "what's still open" from "who owes what" is boring, low-judgment work — which is exactly why it gets skipped under time pressure, and why decisions get re-litigated and action items get dropped. Debrief automates the separation, then goes one step further and drafts the message that actually closes the loop, so the human's only remaining job is to hit send.

## 3. Non-goals

Explicit, because a 3-hour window has zero slack for scope creep:

- No multi-speaker diarization — assume one person narrating, not a transcribed group meeting
- No live/streaming transcription — audio is recorded or uploaded as one unit, processed as a batch
- No persistence, no accounts, no history — every session is stateless
- No per-channel draft variants (Slack vs. email vs. ticket) — one consolidated format only (§7 explains the resolution)
- No multi-turn correction UI ("edit this item, reclassify") — output is one-shot; wrong output means rerun, not patch
- No mobile app — desktop browser, demo on a laptop
- **No live WhatsApp bot / webhook integration.** Voice notes come in via manual export + upload (§5.1), not an automated Cloud API bot. A live bot needs a Meta Business app, a public webhook (a tunnel like ngrok, on unreliable train wifi), and a two-step media-download flow — real new infrastructure and a new single point of failure, which cuts directly against every risk-reduction decision already made in this doc. Manual export gets the actual value (the voice note itself) for near-zero build cost.

## 4. Primary user & core scenario

Someone who just finished a work session and has 90 seconds to record a debrief before moving to the next thing.

1. User finishes a session, opens Debrief, hits record — or uploads a file, including one exported straight from a WhatsApp chat
2. User (or the original WhatsApp voice note) talks through what happened, unscripted — decisions, loose ends, commitments, all mixed together, possibly in more than one language
3. User stops recording / submits
4. Within ~20 seconds: three columns populate — Decisions, Open Questions, Action Items — each item with a one-line rationale for why it landed there
5. Below the columns, one consolidated draft message appears, formatted for Slack, in English, ready to copy
6. User copies, pastes, sends. Done.

## 5. Functional requirements

### 5.1 Input

- Accept uploaded audio files: mp3, wav, m4a — and, for WhatsApp, ogg/opus (see the format note below)
- In-browser mic recording via MediaRecorder API. **Note:** MediaRecorder produces `audio/webm` (Chrome) or `audio/mp4` (Safari) — the backend MUST accept webm and mp4/m4a from the mic path, not just the upload-list formats.
- **WhatsApp path:** user exports the voice note from the chat (long-press → Forward/Save, or right-click on WhatsApp Web/Desktop → Save) and uploads the resulting file through the same upload control. No new UI, no bot, no webhook — this is the whole integration.
- **Format gotcha, confirmed by direct developer reports, not assumed:** WhatsApp voice notes commonly export as `.opus`. OpenAI's transcription API has explicitly rejected raw `.opus` uploads with an "Invalid file format" error in reports from developers building this exact WhatsApp-voice-note use case. `.ogg` has historically been accepted for `whisper-1`, but current official documentation is inconsistent about whether `.ogg`/`.oga`/`.flac` are still accepted across the newer transcription models versus the older `whisper-1`-only list. **Test this for real against the live API in the first 20 minutes (§11) — don't assume it works.** Fallback if the direct upload fails: a one-line ffmpeg remux (`ffmpeg -i in.opus -c:a copy out.ogg`, or transcode straight to `.mp3` if `.ogg` itself turns out to be rejected too) before forwarding the file to the API. This is the single highest-uncertainty item in this whole addition — resolve it early, not during integration testing.
- **Required, not optional:** the plain-textarea paste fallback (unchanged from before) — doubles as the safety net if the audio-format question doesn't resolve cleanly in time.
- Do not hardcode a `language` parameter on the transcription call — leave it unset so auto-detection handles code-switched audio properly (§5.5).

### 5.2 Transcription

- Single batch call to STT (see §8 for the updated model choice and why)
- On failure or timeout (>10s), surface a clear error and drop straight to the manual-paste textarea rather than hanging

### 5.3 Classification — the core logic

Three categories, defined precisely enough that both the model and Fuad reviewing output have an unambiguous bar:

- **Decision** — a choice the speaker frames as settled. Marker language: "we decided," "going with," "final call," "that's locked in."
- **Open Question** — something raised as explicitly unresolved. Marker language: "not sure," "TBD," "need to figure out," "unclear," "need someone to check."
- **Action Item** — a concrete next step with a stated or clearly implied owner. Marker language: "I'll," "need to," "have to ping/send/follow up," ideally with a timeframe.
- **Implicit fourth bucket — Ignore (never shown in UI):** anything that doesn't clearly fit one of the three above is dropped silently, not force-classified. Precision over recall — five confidently-correct items beat eight items with two embarrassing misfires, especially live in front of judges.

Each classified item carries:

| Field | Purpose |
|---|---|
| `text` | The item, tightened into one clean sentence — not a raw transcript excerpt |
| `category` | `decision` / `open_question` / `action_item` |
| `reasoning` | One sentence, in the model's own words, explaining *why* it counts as that category — this is the visible-reasoning payoff carried over from Shipshape, and it's the differentiator, not a nice-to-have |
| `source_quote` | Closest verbatim span from the transcript, for traceability and trust — always in the original language/script actually spoken (§5.5), never translated |

### 5.4 Draft generation

**Design decision, resolving a scoping ambiguity:** rather than a separate screen or interaction, the consolidated draft is generated in the *same* model call as classification and rendered as one block below the three columns. The UI stays at "transcript in, structured stuff out" — one more rendered block, not a fourth screen.

- One consolidated message, Slack-mrkdwn formatted, in English (§5.5): brief recap line → Decisions (bulleted) → Open Questions (bulleted) → Action Items (bulleted, with owner where statable)
- **Slack mrkdwn, not GitHub markdown:** Slack renders `*bold*` (single asterisks), NOT `**bold**`, and does not render `- [ ]` checkboxes. The draft must use Slack's actual syntax: `*Section*` headers, `•` or `-` bullets, no checkbox syntax — so a paste into real Slack looks right.
- Default and only format for this build: Slack mrkdwn. Email/ticket formats are out of scope (§3) — if there's spare time past minute 150, add a format toggle, not before.
- One copy-to-clipboard button. That's the entire interaction surface for this piece.

### 5.5 Language handling

Real voice notes — especially WhatsApp ones — are frequently code-switched (e.g., Hindi-English, or any other language mixed with English), not clean single-language audio. Two decisions, made explicit rather than left to the model to improvise:

- **Transcription:** no `language` parameter forced on the STT call. Auto-detection handles code-switching better than a forced single-language hint, which can degrade accuracy when the audio doesn't actually match the forced language.
- **Output language — the decision that actually needs resolving:** `source_quote` stays verbatim, in whatever language and script was actually spoken. This is the trust/traceability anchor (§5.3) and must never be translated or paraphrased. `text`, `reasoning`, and `draft` are normalized to English by default, since the payoff artifact is a team-facing recap that needs to be broadly readable regardless of who spoke the original note. This is a default, not a hard rule — flip it if the target team shares a single non-English language — but English-normalized output is the safer choice for a demo audience too.
- One explicit line added to the system prompt (§7, Appendix A) instructing this behavior, plus a second worked example (Appendix A, Example 2) that's code-switched, so Codex has a concrete target to build the prompt against rather than a description to interpret.

## 6. System architecture

Three components, deliberately minimal:

1. **Frontend** — single-page app. Recorder/upload control → transcript display (editable, so the paste-fallback and STT output share one code path) → three-column results → draft block.
2. **Backend** — a thin proxy, two endpoints. API keys don't belong in client-side JS, even for a demo — this is the one thing not worth shortcutting under time pressure.
   - `POST /transcribe` — audio in, transcript text out
   - `POST /debrief` — transcript in, `{ items: [...], draft: "...", detected_language: "..." }` out
3. **LLM call structure — one structured-output call, not two.** Classification and draft generation happen in a single request returning the items array, the draft string, and the detected language in one JSON payload. Two calls means two failure points and roughly double the latency; one call with a well-specified JSON schema does all three jobs in one round trip.

No new architectural component for multilingual handling — it's the same LLM call, same endpoint, just a different prompt instruction and a richer test sample. The one conditional addition is inside `/transcribe`: if the uploaded file is `.opus` and the direct-upload test (§11) fails, add a remux-via-ffmpeg step before the file is forwarded to the transcription API. That is the only place this whole addition touches the architecture.

**Data flow:** `audio/text → [POST /transcribe] (± ffmpeg remux) → transcript → [POST /debrief] → { items[], draft, detected_language } → render`

## 7. Data contract

Lock this before writing any implementation code — Codex builds against this, not the other way around.

```json
// POST /debrief response shape
{
  "items": [
    {
      "text": "Going with Postgres over Mongo for the new service",
      "category": "decision",
      "reasoning": "Settled/final language (\"we decided\"), no hedge.",
      "source_quote": "we decided to go with Postgres over Mongo for the new service, that's final"
    }
  ],
  "draft": "*Session recap*\n\n*Decisions*\n- ...\n\n*Open Questions*\n- ...\n\n*Action Items*\n- ...",
  "detected_language": "English"
}
```

`detected_language` is a cheap addition — the model already implicitly knows this while processing the transcript — and it's a small transparency win consistent with the product's whole visible-reasoning philosophy.

## 8. Tech stack & rationale

- **STT: `gpt-4o-transcribe` (or `gpt-4o-mini-transcribe` for lower cost) — not legacy `whisper-1`.** Same vendor as the reasoning call below (one API key, one auth path, one thing to test before boarding — unchanged rationale from the original build). The newer transcription models are the better 2026 default specifically for accuracy and multilingual recognition, which now matters directly given §5.5; `whisper-1` only wins if word-level timestamps or SRT/VTT output are needed, and they aren't here. All input-format questions in §5.1 apply the same way regardless of which of the three models is picked.
- **Reasoning/classification/draft: OpenAI GPT model, structured outputs (JSON schema mode).** Structured outputs remove a whole class of "model returned malformed JSON" failures that would otherwise eat build time in parsing and retry logic.
- **Frontend: Vite + React + Tailwind.** Already fluent in this stack from the recent take-home project — zero learning curve beats a marginally "better" choice right now.
- **Backend: minimal Node/Express**, same repo as the frontend, so there's one `npm install`, one dev server, and Codex isn't context-switching languages mid-build.
- **Conditional: ffmpeg**, only if the opus-upload test in §11 fails. A single remux command, no re-encode needed if it's genuinely just a container mismatch. Install and sanity-test before boarding if there's any doubt — not something to discover you need for the first time on train wifi.

**Pre-hackathon prep — do this before boarding, not during:** `npm install` everything once with working internet, confirm both API keys with one real transcription call (using an actual `.opus`/`.ogg` file, not just an mp3) and one real GPT call, cache `node_modules`, and have ffmpeg installed and tested locally even if it ends up unused. Train wifi is not the place to discover a registry timeout or a missing binary.

## 9. Non-functional requirements

- **Latency budget:** full pipeline (transcribe + classify + draft) under ~20 seconds for a 2–3 minute voice note. Test this explicitly before the final rehearsal — a slow demo has a dead-air problem, and that's not something to discover live.
- **Resilience:** the paste-transcript fallback (§5.1) is a first-class path, not an afterthought — it's the answer to "what if the mic, STT, or the WhatsApp file format doesn't cooperate during the live demo."
- **Script rendering:** if a transcript comes back in a non-Latin script (Devanagari, etc.), the UI needs to render it correctly. This typically works out of the box with standard system font stacks, but verify with a real non-English sample before the demo rather than assuming — it's a one-line check, not a redesign.
- **No accounts, no auth, no persistence** — keeps build surface to exactly the pipeline above.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Train wifi drops mid-build | Pre-cache all dependencies before boarding; keep the stack to two vendors total |
| WhatsApp's `.opus` export (or `.ogg`) gets rejected by the transcription API | Test a real `.opus`/`.ogg` upload against the live API in the first 20 minutes, not during integration testing; have the ffmpeg remux fallback ready if it fails |
| STT fails or mishears in a noisy train car | Manual-paste fallback is required, not optional; test it with a real noisy sample beforehand |
| Code-switched audio (e.g., Hindi-English) transcribes or classifies less accurately than clean single-language audio | Use `gpt-4o-transcribe` with auto-detect (no forced `language` param); test with one real code-switched sample in the existing integration-test slot — same treatment as the noisy-train-car risk |
| Non-Latin script text doesn't render correctly in the UI | Verify with a real non-English sample before the demo; standard system fonts usually handle it, but don't assume |
| Model misclassifies items live | Tight three-category taxonomy with an explicit "ignore, don't force-fit" rule; test against real sample transcripts before the demo and tune against actual misses, not guesses |
| Mic or audio fails on the demo device | Keep one pre-recorded backup audio file *and* its pre-transcribed text ready, so the pipeline always has a working input |
| Time overrun on UI wiring | UI is deliberately three static columns + one text block — no routing, no state library, no animation polish |

## 11. Build sequence (3-hour timebox)

| Time | What | Who |
|---|---|---|
| 0:00–0:20 | Confirm API keys work live — **including one real `.opus`/`.ogg` test upload** — lock the JSON schema in §7, scaffold the repo | Fuad — judgment call, not grunt work; Codex builds against whatever's decided here |
| 0:20–1:20 | Backend: `/transcribe` + `/debrief` endpoints, structured-output prompt (including the language-handling instruction), error handling, ffmpeg fallback only if the 0:00–0:20 test showed it's needed | Codex — grunt work, reviewed not hand-written |
| 1:20–2:00 | Frontend: recorder/upload, transcript view, three-column render, draft block, copy button | Codex — grunt work |
| 2:00–2:30 | Integration test using a real WhatsApp-exported, code-switched voice note (not a generic sample); tune the prompt against actual misclassifications | Fuad — deciding what "correct" looks like isn't delegable |
| 2:30–2:50 | Record backup audio + backup transcript; rehearse the demo narrative once, out loud | Fuad |
| 2:50–3:00 | Buffer | — |

No new time added for WhatsApp or multilingual support beyond the format test in the first block — the existing 2:00–2:30 integration-test slot now uses better-targeted test data instead of a generic sample. Same budget, sharper test.

## 12. Acceptance criteria

- [ ] A real 2–3 minute rambly voice note produces at least one correct item in each of the three categories
- [ ] Every item shown has a genuine one-sentence reasoning string, not a blank or generic placeholder
- [ ] The draft block renders as valid, readable Slack mrkdwn and copies cleanly to clipboard
- [ ] Paste-transcript fallback works end to end, independent of the mic/STT path
- [ ] A WhatsApp-exported voice note (`.opus`/`.ogg`) uploads and transcribes correctly through the same pipeline as a recorded note
- [ ] A code-switched sample (e.g., Hindi-English) produces correctly classified items with `source_quote` preserved in the original language/script and `text`/`reasoning`/`draft` in English
- [ ] Non-Latin script text, if any appears in `source_quote`, renders correctly in the UI
- [ ] Full pipeline completes in under 20 seconds under actual demo network conditions
- [ ] A backup audio file + backup transcript exist and have been tested as a fallback path

## 13. Demo script (60–90 seconds)

1. Frame it in one line: "Every work session ends with decisions, open questions, and action items tangled together in your head — often in a WhatsApp voice note, often in more than one language. Debrief untangles them."
2. Hit record — or play the backup, ideally a real WhatsApp-exported voice note in a code-switched language if the format test passed; it's a stronger demo precisely because it's not a clean scripted English recording
3. While it processes, narrate: "transcribing, then one model call classifying everything and drafting the recap"
4. Results land — walk through one item per column, reading its reasoning out loud. This is the moment that sells it: the reasoning trace, not the classification itself.
5. Scroll to the draft, copy it. "That's the whole loop — voice note in, from wherever it actually lives, sendable recap out, in English, and you can see why it made every call."

---

## Appendix A — Worked examples

Ground-truth examples to embed as few-shots in the `/debrief` system prompt, so the model has an unambiguous target rather than a description to interpret.

### Example 1 — English

**Input transcript:**

> Okay quick recap of today's sync. We decided to go with Postgres over Mongo for the new service, that's final. I still need to figure out who's going to own the migration script actually, nobody volunteered. I'll ping Priya about the API contract before tomorrow's standup. Also we're pushing the launch date to the 15th, that's locked in. Not totally sure if the client is fine with that slip though, need someone to check.

**Expected items:**

1. `decision` — "Going with Postgres over Mongo for the new service" — *settled/final language, no hedge*
2. `open_question` — "Who owns the migration script" — *explicitly unresolved, nobody volunteered*
3. `action_item` — "Ping Priya about the API contract before tomorrow's standup" — *first-person commitment with explicit deadline*
4. `decision` — "Launch date pushed to the 15th" — *explicitly locked-in language*
5. `open_question` — "Whether the client is fine with the launch date slip" — *explicitly flagged as unconfirmed, needs follow-up*

`detected_language`: `"English"`

**Expected draft (Slack mrkdwn — single-asterisk bold, no checkboxes):**

```
*Session recap*

*Decisions*
- Going with Postgres over Mongo for the new service
- Launch date pushed to the 15th

*Open Questions*
- Who owns the migration script?
- Is the client fine with the launch date slip?

*Action Items*
- Ping Priya about the API contract before tomorrow's standup
```

### Example 2 — code-switched (Hindi-English)

Same underlying content as Example 1, deliberately, so it doubles as an invariance check: the extracted items and the draft should come out the same regardless of which language the note was spoken in. If the output shape changes based on input language, that's a prompt bug to fix before the demo, not a quirk to work around live.

**Input transcript:**

> Okay so client ke saath call thi, we decided ki hum Postgres use karenge instead of Mongo, that's final. Migration script kaun karega abhi tak clear nahi hai, nobody volunteered. I'll ping Priya about the API contract, kal standup se pehle. Launch date bhi 15th tak push ho gayi, locked in. Lekin client us delay se okay hai ya nahi, pata nahi, someone needs to check.

**Expected items:**

1. `decision` — "Going with Postgres over Mongo for the new service" — *settled/final language ("we decided," "that's final")* — `source_quote`: "we decided ki hum Postgres use karenge instead of Mongo, that's final"
2. `open_question` — "Who owns the migration script" — *explicitly unresolved, nobody volunteered* — `source_quote`: "Migration script kaun karega abhi tak clear nahi hai, nobody volunteered"
3. `action_item` — "Ping Priya about the API contract before tomorrow's standup" — *first-person commitment with explicit deadline* — `source_quote`: "I'll ping Priya about the API contract, kal standup se pehle"
4. `decision` — "Launch date pushed to the 15th" — *explicitly locked-in language* — `source_quote`: "Launch date bhi 15th tak push ho gayi, locked in"
5. `open_question` — "Whether the client is fine with the launch date slip" — *explicitly flagged as unconfirmed* — `source_quote`: "Lekin client us delay se okay hai ya nahi, pata nahi, someone needs to check"

`detected_language`: `"Hindi-English (code-switched)"`

**Expected draft:** structurally and linguistically identical to Example 1's draft — English, same three-section format.
