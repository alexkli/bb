import type { PluginRpcResult } from "@get-bb/plugin-sdk/app";
import type { githubRpcContract } from "./server.js";
import { COLUMN_IDS, type ColumnId } from "./columns.js";

export type Item = PluginRpcResult<
  (typeof githubRpcContract)["listItems"]
>["items"][number];

export type Route =
  | { view: "issues" }
  | { view: "pulls" }
  | { view: "new" }
  | { view: "issue"; repo: string; number: number }
  | { view: "pull"; repo: string; number: number };

export function parseSubPath(subPath: string): Route {
  const parts = subPath.split("/").filter((part) => part.length > 0);
  if (parts[0] === "pulls" && parts.length === 4) {
    const number = Number(parts[3]);
    if (Number.isFinite(number)) {
      return { view: "pull", repo: `${parts[1]}/${parts[2]}`, number };
    }
  }
  if (parts[0] === "pulls") return { view: "pulls" };
  if (parts[0] === "new") return { view: "new" };
  if (parts[0] === "issues" && parts.length === 4) {
    const number = Number(parts[3]);
    if (Number.isFinite(number)) {
      return { view: "issue", repo: `${parts[1]}/${parts[2]}`, number };
    }
  }
  return { view: "issues" };
}

export function routeToSubPath(route: Route): string {
  switch (route.view) {
    case "issues":
      return "issues";
    case "pulls":
      return "pulls";
    case "new":
      return "new";
    case "issue":
      return `issues/${route.repo}/${route.number}`;
    case "pull":
      return `pulls/${route.repo}/${route.number}`;
  }
}

export type SortDirection = "asc" | "desc";

export interface ListSort {
  column: ColumnId;
  direction: SortDirection;
}

export const DEFAULT_SORT: ListSort = { column: "updated", direction: "desc" };

const DESCENDING_FIRST: ReadonlySet<ColumnId> = new Set([
  "id",
  "updated",
  "created",
  "comments",
  "size",
  "agent",
  "draft",
]);

export function defaultSortDirection(column: ColumnId): SortDirection {
  return DESCENDING_FIRST.has(column) ? "desc" : "asc";
}

function parseSort(value: string): ListSort | null {
  const match = /^([a-z]+)(?:-(asc|desc))?$/.exec(value.toLowerCase());
  if (match === null) return null;
  const column = (COLUMN_IDS as readonly string[]).find(
    (id) => id === match[1],
  ) as ColumnId | undefined;
  if (column === undefined) return null;
  const direction =
    match[2] === "asc" || match[2] === "desc"
      ? match[2]
      : defaultSortDirection(column);
  return { column, direction };
}

interface ParsedQuery {
  states: string[];
  assignees: string[];
  authors: string[];
  labels: string[];
  repos: string[];
  noAssignee: boolean;
  noLabel: boolean;
  sort: ListSort | null;
  text: string[];
}

function tokenizeQuery(query: string): string[] {
  return query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
}

