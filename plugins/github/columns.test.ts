import { describe, expect, it } from "vitest";
import {
  columnsForKind,
  DEFAULT_COLUMNS,
  formatColumnWidths,
  parseColumnWidths,
  moveColumn,
  parseColumns,
  repoLabels,
  toggleColumn,
} from "./columns.js";

describe("list columns setting", () => {
  it("keeps the configured order and drops duplicates", () => {
    expect(parseColumns(" Repo, title ,id, repo").columns).toEqual([
      "repo",
      "title",
      "id",
    ]);
  });

  it("always shows the title column", () => {
    expect(parseColumns("repo, status").columns).toEqual([
      "title",
      "repo",
      "status",
    ]);
  });

  it("falls back to the defaults when empty", () => {
    expect(parseColumns(" , ").columns).toEqual([...DEFAULT_COLUMNS]);
  });

  it("reports unknown entries", () => {
    expect(parseColumns("id, priority, title").ignored).toEqual(["priority"]);
  });
});

describe("toggling columns", () => {
  it("re-inserts a column at its default position", () => {
    expect(toggleColumn(["id", "title", "status"], "repo", true)).toEqual([
      "id",
      "repo",
      "title",
      "status",
    ]);
    expect(toggleColumn(["title", "id"], "updated", true)).toEqual([
      "title",
      "id",
      "updated",
    ]);
  });

  it("hides columns but never the title", () => {
    expect(toggleColumn(["id", "title"], "id", false)).toEqual(["title"]);
    expect(toggleColumn(["id", "title"], "title", false)).toEqual([
      "id",
      "title",
    ]);
  });
});

describe("repo labels", () => {
  it("uses the short name unless two repos share it", () => {
    const labels = repoLabels([
      "acme/widgets",
      "acme/api",
      "other/API",
      "git.corp.example.com/team/tool",
    ]);
    expect(labels.get("acme/widgets")).toBe("widgets");
    expect(labels.get("acme/api")).toBe("acme/api");
    expect(labels.get("other/API")).toBe("other/API");
    expect(labels.get("git.corp.example.com/team/tool")).toBe("tool");
  });
});

describe("moving columns", () => {
  it("drops a column before or after the target", () => {
    const columns = ["id", "repo", "title", "status"] as const;
    expect(moveColumn(columns, "status", "id", false)).toEqual([
      "status",
      "id",
      "repo",
      "title",
    ]);
    expect(moveColumn(columns, "id", "title", true)).toEqual([
      "repo",
      "title",
      "id",
      "status",
    ]);
    expect(moveColumn(columns, "id", "updated", true)).toEqual([...columns]);
  });
});

describe("columns per tab", () => {
  it("drops pull-request-only columns from the issues list", () => {
    const columns = ["id", "review", "title", "checks", "author"] as const;
    expect(columnsForKind(columns, "issue")).toEqual(["id", "title", "author"]);
    expect(columnsForKind(columns, "pr")).toEqual([...columns]);
  });
});

describe("column widths setting", () => {
  it("parses column=pixels pairs, clamps them, and rejects the title", () => {
    expect(parseColumnWidths("repo=160, Labels = 9999px, id=4").widths).toEqual(
      {
        repo: 160,
        labels: 640,
        id: 32,
      },
    );
    expect(parseColumnWidths("title=300, repo=wide, nope=10").ignored).toEqual([
      "title=300",
      "repo=wide",
      "nope=10",
    ]);
  });

  it("formats widths in canonical column order", () => {
    expect(formatColumnWidths({ updated: 80, repo: 150.6 })).toBe(
      "repo=151, updated=80",
    );
    expect(formatColumnWidths({})).toBe("");
  });
});
