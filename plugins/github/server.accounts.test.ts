import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";
import { installFakeGh } from "./testing/fake-gh";

let binDir: string;
let callLog: string;
let restoreEnv: () => void;

const emptyLists = JSON.stringify({
  data: {
    repository: {
      hasIssuesEnabled: true,
      openIssues: { nodes: [] },
      closedIssues: { nodes: [] },
      openPrs: { nodes: [] },
      closedPrs: { nodes: [] },
    },
  },
});

const authStatus = [
  "github.com",
  "  ✓ Logged in to github.com account primary (keyring)",
  "  - Active account: true",
  "  ✓ Logged in to github.com account client (keyring)",
  "  - Active account: false",
  "ghe.example.com",
  "  ✓ Logged in to ghe.example.com account corp (keyring)",
  "  - Active account: true",
].join("\n");

function calls(): Array<{ args: string; token: string }> {
  if (!existsSync(callLog)) return [];
  return readFileSync(callLog, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { args: string; token: string });
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), "bb-github-accounts-"));
  callLog = join(binDir, "gh-calls.log");
  restoreEnv = installFakeGh(
    binDir,
    `const joined = args.join(" ");
const token = process.env.GH_TOKEN ?? "";
fs.appendFileSync(${JSON.stringify(callLog)}, JSON.stringify({ args: joined, token }) + "\\n");
if (joined === "--version") { out("gh version 2.96.0 (fake)\\n"); process.exit(0); }
if (joined === "auth status --hostname github.com --active") { out("ok\\n"); process.exit(0); }
if (joined === "api user") { out('{"login":"primary"}\\n'); process.exit(0); }
if (joined === "auth status") { out(${JSON.stringify(authStatus)} + "\\n"); process.exit(0); }
if (joined.startsWith("auth token ")) {
  out("token-" + args[args.indexOf("--user") + 1] + "\\n");
  process.exit(0);
}
const privateRepo = joined.includes("client-org/private") || joined.includes("owner=client-org");
if (privateRepo && token !== "token-client") {
  err("gh: Could not resolve to a Repository with the name 'client-org/private'.\\n");
  process.exit(1);
}
if (joined.startsWith("api graphql ")) { out(${JSON.stringify(emptyLists)} + "\\n"); process.exit(0); }
out("{}\\n");`,
  );
});

afterEach(() => {
  restoreEnv();
  rmSync(binDir, { recursive: true, force: true });
});

describe("multiple gh accounts and hosts", () => {
  it("finds the account that can read a repo, remembers it, and leaves others on the active account", async () => {
    const host = createFakePluginHost({
      pluginId: "github",
      settings: {
        extraRepos:
          "acme/public, client-org/private, ghe.example.com/corp/tools",
      },
    });
    await plugin(host.bb);

    await expect(host.harness.callRpc("refresh")).resolves.toEqual({
      repos: 3,
      items: 0,
    });

    const graphql = calls().filter((call) =>
      call.args.startsWith("api graphql "),
    );
    expect(
      graphql.find((call) => call.args.includes("owner=client-org"))?.token,
    ).toBe("token-client");
    expect(
      graphql.find((call) => call.args.includes("owner=acme"))?.token,
    ).toBe("");
    expect(
      graphql.find((call) => call.args.includes("owner=corp"))?.args,
    ).toContain("--hostname ghe.example.com");

    const status = (await host.harness.callRpc("status")) as {
      repos: Array<{ repo: string; login: string | null }>;
    };
    expect(
      Object.fromEntries(status.repos.map((info) => [info.repo, info.login])),
    ).toEqual({
      "acme/public": "primary",
      "client-org/private": "client",
      "ghe.example.com/corp/tools": "corp",
    });

    const probes = calls().filter((call) =>
      call.args.startsWith("api repos/client-org/private"),
    ).length;
    await host.harness.callRpc("refresh");
    expect(
      calls().filter((call) =>
        call.args.startsWith("api repos/client-org/private"),
      ),
    ).toHaveLength(probes);

    await expect(host.harness.callRpc("viewer")).resolves.toMatchObject({
      logins: expect.arrayContaining(["primary", "client", "corp"]),
    });
  });
});
