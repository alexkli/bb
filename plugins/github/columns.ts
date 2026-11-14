import { parseRepoRef } from "./repo-ref.js";

export const COLUMN_IDS = [
  "id",
  "repo",
  "title",
  "labels",
  "author",
  "assignee",
  "status",
  "review",
  "checks",
  "draft",
  "size",
  "agent",
  "comments",
  "milestone",
  "created",
  "updated",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  id: "ID",
  repo: "Repo",
  title: "Title",
  labels: "Labels",
  author: "Author",
  assignee: "Assignee",
  status: "Status",
  review: "Review",
  checks: "Checks",
  draft: "Draft",
  size: "Size",
  agent: "Agent",
  comments: "Comments",
  milestone: "Milestone",
  created: "Created",
  updated: "Updated",
};

export const PR_ONLY_COLUMNS: ReadonlySet<ColumnId> = new Set([
  "review",
  "checks",
  "draft",
  "size",
]);

export const DEFAULT_COLUMNS: readonly ColumnId[] = [
  "id",
  "repo",
  "title",
  "assignee",
  "status",
  "updated",
];

export const DEFAULT_COLUMNS_SETTING = DEFAULT_COLUMNS.join(", ");

export function columnsForKind(
  columns: readonly ColumnId[],
  kind: "issue" | "pr",
): ColumnId[] {
  return kind === "pr"
    ? [...columns]
    : columns.filter((column) => !PR_ONLY_COLUMNS.has(column));
}

function isColumnId(value: string): value is ColumnId {
  return (COLUMN_IDS as readonly string[]).includes(value);
}

export function parseColumns(value: string): {
  columns: ColumnId[];
  ignored: string[];
} {
  const columns: ColumnId[] = [];
  const ignored: string[] = [];
  for (const raw of value.split(",")) {
    const entry = raw.trim().toLowerCase();
    if (entry.length === 0) continue;
    if (!isColumnId(entry)) {
      ignored.push(raw.trim());
      continue;
    }
    if (!columns.includes(entry)) columns.push(entry);
  }
  if (columns.length === 0 && ignored.length === 0) {
    return { columns: [...DEFAULT_COLUMNS], ignored };
  }
  if (!columns.includes("title")) columns.unshift("title");
  return { columns, ignored };
}

export function toggleColumn(
  columns: readonly ColumnId[],
  column: ColumnId,
  visible: boolean,
): ColumnId[] {
  if (column === "title") return [...columns];
  if (!visible) return columns.filter((entry) => entry !== column);
  if (columns.includes(column)) return [...columns];
  const rank = COLUMN_IDS.indexOf(column);
  const insertAt = columns.findIndex(
    (entry) => COLUMN_IDS.indexOf(entry) > rank,
  );
  const next = [...columns];
  next.splice(insertAt === -1 ? next.length : insertAt, 0, column);
  return next;
}

export function moveColumn(
  columns: readonly ColumnId[],
  column: ColumnId,
  target: ColumnId,
  placeAfter: boolean,
): ColumnId[] {
  if (column === target || !columns.includes(target)) return [...columns];
  const next = columns.filter((entry) => entry !== column);
  const targetIndex = next.indexOf(target);
  next.splice(placeAfter ? targetIndex + 1 : targetIndex, 0, column);
  return next;
}

export function repoLabels(repos: readonly string[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const repo of repos) {
    const name = parseRepoRef(repo).name.toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const repo of repos) {
    const { name, path } = parseRepoRef(repo);
    labels.set(
      repo,
      (nameCounts.get(name.toLowerCase()) ?? 0) > 1 ? path : name,
    );
  }
  return labels;
}

export type ColumnWidths = Partial<Record<ColumnId, number>>;

export const MIN_COLUMN_WIDTH = 32;
export const MAX_COLUMN_WIDTH = 640;

export function clampColumnWidth(width: number): number {
  return Math.round(
    Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
  );
}

export function parseColumnWidths(value: string): {
  widths: ColumnWidths;
  ignored: string[];
} {
  const widths: ColumnWidths = {};
  const ignored: string[] = [];
  for (const raw of value.split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) continue;
    const match = /^([a-z]+)\s*=\s*(\d+)(?:px)?$/i.exec(entry);
    const column = match?.[1]?.toLowerCase();
    if (
      match === null ||
      column === undefined ||
      !isColumnId(column) ||
      column === "title"
    ) {
      ignored.push(entry);
      continue;
    }
    widths[column] = clampColumnWidth(Number(match[2]));
  }
  return { widths, ignored };
}

export function formatColumnWidths(widths: ColumnWidths): string {
  return COLUMN_IDS.flatMap((column) => {
    const width = widths[column];
    return width === undefined || column === "title"
      ? []
      : [`${column}=${clampColumnWidth(width)}`];
  }).join(", ");
}
