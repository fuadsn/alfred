import React, { useEffect, useRef, useState } from "react";
import Results from "./Results.jsx";

const acceptedAudioFormats = ".mp3,.wav,.m4a,.mp4,.ogg,.opus,.webm";

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

function getRecordingFileName(mimeType) {
  return mimeType.startsWith("audio/mp4") ? "recording.mp4" : "recording.webm";
}

async function transcribeAudio(audio, filename, interim = false) {
  const formData = new FormData();
  formData.append("audio", audio, filename);

  if (interim) {
    formData.append("interim", "1");
  }

  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: formData,
  });
  const result = await readApiResponse(response, "Transcription failed.");

  if (typeof result?.transcript !== "string") {
    throw new Error("The transcription service returned no transcript.");
  }

  return result.transcript;
}

export default function App() {
  const [transcript, setTranscript] = useState("");
  const [audioInput, setAudioInput] = useState(null);
  const [debriefResult, setDebriefResult] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizingRecording, setIsFinalizingRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [enrichmentWarning, setEnrichmentWarning] = useState("");
  const [copyStatus, setCopyStatus] = useState("idle");
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingRequestInFlightRef = useRef(false);
  const recordingRequestPromiseRef = useRef(Promise.resolve());
  const recordingFailedRef = useRef(false);
  const enrichmentRequestIdRef = useRef(0);
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

  const replaceTranscript = (nextTranscript) => {
    enrichmentRequestIdRef.current += 1;
    setTranscript(nextTranscript);
    setDebriefResult(null);
    setIsEnriching(false);
    setEnrichmentWarning("");
    setCopyStatus("idle");
    setRequestError("");
  };

  const requestRollingTranscript = (mimeType) => {
    if (recordingRequestInFlightRef.current || audioChunksRef.current.length === 0) {
      return;
    }

    const audio = new Blob([...audioChunksRef.current], { type: mimeType });
    recordingRequestInFlightRef.current = true;

    const request = transcribeAudio(audio, getRecordingFileName(mimeType), true)
      .then(replaceTranscript)
      .catch((error) => {
        setRequestError(error instanceof Error ? error.message : "Transcription failed.");
      })
      .finally(() => {
        recordingRequestInFlightRef.current = false;
      });

    recordingRequestPromiseRef.current = request;
  };

  const startRecording = async () => {
    if (isRecording || isFinalizingRecording || isTranscribing) {
      return;
    }

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
      recordingRequestInFlightRef.current = false;
      recordingRequestPromiseRef.current = Promise.resolve();
      recordingFailedRef.current = false;
      setAudioInput(null);
      setTranscript("");
      setDebriefResult(null);
      enrichmentRequestIdRef.current += 1;
      setIsEnriching(false);
      setEnrichmentWarning("");
      setCopyStatus("idle");

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          if (recorder.state === "recording") {
            const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
            requestRollingTranscript(recordedMimeType);
          }
        }
      });

      recorder.addEventListener(
        "stop",
        async () => {
          const recordedMimeType = recorder.mimeType || mimeType || "audio/webm";
          setIsRecording(false);
          mediaRecorderRef.current = null;
          stopMediaStream();

          if (recordingFailedRef.current) {
            return;
          }

          setIsFinalizingRecording(true);

          try {
            await recordingRequestPromiseRef.current;

            if (audioChunksRef.current.length === 0) {
              throw new Error("The recording did not contain any audio.");
            }

            const audio = new Blob([...audioChunksRef.current], { type: recordedMimeType });
            recordingRequestInFlightRef.current = true;
            const finalTranscript = await transcribeAudio(
              audio,
              getRecordingFileName(recordedMimeType),
            );

            replaceTranscript(finalTranscript);
          } catch (error) {
            setRequestError(error instanceof Error ? error.message : "Transcription failed.");
          } finally {
            recordingRequestInFlightRef.current = false;
            setIsFinalizingRecording(false);
          }
        },
        { once: true },
      );

      recorder.addEventListener(
        "error",
        () => {
          recordingFailedRef.current = true;
          setRecordingError("Recording failed. Please try again or upload an audio file.");
        },
        { once: true },
      );

      recorder.start(4_000);
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
      } else if (!isFinalizingRecording && !isTranscribing) {
        startRecording();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isFinalizingRecording, isRecording, isTranscribing]);

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
    if (!audioInput || audioInput.source !== "upload" || isTranscribing) {
      return;
    }

    setRequestError("");
    setIsTranscribing(true);

    try {
      const nextTranscript = await transcribeAudio(audioInput.audio, audioInput.name);
      replaceTranscript(nextTranscript);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscriptChange = (event) => {
    enrichmentRequestIdRef.current += 1;
    setTranscript(event.target.value);
    setDebriefResult(null);
    setIsEnriching(false);
    setEnrichmentWarning("");
    setCopyStatus("idle");
    setRequestError("");
  };

  const handleCreateDebrief = async () => {
    const trimmedTranscript = transcript.trim();

    if (!trimmedTranscript || isThinking) {
      return;
    }

    const enrichmentRequestId = enrichmentRequestIdRef.current + 1;
    enrichmentRequestIdRef.current = enrichmentRequestId;
    setRequestError("");
    setDebriefResult(null);
    setIsEnriching(false);
    setEnrichmentWarning("");
    setIsThinking(true);

    try {
      const response = await fetch("/api/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: trimmedTranscript }),
      });
      const result = await readApiResponse(response, "Recap generation failed.");

      setDebriefResult(result);
      setCopyStatus("idle");
      setIsThinking(false);
      setIsEnriching(true);

      try {
        const enrichResponse = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: result.items,
            recap_line: result.recap_line,
            detected_language: result.detected_language,
          }),
        });

        if (enrichResponse.status === 400) {
          return;
        }

        const enrichedResult = await readApiResponse(
          enrichResponse,
          "The issue-linking request failed.",
        );

        if (!Array.isArray(enrichedResult?.items)) {
          throw new Error("The issue-linking service returned no items.");
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
        if (enrichmentRequestIdRef.current === enrichmentRequestId) {
          setEnrichmentWarning(
            error instanceof Error ? error.message : "The issue-linking request failed.",
          );
        }
      } finally {
        if (enrichmentRequestIdRef.current === enrichmentRequestId) {
          setIsEnriching(false);
        }
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Recap generation failed.");
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
    <main className="min-h-screen bg-white font-body text-black">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <header className="border-b-4 border-black pb-12 pt-8 sm:pb-16 sm:pt-12">
          <div className="flex items-center justify-between gap-4 font-mono text-[10px] font-medium uppercase tracking-[0.25em] sm:text-xs">
            <span>Voice → Structure</span>
            <span className="inverted-lines border-2 border-black px-3 py-2 text-white">
              Alfred / 001
            </span>
          </div>
          <h1 className="mt-10 font-display text-5xl font-semibold leading-none tracking-tighter sm:text-8xl lg:text-9xl">
            Alfred
          </h1>
          <div className="mt-8 flex items-center gap-4" aria-hidden="true">
            <span className="h-1 flex-1 bg-black" />
            <span className="h-5 w-5 border-2 border-black" />
          </div>
          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <h2 className="max-w-3xl font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
              Voice note in. Clear recap out.
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              Record a quick note, upload audio, or paste a transcript. Everything meets in one
              editable workspace before Alfred creates the recap.
            </p>
          </div>
        </header>

        <div className="grid lg:grid-cols-2">
          <section className="py-12 lg:pr-12">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-semibold uppercase tracking-widest">
                  Step 1
                </p>
                <h2 className="mt-3 font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
                  Add audio
                </h2>
              </div>
              {(isRecording || isFinalizingRecording) && (
                <span className="inverted-lines inline-flex min-h-11 items-center gap-2 border-2 border-black px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white">
                  <span className="h-2 w-2 animate-pulse bg-white" />
                  {isRecording ? "Recording" : "Finalizing"}
                </span>
              )}
            </div>

            <div className="mt-10 space-y-5">
              <div
                className={`border-2 p-6 ${
                  isRecording || isFinalizingRecording
                    ? "inverted-lines border-black text-white"
                    : "border-black bg-white"
                }`}
              >
                <h3 className="font-display text-2xl font-semibold leading-tight">
                  Record with your microphone
                </h3>
                <p
                  className={`mt-2 text-base leading-relaxed ${
                    isRecording || isFinalizingRecording
                      ? "text-white opacity-70"
                      : "text-muted-foreground"
                  }`}
                >
                  Capture a fresh voice note directly in your browser.
                </p>

                <div className="mt-6">
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="group/stop inline-flex min-h-11 w-full items-center justify-center gap-3 border-2 border-white bg-white px-8 py-4 font-mono text-sm font-semibold uppercase tracking-widest text-black transition-colors duration-100 hover:bg-black hover:text-white"
                    >
                      <span className="h-2.5 w-2.5 bg-black group-hover/stop:bg-white" />
                      Stop recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isFinalizingRecording || isTranscribing}
                      className="group/start inline-flex min-h-11 w-full items-center justify-center gap-3 border-2 border-black bg-black px-8 py-4 font-mono text-sm font-semibold uppercase tracking-widest text-white transition-colors duration-100 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {isFinalizingRecording ? (
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin border-2 border-muted-foreground border-t-transparent"
                        />
                      ) : (
                        <span className="h-3 w-3 border-2 border-white group-hover/start:border-black" />
                      )}
                      {isFinalizingRecording ? "Finalizing…" : "Start recording →"}
                    </button>
                  )}
                  <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest opacity-70">
                    or press Space
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                <span className="h-px flex-1 bg-black" />
                or
                <span className="h-px flex-1 bg-black" />
              </div>

              <label className="group/upload block cursor-pointer border-2 border-dashed border-black bg-white p-6 transition-colors duration-100 hover:bg-black hover:text-white focus-within:border-4 focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-[3px] focus-within:outline-black">
                <span className="block font-display text-2xl font-semibold">Upload an audio file</span>
                <span className="mt-2 block font-mono text-[10px] uppercase leading-relaxed tracking-widest text-muted-foreground group-hover/upload:text-white">
                  MP3, WAV, M4A, MP4, OGG, OPUS, or WEBM
                </span>
                <span className="mt-5 inline-flex min-h-11 items-center border-2 border-black bg-white px-4 py-2 font-mono text-xs font-semibold uppercase tracking-widest text-black group-hover/upload:border-white">
                  Choose file →
                </span>
                <input
                  type="file"
                  accept={acceptedAudioFormats}
                  onChange={handleFileChange}
                  disabled={isRecording || isFinalizingRecording}
                  className="sr-only"
                />
              </label>
            </div>

            {recordingError && (
              <p role="alert" className="mt-5 border-l-4 border-black bg-muted px-5 py-4 text-base">
                {recordingError}
              </p>
            )}

            <div className="mt-5 min-h-14 border border-black bg-white px-4 py-3">
              {audioInput ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{audioInput.name}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {audioInput.source} ready
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAudioInput(null);
                      setRequestError("");
                    }}
                    disabled={isTranscribing}
                    className="min-h-11 shrink-0 px-3 font-mono text-[10px] font-semibold uppercase tracking-widest underline decoration-1 underline-offset-4 transition-colors duration-100 hover:bg-black hover:text-white disabled:text-muted-foreground"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-base leading-7 text-muted-foreground">No audio selected yet.</p>
              )}
            </div>

            <button
              type="button"
              onClick={handleTranscribe}
              disabled={!audioInput || isRecording || isFinalizingRecording || isTranscribing}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-3 border-2 border-black bg-black px-8 py-4 font-mono text-sm font-semibold uppercase tracking-widest text-white transition-colors duration-100 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted disabled:text-muted-foreground"
            >
              {isTranscribing && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin border-2 border-white border-t-transparent"
                />
              )}
              {isTranscribing ? "Transcribing…" : "Transcribe upload →"}
            </button>
          </section>

          <section className="flex flex-col border-t-4 border-black py-12 lg:border-l-4 lg:border-t-0 lg:pl-12">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-widest">
                Step 2
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
                Review the transcript
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Audio transcription will appear here. You can also paste text directly and edit
                anything before continuing.
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <label
                htmlFor="transcript"
                className="font-mono text-xs font-semibold uppercase tracking-widest"
              >
                Transcript
              </label>
              {isRecording && (
                <span
                  role="status"
                  className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-widest"
                >
                  <span className="h-1.5 w-1.5 animate-pulse bg-black" />
                  live…
                </span>
              )}
              {isFinalizingRecording && (
                <span
                  role="status"
                  className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
                >
                  finalizing…
                </span>
              )}
            </div>
            <textarea
              id="transcript"
              value={transcript}
              onChange={handleTranscriptChange}
              placeholder="Paste your transcript here, or transcribe a recording or uploaded file…"
              className="mt-3 min-h-80 flex-1 resize-y border-2 border-black bg-white p-5 text-lg leading-relaxed text-black outline-none transition-[border-width] duration-100 placeholder:italic placeholder:text-muted-foreground focus:border-4"
            />

            {requestError && (
              <p
                role="alert"
                className="mt-4 border-l-4 border-black bg-muted px-5 py-4 text-base"
              >
                {requestError}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>Editable before submission</span>
              <span>{transcript.trim() ? transcript.trim().split(/\s+/).length : 0} words</span>
            </div>

            <button
              type="button"
              onClick={handleCreateDebrief}
              disabled={!canCreateDebrief || isThinking}
              className="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-3 border-2 border-black bg-black px-8 py-4 font-mono text-sm font-semibold uppercase tracking-widest text-white transition-colors duration-100 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted disabled:text-muted-foreground"
            >
              {isThinking && (
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin border-2 border-white border-t-transparent"
                />
              )}
              {isThinking ? "Thinking…" : "Create recap →"}
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
