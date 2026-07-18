import React, { useEffect, useRef, useState } from "react";

export const RESULT_CATEGORIES = [
  {
    key: "decision",
    title: "Decisions",
    dotClass: "bg-black",
    countClass: "border-black bg-white text-black",
  },
  {
    key: "open_question",
    title: "Open Questions",
    dotClass: "bg-black",
    countClass: "border-black bg-white text-black",
  },
  {
    key: "action_item",
    title: "Action Items",
    dotClass: "bg-black",
    countClass: "border-black bg-white text-black",
  },
];

const LINEAR_ACTION_STYLES = {
  linked: "border-black bg-white text-black hover:bg-black hover:text-white",
  created: "border-black bg-white text-black hover:bg-black hover:text-white",
  updated: "border-black bg-white text-black hover:bg-black hover:text-white",
};

// TEMP(all-actions): revert for 3-column mode
const CATEGORY_FLAGS = {
  decision: "Decision",
  open_question: "Open question",
  action_item: "Action item",
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

  // TEMP(all-actions): revert for 3-column mode
  const bullets = safeItems
    .filter((item) => typeof item?.text === "string")
    .map((item) => {
      const text = item.text.trim();
      const categoryPrefix =
        item.category === "decision"
          ? "[Decision] "
          : item.category === "open_question"
            ? "[Open question] "
            : "";
      const linear = item.linear;
      const hasLinearLink =
        linear?.action &&
        typeof linear.identifier === "string" &&
        typeof linear.url === "string";
      const subIssue = linear?.sub_issue;
      const hasSubIssueLink =
        hasLinearLink &&
        typeof subIssue?.identifier === "string" &&
        typeof subIssue?.url === "string";
      const parentSuffix = hasLinearLink
        ? ` (${linear.identifier}: ${linear.url})`
        : "";
      const subIssueSuffix = hasSubIssueLink
        ? ` (sub: ${subIssue.identifier}: ${subIssue.url})`
        : "";

      return text ? `${categoryPrefix}${text}${parentSuffix}${subIssueSuffix}` : "";
    })
    .filter(Boolean)
    .map((text) => `- ${text}`);

  if (bullets.length > 0) {
    lines.push("", "*Action Items*", ...bullets);
  }

  return lines.join("\n");
}

