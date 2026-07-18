// Action items in a POST /api/enrich response carry `linear: { issue_id, identifier, url, action: "linked" | "created" | "updated" | null, confidence }`.

import { Router } from "express";
import OpenAI from "openai";
import {
  createIssue,
  getDefaultTeamId,
  getIssue,
  searchIssues,
  updateIssue,
} from "../linear.js";
import {
  ENRICH_RESPONSE_SCHEMA,
  ENRICH_SYSTEM_PROMPT,
  ENRICH_TOOLS,
} from "../enrichPrompt.js";

const router = Router();
const MAX_TOOL_ROUNDS = 12;

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "Enrichment failed.";
}

function getLinearToken(req) {
  return req.get("X-Linear-Api-Key")?.trim() || process.env.LINEAR_API_KEY?.trim();
}

function buildUpdatePatch(patch) {
  const updatePatch = {};

  if (patch.title !== null) {
    updatePatch.title = patch.title;
  }

  if (patch.description !== null) {
    updatePatch.description = patch.description;
  }

  if (patch.state_id !== null) {
    updatePatch.stateId = patch.state_id;
  }

  if (Object.keys(updatePatch).length === 0) {
    throw new Error("update_issue requires at least one non-null patch field.");
  }

  return updatePatch;
}

function rememberIssue(observedIssues, itemIndex, issue, action) {
  if (!issue?.id) {
    return;
  }

  let issuesForItem = observedIssues.get(itemIndex);

  if (!issuesForItem) {
    issuesForItem = new Map();
    observedIssues.set(itemIndex, issuesForItem);
  }

  const existing = issuesForItem.get(issue.id);
  const actionPriority = { linked: 1, updated: 2, created: 3 };
  const resolvedAction =
    existing && actionPriority[existing.action] > actionPriority[action] ? existing.action : action;

  issuesForItem.set(issue.id, { issue, action: resolvedAction });
}

function buildEnrichedResult(items, modelResult, observedIssues) {
  if (!Array.isArray(modelResult.items) || modelResult.items.length !== items.length) {
    throw new Error("The enrichment service returned an invalid items array.");
  }

  const enrichedItems = items.map((item, itemIndex) => {
    const modelItem = modelResult.items[itemIndex];

    if (modelItem?.category !== item?.category || modelItem?.text !== item?.text) {
      throw new Error("The enrichment service changed or reordered the debrief items.");
    }

    if (item?.category !== "action_item") {
      return item;
    }

    const candidate = modelItem.linear;
    const confidence = Math.max(0, Math.min(1, Number(candidate?.confidence) || 0));

    if (!candidate || candidate.action === null) {
      return {
        ...item,
        linear: {
          issue_id: null,
          identifier: null,
          url: null,
          action: null,
          confidence,
        },
      };
    }

    const observed = observedIssues.get(itemIndex)?.get(candidate.issue_id);

    if (!observed) {
      throw new Error("The enrichment service returned an issue that was not provided by Linear.");
    }

    return {
      ...item,
      linear: {
        issue_id: observed.issue.id,
        identifier: observed.issue.identifier,
        url: observed.issue.url,
        action: observed.action,
        confidence,
      },
    };
  });
  const result = { items: enrichedItems };
  const enrichmentNotes =
    typeof modelResult.enrichment_notes === "string" ? modelResult.enrichment_notes.trim() : "";

  if (enrichmentNotes) {
    result.enrichment_notes = enrichmentNotes;
  }

  return result;
}

