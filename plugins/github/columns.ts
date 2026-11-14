export const COLUMN_IDS = [
  "id",
  "repo",
  "title",
  "assignee",
  "status",
  "updated",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export const COLUMN_LABELS: Record<ColumnId, string> = {
  id: "ID",
  repo: "Repo",
  title: "Title",
  assignee: "Assignee",
  status: "Status",
  updated: "Updated",
};

export const DEFAULT_COLUMNS: readonly ColumnId[] = COLUMN_IDS;

export const DEFAULT_COLUMNS_SETTING = DEFAULT_COLUMNS.join(", ");

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
  const rank = DEFAULT_COLUMNS.indexOf(column);
  const insertAt = columns.findIndex(
    (entry) => DEFAULT_COLUMNS.indexOf(entry) > rank,
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
    const name = repo.slice(repo.indexOf("/") + 1).toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const repo of repos) {
    const name = repo.slice(repo.indexOf("/") + 1);
    labels.set(
      repo,
      (nameCounts.get(name.toLowerCase()) ?? 0) > 1 ? repo : name,
    );
  }
  return labels;
}