function unquote(value: string): string {
  return value.replace(/"/g, "");
}

const STATE_VALUES: Record<string, string> = {
  open: "OPEN",
  closed: "CLOSED",
  merged: "MERGED",
};

export function parseQuery(query: string): ParsedQuery {
  const parsed: ParsedQuery = {
    states: [],
    assignees: [],
    authors: [],
    labels: [],
    repos: [],
    noAssignee: false,
    noLabel: false,
    sort: null,
    text: [],
  };
  for (const token of tokenizeQuery(query)) {
    const idx = token.indexOf(":");
    const key = idx > 0 ? token.slice(0, idx).toLowerCase() : "";
    const value = idx > 0 ? unquote(token.slice(idx + 1)) : "";
    if (idx > 0 && value.length === 0) continue;
    if (key === "is" || key === "state") {
      parsed.states.push(
        STATE_VALUES[value.toLowerCase()] ?? value.toUpperCase(),
      );
    } else if (key === "assignee") {
      parsed.assignees.push(value.toLowerCase());
    } else if (key === "author") {
      parsed.authors.push(value.toLowerCase());
    } else if (key === "label") {
      parsed.labels.push(value.toLowerCase());
    } else if (key === "repo") {
      parsed.repos.push(value.toLowerCase());
    } else if (key === "sort") {
      parsed.sort = parseSort(value) ?? parsed.sort;
    } else if (key === "no") {
      if (value.toLowerCase() === "assignee") parsed.noAssignee = true;
      if (value.toLowerCase() === "label") parsed.noLabel = true;
    } else {
      parsed.text.push(unquote(token).toLowerCase());
    }
  }
  return parsed;
}

export function matchesQuery(
  item: Item,
  query: ParsedQuery,
  viewer: string | null,
): boolean {
  if (query.states.length > 0 && !query.states.includes(item.state)) {
    return false;
  }
  if (query.assignees.length > 0) {
    const wanted = query.assignees.map((login) =>
      login === "@me" ? (viewer?.toLowerCase() ?? "\u0000") : login,
    );
    if (!item.assignees.some((login) => wanted.includes(login.toLowerCase()))) {
      return false;
    }
  }
  if (query.authors.length > 0) {
    const author = item.author.toLowerCase();
    const wanted = query.authors.map((login) =>
      login === "@me" ? (viewer?.toLowerCase() ?? "\u0000") : login,
    );
    if (!wanted.includes(author)) return false;
  }
  if (query.labels.length > 0) {
    const labels = item.labels.map((label) => label.toLowerCase());
    if (!query.labels.some((label) => labels.includes(label))) return false;
  }
  if (
    query.repos.length > 0 &&
    !query.repos.includes(item.repo.toLowerCase())
  ) {
    return false;
  }
  if (query.noAssignee && item.assignees.length > 0) return false;
  if (query.noLabel && item.labels.length > 0) return false;
  if (query.text.length > 0) {
    const haystack = `${item.title} #${item.number} ${item.repo}`.toLowerCase();
    if (!query.text.every((term) => haystack.includes(term))) return false;
  }
  return true;
}

const REVIEW_RANK: Record<string, number> = {
  CHANGES_REQUESTED: 0,
  REVIEW_REQUIRED: 1,
  APPROVED: 2,
};

const CHECKS_RANK: Record<string, number> = {
  failure: 0,
  pending: 1,
  success: 2,
};

export function sortItems(
  items: readonly Item[],
  sort: ListSort,
  agentCount: (item: Item) => number = () => 0,
): Item[] {
  const text = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  const compare = (a: Item, b: Item): number => {
    switch (sort.column) {
      case "id":
        return a.number - b.number || text(a.repo, b.repo);
      case "repo":
        return text(a.repo, b.repo) || a.number - b.number;
      case "title":
        return text(a.title, b.title);
      case "labels":
        return text(a.labels[0] ?? "", b.labels[0] ?? "");
      case "author":
        return text(a.author, b.author);
      case "assignee":
        return text(a.assignees[0] ?? "", b.assignees[0] ?? "");
      case "status":
        return text(a.state, b.state);
      case "review":
        return (
          (REVIEW_RANK[a.pr?.review ?? ""] ?? 0) -
          (REVIEW_RANK[b.pr?.review ?? ""] ?? 0)
        );
      case "checks":
        return (
          (CHECKS_RANK[a.pr?.checks ?? ""] ?? 0) -
          (CHECKS_RANK[b.pr?.checks ?? ""] ?? 0)
        );
      case "draft":
        return Number(a.pr?.draft ?? false) - Number(b.pr?.draft ?? false);
      case "size":
        return itemSize(a) - itemSize(b);
      case "agent":
        return agentCount(a) - agentCount(b);
      case "comments":
        return a.comments - b.comments;
      case "milestone":
        return text(a.milestone ?? "", b.milestone ?? "");
      case "created":
        return a.createdAt.localeCompare(b.createdAt);
      case "updated":
        return a.updatedAt.localeCompare(b.updatedAt);
    }
  };
  const isEmpty = emptyCheck(sort.column, agentCount);
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (isEmpty !== null) {
      const aEmpty = isEmpty(a);
      const bEmpty = isEmpty(b);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    }
    return sign * compare(a, b);
  });
}

function itemSize(item: Item): number {
  return item.pr === null ? 0 : item.pr.additions + item.pr.deletions;
}

