const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

const ISSUE_FIELDS = `
  id
  identifier
  title
  url
  state {
    name
  }
`;

function getToken(token) {
  const resolvedToken = token?.trim() || process.env.LINEAR_API_KEY?.trim();

  if (!resolvedToken) {
    throw new Error("Linear API key is not configured.");
  }

  return resolvedToken;
}

function getGraphqlErrorMessage(errors) {
  if (!Array.isArray(errors)) {
    return "";
  }

  return errors
    .map((error) => error?.message)
    .filter(Boolean)
    .join("; ");
}

async function linearRequest(query, variables, token) {
  let response;

  try {
    response = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: getToken(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    throw new Error(
      `Linear API request failed: ${error instanceof Error ? error.message : "Network error."}`,
      { cause: error },
    );
  }

  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(
      `Linear API request failed (${response.status} ${response.statusText}): invalid JSON response.`,
    );
  }

  const graphqlErrorMessage = getGraphqlErrorMessage(payload.errors);

  if (!response.ok) {
    const detail = graphqlErrorMessage || responseText || "Request rejected.";
    throw new Error(
      `Linear API request failed (${response.status} ${response.statusText}): ${detail}`,
    );
  }

  if (graphqlErrorMessage) {
    throw new Error(`Linear GraphQL error: ${graphqlErrorMessage}`);
  }

  if (!payload.data) {
    throw new Error("Linear API response did not include data.");
  }

  return payload.data;
}

function toIssue(issue) {
  if (!issue) {
    return null;
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    state: issue.state?.name ?? null,
  };
}

export async function searchIssues(query, token) {
  const data = await linearRequest(
    `
      query SearchIssues($query: String!) {
        issueSearch(query: $query, first: 10) {
          nodes {
            ${ISSUE_FIELDS}
          }
        }
      }
    `,
    { query },
    token,
  );

  return data.issueSearch.nodes.map(toIssue);
}

export async function getIssue(id, token) {
  const data = await linearRequest(
    `
      query GetIssue($id: String!) {
        issue(id: $id) {
          ${ISSUE_FIELDS}
        }
      }
    `,
    { id },
    token,
  );

  return toIssue(data.issue);
}

export async function createIssue({ title, description, teamId }, token) {
  const data = await linearRequest(
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            ${ISSUE_FIELDS}
          }
        }
      }
    `,
    { input: { title, description, teamId } },
    token,
  );

  if (!data.issueCreate?.success || !data.issueCreate.issue) {
    throw new Error("Linear issue creation failed.");
  }

  return toIssue(data.issueCreate.issue);
}

export async function updateIssue(id, patch, token) {
  const data = await linearRequest(
    `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            ${ISSUE_FIELDS}
          }
        }
      }
    `,
    { id, input: patch },
    token,
  );

  if (!data.issueUpdate?.success || !data.issueUpdate.issue) {
    throw new Error("Linear issue update failed.");
  }

  return toIssue(data.issueUpdate.issue);
}
