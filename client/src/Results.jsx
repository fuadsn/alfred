import React from "react";

export const RESULT_CATEGORIES = [
  {
    key: "decision",
    title: "Decisions",
    dotClass: "bg-cyan-400",
    countClass: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/20",
  },
  {
    key: "open_question",
    title: "Open Questions",
    dotClass: "bg-amber-400",
    countClass: "bg-amber-400/10 text-amber-300 ring-amber-400/20",
  },
  {
    key: "action_item",
    title: "Action Items",
    dotClass: "bg-emerald-400",
    countClass: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20",
  },
];

const LINEAR_ACTION_STYLES = {
  linked: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/25",
  created: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25",
  updated: "bg-violet-400/10 text-violet-300 ring-violet-400/25",
};

export function groupItems(items) {
  const safeItems = Array.isArray(items) ? items : [];

  return Object.fromEntries(
    RESULT_CATEGORIES.map(({ key }) => [
      key,
      safeItems.filter((item) => item?.category === key),
    ]),
  );
}

export function assembleDraft(items, recapLine) {
  const safeItems = Array.isArray(items) ? items : [];
  const lines = ["*Session recap*"];
  const cleanRecapLine = typeof recapLine === "string" ? recapLine.trim() : "";

  if (cleanRecapLine) {
    lines.push("", cleanRecapLine);
  }

  for (const { key, title } of RESULT_CATEGORIES) {
    const bullets = safeItems
      .filter((item) => item?.category === key && typeof item.text === "string")
      .map((item) => {
        const text = item.text.trim();
        const linear = item.linear;
        const hasLinearLink =
          key === "action_item" &&
          linear?.action &&
          typeof linear.identifier === "string" &&
          typeof linear.url === "string";

        return hasLinearLink ? `${text} (${linear.identifier}: ${linear.url})` : text;
      })
      .filter(Boolean)
      .map((text) => `- ${text}`);

    if (bullets.length > 0) {
      lines.push("", `*${title}*`, ...bullets);
    }
  }

  return lines.join("\n");
}

export default function Results({
  result,
  copyStatus,
  onCopy,
  isEnriching = false,
  enrichmentWarning = "",
  onDismissEnrichmentWarning,
}) {
  const items = Array.isArray(result.items) ? result.items : [];
  const groupedItems = groupItems(items);
  const draft = assembleDraft(items, result.recap_line);

  return (
    <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-black/20 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400">
            Debrief complete
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            What came out of the session
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEnriching && (
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-full bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 ring-1 ring-inset ring-cyan-400/20"
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-300/40 border-t-cyan-300"
              />
              Linking to Linear…
            </span>
          )}
          <span className="w-fit rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-slate-700">
            {result.detected_language}
          </span>
        </div>
      </div>

      {enrichmentWarning && (
        <div
          role="alert"
          className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200 ring-1 ring-inset ring-amber-400/20"
        >
          <span>{enrichmentWarning}</span>
          <button
            type="button"
            onClick={onDismissEnrichmentWarning}
            className="shrink-0 font-semibold text-amber-300 transition hover:text-amber-100"
            aria-label="Dismiss Linear linking warning"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-7 grid gap-5 lg:grid-cols-3">
        {RESULT_CATEGORIES.map((category) => {
          const categoryItems = groupedItems[category.key];

          return (
            <section
              key={category.key}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2.5 font-semibold text-slate-100">
                  <span className={`h-2.5 w-2.5 rounded-full ${category.dotClass}`} />
                  {category.title}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${category.countClass}`}
                >
                  {categoryItems.length}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {categoryItems.length > 0 ? (
                  categoryItems.map((item, index) => {
                    const linearAction = item.linear?.action;
                    const linearStyle = LINEAR_ACTION_STYLES[linearAction];
                    const confidence = Math.round(
                      Math.max(0, Math.min(1, Number(item.linear?.confidence) || 0)) * 100,
                    );

                    return (
                      <article
                        key={`${category.key}-${index}-${item.text}`}
                        className="rounded-xl border border-slate-800 bg-slate-900/80 p-4"
                      >
                        <h4 className="text-base font-semibold leading-6 text-slate-100">
                          {item.text}
                        </h4>
                        {category.key === "action_item" && linearAction && linearStyle && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ring-1 ring-inset ${linearStyle}`}
                            >
                              <a
                                href={item.linear.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-current/40 underline-offset-2 hover:decoration-current"
                              >
                                {item.linear.identifier}
                              </a>
                              <span className="opacity-70">·</span>
                              <span>{linearAction}</span>
                            </span>
                            <span
                              title="Linear match confidence"
                              className="text-[11px] font-medium text-slate-500"
                            >
                              {confidence}%
                            </span>
                          </div>
                        )}
                        <p className="mt-3 text-sm leading-6 text-slate-400">
                          <span className="font-semibold text-slate-300">why:</span>{" "}
                          {item.reasoning}
                        </p>
                        <blockquote className="mt-3 border-l-2 border-slate-700 pl-3 text-sm italic leading-6 text-slate-500">
                          “{item.source_quote}”
                        </blockquote>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-600">
                    None identified
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {typeof result.enrichment_notes === "string" && result.enrichment_notes.trim() && (
        <p className="mt-4 text-sm leading-6 text-slate-500">{result.enrichment_notes.trim()}</p>
      )}

      <div className="mt-8 border-t border-slate-800 pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-100">Ready-to-send Slack recap</h3>
            <p className="mt-1 text-sm text-slate-400">
              Deterministically assembled from the classified items above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopy(draft)}
            className="inline-flex min-w-28 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-slate-600 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-950"
            aria-live="polite"
          >
            {copyStatus === "copied"
              ? "Copied!"
              : copyStatus === "error"
                ? "Copy failed"
                : "Copy draft"}
          </button>
        </div>

        <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950/90 p-5 font-mono text-sm leading-7 text-slate-300">
          {draft}
        </pre>
      </div>
    </section>
  );
}
