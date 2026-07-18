import React, { useEffect, useRef, useState } from "react";
import Results from "./Results.jsx";

const acceptedAudioFormats = ".mp3,.wav,.m4a,.mp4,.ogg,.opus,.webm";
const linearApiKeyStorageKey = "linear_api_key";

function getStoredLinearApiKey() {
  try {
    return window.localStorage.getItem(linearApiKeyStorageKey) || "";
  } catch {
    return "";
  }
}

function storeLinearApiKey(apiKey) {
  try {
    if (apiKey) {
      window.localStorage.setItem(linearApiKeyStorageKey, apiKey);
    } else {
      window.localStorage.removeItem(linearApiKeyStorageKey);
    }
  } catch {
    // The setting remains usable for this session when storage is unavailable.
  }
}

function getRecordingMimeType() {
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return "audio/webm";
  }

  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }

  return "";
}

async function readApiResponse(response, fallbackError) {
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.error || fallbackError);
  }

  if (result === null) {
    throw new Error(fallbackError);
  }

  return result;
}

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [audioInput, setAudioInput] = useState(null);
  const [debriefResult, setDebriefResult] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [enrichmentWarning, setEnrichmentWarning] = useState("");
  const [copyStatus, setCopyStatus] = useState("idle");
  const [linearApiKey, setLinearApiKey] = useState(getStoredLinearApiKey);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const copyResetTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      clearTimeout(copyResetTimeoutRef.current);
    };
  }, []);

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startRecording = async () => {
    setRecordingError("");
    setRequestError("");

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = getRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAudioInput(null);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener(
        "stop",
        () => {
          const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(audioChunksRef.current, { type: recordedMimeType });
          const extension = recordedMimeType.startsWith("audio/mp4") ? "mp4" : "webm";

          setAudioInput({
            audio: blob,
            name: `recording.${extension}`,
            source: "recording",
          });
          setIsRecording(false);
          mediaRecorderRef.current = null;
          stopMediaStream();
        },
        { once: true },
      );

      recorder.addEventListener(
        "error",
        () => {
          setRecordingError("Recording failed. Please try again or upload an audio file.");
          setIsRecording(false);
          stopMediaStream();
        },
        { once: true },
      );

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      stopMediaStream();
      setRecordingError(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow access or upload an audio file instead."
          : "Could not start recording. Please try again or upload an audio file.",
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const isSpace = event.code === "Space" || event.key === " ";

      if (!isSpace || event.repeat) {
        return;
      }

      const activeElement = document.activeElement;
      const activeTagName = activeElement?.tagName;
      const isEditable =
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(activeTagName) ||
        activeElement?.isContentEditable;

      if (isEditable) {
        return;
      }

      event.preventDefault();

      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isRecording]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setRecordingError("");
    setRequestError("");
    setAudioInput({ audio: file, name: file.name, source: "upload" });
  };

  const handleTranscribe = async () => {
    if (!audioInput || isTranscribing) {
      return;
    }

    setRequestError("");
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append("audio", audioInput.audio, audioInput.name);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const result = await readApiResponse(response, "Transcription failed.");

      if (typeof result?.transcript !== "string") {
        throw new Error("The transcription service returned no transcript.");
      }

      setTranscript(result.transcript);
      setDebriefResult(null);
      setEnrichmentWarning("");
      setCopyStatus("idle");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscriptChange = (event) => {
    setTranscript(event.target.value);
    setDebriefResult(null);
    setEnrichmentWarning("");
    setCopyStatus("idle");
    setRequestError("");
  };

  const handleLinearApiKeyChange = (event) => {
    const apiKey = event.target.value;

    setLinearApiKey(apiKey);
    storeLinearApiKey(apiKey);
  };

  const handleCreateDebrief = async () => {
    const trimmedTranscript = transcript.trim();

    if (!trimmedTranscript || isThinking) {
      return;
    }

    setRequestError("");
    setEnrichmentWarning("");
    setDebriefResult(null);
    setIsThinking(true);

    try {
      const response = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmedTranscript }),
      });
      const result = await readApiResponse(response, "Debrief generation failed.");

      setDebriefResult(result);
      setCopyStatus("idle");
      setIsThinking(false);

      const apiKey = linearApiKey.trim();

      if (apiKey) {
        setIsEnriching(true);

        try {
          const enrichResponse = await fetch("/api/enrich", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Linear-Api-Key": apiKey,
            },
            body: JSON.stringify({
              items: result.items,
              recap_line: result.recap_line,
              detected_language: result.detected_language,
            }),
          });
          const enrichedResult = await readApiResponse(
            enrichResponse,
            "The enrichment request failed.",
          );

          if (!Array.isArray(enrichedResult?.items)) {
            throw new Error("The Linear linking service returned no items.");
          }

          setDebriefResult((currentResult) =>
            currentResult === result
              ? {
                  ...result,
                  ...enrichedResult,
                  items: enrichedResult.items,
                }
              : currentResult,
          );
        } catch (error) {
          setEnrichmentWarning(
            `Linear linking failed: ${error instanceof Error ? error.message : "Unknown error."}`,
          );
        } finally {
          setIsEnriching(false);
        }
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Debrief generation failed.");
    } finally {
      setIsThinking(false);
    }
  };

  const canCreateDebrief = transcript.trim().length > 0;

  const handleCopyDraft = async (draft) => {
    clearTimeout(copyResetTimeoutRef.current);

    try {
      await navigator.clipboard.writeText(draft);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }

    copyResetTimeoutRef.current = setTimeout(() => setCopyStatus("idle"), 1_800);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-400">
            Debrief
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Voice note in. Clear recap out.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            Record a quick note, upload audio, or paste a transcript. Everything meets in one
            editable workspace before the debrief is created.
          </p>
        </header>

        <details className="group mx-auto mt-6 max-w-3xl rounded-xl border border-slate-800 bg-slate-900/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-medium text-slate-300 [&::-webkit-details-marker]:hidden">
            <span>Settings</span>
            <span className="flex items-center gap-2 text-xs text-slate-500">
              Linear
              <span
                aria-hidden="true"
                className="text-sm transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </span>
          </summary>
          <div className="border-t border-slate-800 px-4 py-4">
            <label htmlFor="linear-api-key" className="text-sm font-medium text-slate-300">
              Linear API key
            </label>
            <input
              id="linear-api-key"
              type="password"
              value={linearApiKey}
              onChange={handleLinearApiKeyChange}
              autoComplete="off"
              spellCheck="false"
              placeholder="lin_api_…"
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Stored locally, sent only to your own server.
            </p>
          </div>
        </details>

        <div className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
                  Step 1
                </p>
                <h2 className="mt-2 text-xl font-semibold">Add audio</h2>
              </div>
              {isRecording && (
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-300 ring-1 ring-inset ring-rose-500/30">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                  Recording
                </span>
              )}
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                <h3 className="font-medium text-slate-100">Record with your microphone</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Capture a fresh voice note directly in your browser.
                </p>

                <div className="mt-4">
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-slate-950"
                    >
                      <span className="h-2.5 w-2.5 rounded-sm bg-white" />
                      Stop recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"
                    >
                      <span className="h-3 w-3 rounded-full bg-slate-950" />
                      Start recording
                    </button>
                  )}
                  <p className="mt-2 text-center text-xs text-slate-500">or press Space</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-600">
                <span className="h-px flex-1 bg-slate-800" />
                or
                <span className="h-px flex-1 bg-slate-800" />
              </div>

              <label className="block cursor-pointer rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-5 transition hover:border-cyan-500/70 hover:bg-slate-950/70 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/30">
                <span className="block font-medium text-slate-100">Upload an audio file</span>
                <span className="mt-1 block text-sm leading-6 text-slate-400">
                  MP3, WAV, M4A, MP4, OGG, OPUS, or WEBM
                </span>
                <span className="mt-4 inline-flex rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200">
                  Choose file
                </span>
                <input
                  type="file"
                  accept={acceptedAudioFormats}
                  onChange={handleFileChange}
                  disabled={isRecording}
                  className="sr-only"
                />
              </label>
            </div>

            {recordingError && (
              <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {recordingError}
              </p>
            )}

            <div className="mt-5 min-h-14 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
              {audioInput ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{audioInput.name}</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">{audioInput.source} ready</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAudioInput(null);
                      setRequestError("");
                    }}
                    disabled={isTranscribing}
                    className="shrink-0 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-sm leading-7 text-slate-500">No audio selected yet.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleTranscribe}
              disabled={!audioInput || isRecording || isTranscribing}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isTranscribing && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"
                />
              )}
              {isTranscribing ? "Transcribing…" : "Transcribe"}
            </button>
          </section>

          <section className="flex flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
                Step 2
              </p>
              <h2 className="mt-2 text-xl font-semibold">Review the transcript</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Audio transcription will appear here. You can also paste text directly and edit
                anything before continuing.
              </p>
            </div>

            <label htmlFor="transcript" className="mt-6 text-sm font-medium text-slate-300">
              Transcript
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={handleTranscriptChange}
              placeholder="Paste your transcript here, or transcribe a recording or uploaded file…"
              className="mt-2 min-h-80 flex-1 resize-y rounded-2xl border border-slate-700 bg-slate-950/70 p-4 text-base leading-7 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
            />

            {requestError && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-inset ring-rose-500/20"
              >
                {requestError}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-4 text-xs text-slate-500">
              <span>Editable before submission</span>
              <span>{transcript.trim() ? transcript.trim().split(/\s+/).length : 0} words</span>
            </div>

            <button
              type="button"
              onClick={handleCreateDebrief}
              disabled={!canCreateDebrief || isThinking}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
            >
              {isThinking && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"
                />
              )}
              {isThinking ? "Thinking…" : "Create debrief"}
            </button>

          </section>
        </div>

        {debriefResult && (
          <Results
            result={debriefResult}
            copyStatus={copyStatus}
            onCopy={handleCopyDraft}
            isEnriching={isEnriching}
            enrichmentWarning={enrichmentWarning}
            onDismissEnrichmentWarning={() => setEnrichmentWarning("")}
          />
        )}
      </div>
    </main>
  );
}