function CreateLinearIssueButton({ item, itemIndex, onCreated, parentId }) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleCreate = async () => {
    if (isCreating) {
      return;
    }

    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/linear/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.text,
          description: `From Alfred recap — "${item.source_quote}"`,
          ...(parentId ? { parent_id: parentId } : {}),
        }),
      });
      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error || "Issue creation failed.");
      }

      if (
        typeof result?.id !== "string" ||
        typeof result?.identifier !== "string" ||
        typeof result?.title !== "string" ||
        typeof result?.url !== "string"
      ) {
        throw new Error("Issue creation returned an invalid response.");
      }

      if (isMountedRef.current) {
        onCreated(itemIndex, result, Boolean(parentId));
      }
    } catch (requestError) {
      if (isMountedRef.current) {
        setError(requestError instanceof Error ? requestError.message : "Issue creation failed.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsCreating(false);
      }
    }
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleCreate}
        disabled={isCreating}
        className="inline-flex min-h-11 items-center justify-center border border-black bg-white px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-black transition-colors duration-100 hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        {isCreating ? "CREATING…" : parentId ? "ADD SUB-ISSUE →" : "CREATE ISSUE →"}
      </button>
      {error && (
        <p
          role="alert"
          className="mt-2 font-mono text-[10px] font-medium uppercase leading-relaxed tracking-widest text-black group-hover:text-white"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function LinearIssueBadge({ linear, isSubIssue = false }) {
  const linearAction = isSubIssue ? "created" : linear.action;
  const linearStyle = LINEAR_ACTION_STYLES[linearAction];
  const confidence = Math.round(
    Math.max(0, Math.min(1, Number(linear.confidence) || 0)) * 100,
  );

  if (!linearStyle) {
    return null;
  }

  return (
    <div
      className={`group/linear mt-4 border px-3 py-2 transition-colors duration-100 ${linearStyle}`}
    >
      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[10px] font-semibold uppercase tracking-widest">
        {isSubIssue && (
          <>
            <span>Sub-issue</span>
            <span className="opacity-70">·</span>
          </>
        )}
        <a
          href={linear.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center underline decoration-current/40 underline-offset-2 hover:decoration-current"
        >
          {linear.identifier}
        </a>
        <span className="opacity-70">·</span>
        <span>{linearAction}</span>
        {!isSubIssue && (
          <>
            <span className="opacity-70">·</span>
            <span title="Linear match confidence">{confidence}%</span>
          </>
        )}
        {linear.state && (
          <>
            <span className="opacity-70">·</span>
            <span className="truncate">{linear.state}</span>
          </>
        )}
      </div>
      {linear.title && (
        <p className="mt-1 truncate font-body text-sm font-normal italic normal-case tracking-normal text-muted-foreground group-hover/linear:text-white">
          {linear.title}
        </p>
      )}
    </div>
  );
}

export default function Results({
  result,
  copyStatus,
  onCopy,
  isEnriching = false,
  enrichmentWarning = "",
  onDismissEnrichmentWarning,
  onLinearIssueCreated,
}) {
  const items = Array.isArray(result.items) ? result.items : [];
  const draft = assembleDraft(items, result.recap_line);
  // TEMP(all-actions): revert for 3-column mode
  const allActionItems = items;

  return (
    <section className="mt-20 border-t-4 border-black pb-20">
      <div className="inverted-lines flex flex-col gap-6 bg-black px-6 py-10 text-white sm:flex-row sm:items-end sm:justify-between sm:px-8 lg:px-12">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-widest">
            Analysis complete
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
            What came out of the session
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEnriching && (
            <span
              role="status"
              className="inline-flex min-h-11 items-center gap-2 border-2 border-white bg-black px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white"
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 animate-spin border-2 border-white border-t-black"
              />
              Linking issues…
            </span>
          )}
          <span className="inline-flex min-h-11 w-fit items-center border-2 border-white px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-white">
            {result.detected_language}
          </span>
        </div>
      </div>

      {enrichmentWarning && (
        <div
          role="alert"
          className="mt-8 flex flex-col gap-4 border-2 border-black bg-white px-5 py-4 text-base sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest">
              Issue linking warning
            </p>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              {enrichmentWarning}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismissEnrichmentWarning}
            className="inline-flex min-h-11 shrink-0 items-center justify-center border-2 border-black bg-white px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors duration-100 hover:bg-black hover:text-white"
            aria-label="Dismiss Linear linking warning"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-12">
        <section className="border-2 border-black bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-3 font-display text-2xl font-semibold leading-none">
              <span className="h-3 w-3 bg-black" />
              Action Items
            </h3>
            <span className="border border-black bg-white px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-black">
              {allActionItems.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {allActionItems.length > 0 ? (
              allActionItems.map((item, itemIndex) => {
                const linearAction = item.linear?.action;
                const categoryFlag = CATEGORY_FLAGS[item.category] ?? item.category;

                return (
                  <article
                    key={`${item.category}-${itemIndex}-${item.text}`}
                    className="group border border-black bg-white p-5 transition-colors duration-100 hover:bg-black hover:text-white"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="text-lg font-semibold leading-snug">
                        {item.text}
                      </h4>
                      <span className="shrink-0 border border-black bg-white px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-black">
                        {categoryFlag}
                      </span>
                    </div>
                    {linearAction && <LinearIssueBadge linear={item.linear} />}
                    {item.linear?.sub_issue && (
                      <LinearIssueBadge linear={item.linear.sub_issue} isSubIssue />
                    )}
                    {!linearAction && (
                      <CreateLinearIssueButton
                        item={item}
                        itemIndex={itemIndex}
                        onCreated={onLinearIssueCreated}
                      />
                    )}
                    {linearAction && !item.linear.sub_issue && (
                      <CreateLinearIssueButton
                        item={item}
                        itemIndex={itemIndex}
                        onCreated={onLinearIssueCreated}
                        parentId={item.linear.issue_id}
                      />
                    )}
                    <p className="mt-4 text-base leading-relaxed text-muted-foreground group-hover:text-white">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-black group-hover:text-white">
                        why:
                      </span>{" "}
                      {item.reasoning}
                    </p>
                    <blockquote className="mt-4 border-l-2 border-black pl-4 text-base italic leading-relaxed text-muted-foreground group-hover:border-white group-hover:text-white">
                      “{item.source_quote}”
                    </blockquote>
                  </article>
                );
              })
            ) : (
              <div className="border border-dashed border-black bg-muted px-4 py-10 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                None identified
              </div>
            )}
          </div>
        </section>
      </div>

      {typeof result.enrichment_notes === "string" && result.enrichment_notes.trim() && (
        <p className="mt-6 border-l-4 border-black bg-muted px-5 py-4 text-base leading-relaxed text-muted-foreground">
          {result.enrichment_notes.trim()}
        </p>
      )}

      <div className="mt-16 border-t-4 border-black pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest">Draft / 001</p>
            <h3 className="mt-3 font-display text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
              Ready-to-send Slack recap
            </h3>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              Deterministically assembled from the classified items above.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onCopy(draft)}
            className="inline-flex min-h-11 min-w-36 items-center justify-center border-2 border-black bg-white px-6 py-3 font-mono text-xs font-semibold uppercase tracking-widest text-black transition-colors duration-100 hover:bg-black hover:text-white"
            aria-live="polite"
          >
            {copyStatus === "copied"
              ? "Copied!"
              : copyStatus === "error"
                ? "Copy failed"
                : "Copy draft →"}
          </button>
        </div>

        <pre className="mt-6 overflow-x-auto whitespace-pre-wrap border-2 border-black bg-muted p-6 font-mono text-sm leading-7 text-black sm:p-8">
          {draft}
        </pre>
      </div>
    </section>
  );
}
