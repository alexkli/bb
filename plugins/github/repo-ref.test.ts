import { describe, expect, it } from "vitest";
import {
  isRepoRef,
  parseAuthStatus,
  parseRepoRef,
  repoFromRemote,
} from "./repo-ref.js";
import { parseSubPath, routeToSubPath } from "./app-logic.js";

describe("repo references", () => {
  it("keeps github.com repos short and prefixes other hosts", () => {
    expect(parseRepoRef("acme/widgets")).toEqual({
      host: "github.com",
      owner: "acme",
      name: "widgets",
      path: "acme/widgets",
    });
    expect(parseRepoRef("git.corp.example.com/team/tool").host).toBe(
      "git.corp.example.com",
    );
    expect(isRepoRef("git.corp.example.com/team/tool")).toBe(true);
    expect(isRepoRef("team/tool/extra")).toBe(false);
    expect(isRepoRef("owner/*")).toBe(false);
  });

  it("maps remotes on known hosts, including ssh host aliases", () => {
    const hosts = ["github.com", "git.corp.example.com"];
    expect(repoFromRemote("https://github.com/acme/widgets.git", hosts)).toBe(
      "acme/widgets",
    );
    expect(
      repoFromRemote("git@github.com-client:acme/widgets.git", hosts),
    ).toBe("acme/widgets");
    expect(
      repoFromRemote("git@git.corp.example.com:team/tool.git", hosts),
    ).toBe("git.corp.example.com/team/tool");
    expect(
      repoFromRemote("ssh://git@git.corp.example.com:22/team/tool", hosts),
    ).toBe("git.corp.example.com/team/tool");
    expect(repoFromRemote("https://gitlab.com/acme/widgets.git", hosts)).toBe(
      null,
    );
  });

  it("round-trips routes for repos on other hosts", () => {
    const route = {
      view: "issue" as const,
      repo: "git.corp.example.com/team/tool",
      number: 3,
    };
    expect(parseSubPath(routeToSubPath(route))).toEqual(route);
  });
});

describe("gh auth status parsing", () => {
  it("lists every logged-in account per host and marks the active ones", () => {
    const text = [
      "github.com",
      "  ✓ Logged in to github.com account alice (keyring)",
      "  - Active account: true",
      "  - Git operations protocol: https",
      "  ✓ Logged in to github.com account alice-client (keyring)",
      "  - Active account: false",
      "  X Failed to log in to github.com account broken (keyring)",
      "  - Active account: false",
      "ghe.example.com",
      "  ✓ Logged in to GHE.example.com account alice (oauth_token)",
      "  - Active account: true",
    ].join("\n");
    expect(parseAuthStatus(text)).toEqual([
      { host: "github.com", login: "alice", active: true },
      { host: "github.com", login: "alice-client", active: false },
      { host: "ghe.example.com", login: "alice", active: true },
    ]);
  });
});
