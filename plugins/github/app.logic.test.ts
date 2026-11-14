import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  matchesQuery,
  nextSort,
  parseQuery,
  parseSubPath,
  routeToSubPath,
  sortItems,
  withSort,
  type Item,
  type Route,
} from "./app-logic.js";

const issue: Item = {
  repo: "acme/widgets",
  number: 7,
  kind: "issue",
  title: "Fix cache invalidation",
  state: "OPEN",
  author: "alice",
  labels: ["bug", "good first issue"],
  assignees: ["octocat"],
  url: "https://github.com/acme/widgets/issues/7",
  body: "",
  createdAt: "2026-08-18T12:00:00Z",
  updatedAt: "2026-08-19T12:00:00Z",
  comments: 0,
  milestone: null,
  pr: null,
};

describe("github panel routes", () => {
  it("round-trips list, create, issue, and pull routes", () => {
    const routes: Route[] = [
      { view: "issues" },
      { view: "pulls" },
      { view: "new" },
      { view: "issue", repo: "acme/widgets", number: 7 },
      { view: "pull", repo: "get-bb/bb", number: 42 },
    ];

    for (const route of routes) {
      expect(parseSubPath(routeToSubPath(route))).toEqual(route);
    }
  });

  it("falls back to the owning list for malformed detail paths", () => {
    expect(parseSubPath("pulls/acme/widgets/not-a-number")).toEqual({
      view: "pulls",
    });
    expect(parseSubPath("issues/acme/widgets/not-a-number")).toEqual({
      view: "issues",
    });
    expect(parseSubPath("issues/acme/widgets/7/extra")).toEqual({
      view: "issues",
    });
    expect(parseSubPath("")).toEqual({ view: "issues" });
  });
});

describe("github panel query engine", () => {
  it("parses quoted qualifiers and matches viewer-relative filters", () => {
    const parsed = parseQuery(
      'is:open assignee:@me author:alice label:"good first issue" repo:acme/widgets #7',
    );

    expect(parsed).toEqual({
      states: ["OPEN"],
      assignees: ["@me"],
      authors: ["alice"],
      labels: ["good first issue"],
      repos: ["acme/widgets"],
      noAssignee: false,
      noLabel: false,
      sort: null,
      text: ["#7"],
    });
    expect(matchesQuery(issue, parsed, "octocat")).toBe(true);
    expect(matchesQuery(issue, parsed, null)).toBe(false);
  });

  it("applies negative, state, and plain-text filters independently", () => {
    expect(matchesQuery(issue, parseQuery("is:closed"), "octocat")).toBe(false);
    expect(matchesQuery(issue, parseQuery("no:assignee"), "octocat")).toBe(
      false,
    );
    expect(matchesQuery(issue, parseQuery("no:label"), "octocat")).toBe(false);
    expect(
      matchesQuery(issue, parseQuery("cache acme/widgets"), "octocat"),
    ).toBe(true);
    expect(matchesQuery(issue, parseQuery("missing"), "octocat")).toBe(false);
    expect(matchesQuery(issue, parseQuery("state:"), "octocat")).toBe(true);
  });

  it("builds bounded qualifier values without losing labels containing spaces", () => {
    const vocab = {
      users: ["alice", "octocat"],
      labels: ["bug", "good first issue"],
      repos: ["acme/widgets"],
    };
    const compact = (token: string, kind: "issue" | "pr") =>
      buildSuggestions(token, vocab, kind, "octocat").map(
        ({ insert, label }) => ({ insert, label }),
      );

    expect(compact("is:", "pr")).toEqual([
      { insert: "is:open ", label: "open" },
      { insert: "is:closed ", label: "closed" },
      { insert: "is:merged ", label: "merged" },
    ]);
    expect(compact("label:good", "issue")).toEqual([
      {
        insert: 'label:"good first issue" ',
        label: "good first issue",
      },
    ]);
    expect(compact("assignee:@", "issue")).toEqual([
      { insert: "assignee:@me ", label: "@me (octocat)" },
    ]);
    expect(compact("no:l", "issue")).toEqual([
      { insert: "no:label ", label: "no:label" },
    ]);
    expect(compact("unknown:value", "issue")).toEqual([]);
    expect(buildSuggestions("is:o", vocab, "pr", "octocat")[0]?.icon).toEqual({
      kind: "state",
      itemKind: "pr",
      state: "OPEN",
    });
    expect(
      buildSuggestions("author:ali", vocab, "issue", "octocat")[0]?.icon,
    ).toEqual({ kind: "avatar", login: "alice" });
  });
});