function emptyCheck(
  column: ColumnId,
  agentCount: (item: Item) => number,
): ((item: Item) => boolean) | null {
  switch (column) {
    case "labels":
      return (item) => item.labels.length === 0;
    case "assignee":
      return (item) => item.assignees.length === 0;
    case "milestone":
      return (item) => item.milestone === null;
    case "review":
      return (item) => item.pr?.review == null;
    case "checks":
      return (item) => item.pr?.checks == null;
    case "agent":
      return (item) => agentCount(item) === 0;
    default:
      return null;
  }
}

export function withSort(query: string, sort: ListSort | null): string {
  const kept = tokenizeQuery(query).filter(
    (token) => !token.toLowerCase().startsWith("sort:"),
  );
  if (sort !== null) kept.push(`sort:${sort.column}-${sort.direction}`);
  return kept.length === 0 ? "" : `${kept.join(" ")} `;
}

export function nextSort(current: ListSort, column: ColumnId): ListSort {
  if (current.column !== column) {
    return { column, direction: defaultSortDirection(column) };
  }
  return {
    column,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export type SuggestionIcon =
  | { kind: "state"; itemKind: "issue" | "pr"; state: string }
  | { kind: "avatar"; login: string };

export interface Suggestion {
  insert: string;
  label: string;
  hint?: string;
  icon?: SuggestionIcon;
}

const QUALIFIER_KEYS: Array<{ key: string; hint: string }> = [
  { key: "is:", hint: "state — open, closed, merged" },
  { key: "assignee:", hint: "assigned user, or @me" },
  { key: "author:", hint: "opened by" },
  { key: "label:", hint: "has label" },
  { key: "repo:", hint: "in repository" },
  { key: "no:", hint: "missing — assignee, label" },
  { key: "sort:", hint: "order by column — e.g. sort:repo-asc" },
];

function quoteValue(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value;
}

export function buildSuggestions(
  token: string,
  vocab: { users: string[]; labels: string[]; repos: string[] },
  kind: "issue" | "pr",
  viewer: string | null,
): Suggestion[] {
  const idx = token.indexOf(":");
  if (idx <= 0) {
    const prefix = token.toLowerCase();
    return QUALIFIER_KEYS.filter((entry) => entry.key.startsWith(prefix)).map(
      (entry) => ({
        insert: entry.key,
        label: entry.key,
        hint: entry.hint,
      }),
    );
  }
  const key = token.slice(0, idx).toLowerCase();
  const partial = unquote(token.slice(idx + 1)).toLowerCase();
  const matches = (value: string) => value.toLowerCase().includes(partial);
  if (key === "is" || key === "state") {
    const states =
      kind === "pr" ? ["open", "closed", "merged"] : ["open", "closed"];
    return states.filter(matches).map((state) => ({
      insert: `${key}:${state} `,
      label: state,
      icon: {
        kind: "state",
        itemKind: kind,
        state: STATE_VALUES[state] ?? "OPEN",
      },
    }));
  }
  if (key === "assignee" || key === "author") {
    const users = ["@me", ...vocab.users];
    return users.filter(matches).map((login) => {
      const avatarLogin = login === "@me" ? viewer : login;
      const icon: SuggestionIcon | undefined =
        avatarLogin === null
          ? undefined
          : { kind: "avatar", login: avatarLogin };
      return {
        insert: `${key}:${login} `,
        label: login === "@me" && viewer !== null ? `@me (${viewer})` : login,
        ...(icon === undefined ? {} : { icon }),
      };
    });
  }
  if (key === "label") {
    return vocab.labels.filter(matches).map((label) => ({
      insert: `${key}:${quoteValue(label)} `,
      label,
    }));
  }
  if (key === "repo") {
    return vocab.repos.filter(matches).map((repo) => ({
      insert: `${key}:${repo} `,
      label: repo,
    }));
  }
  if (key === "sort") {
    return COLUMN_IDS.flatMap((column) =>
      (["asc", "desc"] as const).map((direction) => `${column}-${direction}`),
    )
      .filter(matches)
      .map((value) => ({ insert: `${key}:${value} `, label: value }));
  }
  if (key === "no") {
    return ["assignee", "label"].filter(matches).map((field) => ({
      insert: `${key}:${field} `,
      label: `no:${field}`,
    }));
  }
  return [];
}