async function runEnrichment({ items, recapLine, detectedLanguage, linearToken }) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const actionItemIndexes = new Set(
    items.flatMap((item, index) => (item?.category === "action_item" ? [index] : [])),
  );
  const observedIssues = new Map();
  const searchedItemIndexes = new Set();
  let defaultTeamIdPromise;

  const getRequestDefaultTeamId = () => {
    defaultTeamIdPromise ??= getDefaultTeamId(linearToken);
    return defaultTeamIdPromise;
  };

  const assertActionItem = (itemIndex) => {
    if (!Number.isInteger(itemIndex) || !actionItemIndexes.has(itemIndex)) {
      throw new Error("Linear tools may only be used for action_item entries.");
    }
  };

  const executeToolCall = async (toolCall) => {
    const args = JSON.parse(toolCall.arguments);
    assertActionItem(args.item_index);

    switch (toolCall.name) {
      case "search_issues": {
        const issues = await searchIssues(args.query, linearToken);
        searchedItemIndexes.add(args.item_index);
        issues.forEach((issue) => rememberIssue(observedIssues, args.item_index, issue, "linked"));
        return issues;
      }
      case "get_issue": {
        const issue = await getIssue(args.id, linearToken);
        rememberIssue(observedIssues, args.item_index, issue, "linked");
        return issue;
      }
      case "create_issue": {
        if (!searchedItemIndexes.has(args.item_index)) {
          throw new Error("create_issue requires search_issues for the action item first.");
        }

        const teamId = await getRequestDefaultTeamId();
        const issue = await createIssue(
          {
            title: args.title,
            description: args.description ?? undefined,
            teamId,
          },
          linearToken,
        );
        rememberIssue(observedIssues, args.item_index, issue, "created");
        return issue;
      }
      case "update_issue": {
        const observedIssue = [...(observedIssues.get(args.item_index)?.values() ?? [])].find(
          ({ issue }) => issue.id === args.id || issue.identifier === args.id,
        )?.issue;

        if (!observedIssue) {
          throw new Error("update_issue requires an issue returned by Linear first.");
        }

        const issue = await updateIssue(
          observedIssue.id,
          buildUpdatePatch(args.patch),
          linearToken,
        );
        rememberIssue(observedIssues, args.item_index, issue, "updated");
        return issue;
      }
      default:
        throw new Error(`Unknown enrichment tool: ${toolCall.name}`);
    }
  };

  const input = [
    {
      role: "user",
      content: JSON.stringify(
        {
          items,
          recap_line: recapLine,
          detected_language: detectedLanguage,
        },
        null,
        2,
      ),
    },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await openai.responses.create(
      {
        model: "gpt-5.6",
        instructions: ENRICH_SYSTEM_PROMPT,
        input,
        include: ["reasoning.encrypted_content"],
        parallel_tool_calls: false,
        reasoning: { effort: "low" },
        store: false,
        tools: ENRICH_TOOLS,
        text: {
          format: {
            type: "json_schema",
            name: "enrich_response",
            description: "The unchanged debrief items with grounded Linear attachments.",
            strict: true,
            schema: ENRICH_RESPONSE_SCHEMA,
          },
        },
      },
      {
        timeout: 120_000,
        maxRetries: 0,
      },
    );
    const toolCalls = response.output.filter((item) => item.type === "function_call");

    if (toolCalls.length === 0) {
      if (!response.output_text) {
        throw new Error("The enrichment service returned no output.");
      }

      return buildEnrichedResult(items, JSON.parse(response.output_text), observedIssues);
    }

    const toolOutputs = [];

    for (const toolCall of toolCalls) {
      let output;

      try {
        output = await executeToolCall(toolCall);
      } catch (error) {
        output = { error: getErrorMessage(error) };
      }

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(output),
      });
    }

    input.push(...response.output, ...toolOutputs);
  }

  throw new Error("The enrichment service exceeded the tool-call limit.");
}

router.post("/enrich", async (req, res) => {
  const items = req.body?.items;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "An items array is required." });
  }

  const linearToken = getLinearToken(req);

  if (!linearToken) {
    return res.status(400).json({
      error: "A Linear API key is required in X-Linear-Api-Key or LINEAR_API_KEY.",
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured." });
  }

  if (!items.some((item) => item?.category === "action_item")) {
    return res.json({ items });
  }

  try {
    const result = await runEnrichment({
      items,
      recapLine: req.body?.recap_line,
      detectedLanguage: req.body?.detected_language,
      linearToken,
    });

    return res.json(result);
  } catch (error) {
    return res.status(502).json({ error: getErrorMessage(error) });
  }
});

export default router;
