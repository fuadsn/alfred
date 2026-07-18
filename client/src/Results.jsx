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
      .map((item) => item.text.trim())
      .filter(Boolean)
      .map((text) => `- ${text}`);

    if (bullets.length > 0) {
      lines.push("", `*${title}*`, ...bullets);
    }
  }

  return lines.join("\n");
}

export default function Results({ result, copyStatus, onCopy }) {
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
        <span className="w-fit rounded-full bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-slate-700">
          {result.detected_language}
        </span>
      </div>

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
                  categoryItems.map((item, index) => (
                    <article
                      key={`${category.key}-${index}-${item.text}`}
                      className="rounded-xl border border-slate-800 bg-slate-900/80 p-4"
                    >
                      <h4 className="text-base font-semibold leading-6 text-slate-100">
                        {item.text}
                      </h4>
                      <p className="mt-3 text-sm leading-6 text-slate-400">
                        <span className="font-semibold text-slate-300">why:</span> {item.reasoning}
                      </p>
                      <blockquote className="mt-3 border-l-2 border-slate-700 pl-3 text-sm italic leading-6 text-slate-500">
                        “{item.source_quote}”
                      </blockquote>
                    </article>
                  ))
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
