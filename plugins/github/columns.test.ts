import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMNS,
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
    expect(parseColumns("id, labels, title").ignored).toEqual(["labels"]);
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
  it("uses the short name unless two owners share it", () => {
    const labels = repoLabels(["acme/widgets", "acme/api", "other/API"]);
    expect(labels.get("acme/widgets")).toBe("widgets");
    expect(labels.get("acme/api")).toBe("acme/api");
    expect(labels.get("other/API")).toBe("other/API");
  });
});