describe("list sorting", () => {
  const make = (overrides: Partial<Item>): Item => ({ ...issue, ...overrides });
  const items = [
    make({ repo: "acme/widgets", number: 7, title: "beta", assignees: [] }),
    make({ repo: "acme/api", number: 12, title: "Alpha", assignees: ["zed"] }),
    make({ repo: "acme/api", number: 3, title: "gamma", assignees: ["amy"] }),
  ];
  const key = (list: Item[]) =>
    list.map((item) => `${item.repo}#${item.number}`);

  it("reads sort qualifiers without treating them as search text", () => {
    const parsed = parseQuery("is:open sort:repo-desc bug");
    expect(parsed.sort).toEqual({ column: "repo", direction: "desc" });
    expect(parsed.text).toEqual(["bug"]);
    expect(parseQuery("sort:title").sort).toEqual({
      column: "title",
      direction: "asc",
    });
    expect(parseQuery("sort:priority").sort).toBeNull();
  });

  it("sorts by repo then number, and by number across repos", () => {
    expect(key(sortItems(items, { column: "repo", direction: "asc" }))).toEqual(
      ["acme/api#3", "acme/api#12", "acme/widgets#7"],
    );
    expect(key(sortItems(items, { column: "id", direction: "desc" }))).toEqual([
      "acme/api#12",
      "acme/widgets#7",
      "acme/api#3",
    ]);
  });

  it("sorts titles case-insensitively and keeps unassigned items last", () => {
    expect(
      sortItems(items, { column: "title", direction: "asc" }).map(
        (item) => item.title,
      ),
    ).toEqual(["Alpha", "beta", "gamma"]);
    for (const direction of ["asc", "desc"] as const) {
      expect(
        key(sortItems(items, { column: "assignee", direction })).at(-1),
      ).toBe("acme/widgets#7");
    }
  });

  it("sorts by first label with unlabeled items last", () => {
    const labeled = [
      make({ number: 1, labels: [] }),
      make({ number: 2, labels: ["triage"] }),
      make({ number: 3, labels: ["Bug", "zz"] }),
    ];
    for (const direction of ["asc", "desc"] as const) {
      expect(
        sortItems(labeled, { column: "labels", direction }).map(
          (item) => item.number,
        ),
      ).toEqual(direction === "asc" ? [3, 2, 1] : [2, 3, 1]);
    }
  });

  it("orders reviews by urgency and keeps PRs without a decision last", () => {
    const pr = (
      number: number,
      review: "APPROVED" | "CHANGES_REQUESTED" | null,
    ) =>
      make({
        number,
        kind: "pr",
        pr: { draft: false, review, checks: null, additions: 0, deletions: 0 },
      });
    const pulls = [pr(1, null), pr(2, "APPROVED"), pr(3, "CHANGES_REQUESTED")];
    expect(
      sortItems(pulls, { column: "review", direction: "asc" }).map(
        (item) => item.number,
      ),
    ).toEqual([3, 2, 1]);
  });

  it("sorts by agent thread count using the supplied counter", () => {
    const counts: Record<number, number> = { 1: 0, 2: 2, 3: 1 };
    const listed = [
      make({ number: 1 }),
      make({ number: 2 }),
      make({ number: 3 }),
    ];
    expect(
      sortItems(
        listed,
        { column: "agent", direction: "desc" },
        (item) => counts[item.number] ?? 0,
      ).map((item) => item.number),
    ).toEqual([2, 3, 1]);
  });

  it("rewrites the sort qualifier and toggles direction on repeat clicks", () => {
    expect(
      withSort("is:open sort:id-asc bug ", {
        column: "repo",
        direction: "asc",
      }),
    ).toBe("is:open bug sort:repo-asc ");
    expect(withSort("sort:repo-asc ", null)).toBe("");
    expect(nextSort({ column: "repo", direction: "asc" }, "repo")).toEqual({
      column: "repo",
      direction: "desc",
    });
    expect(nextSort({ column: "repo", direction: "asc" }, "updated")).toEqual({
      column: "updated",
      direction: "desc",
    });
  });
});
