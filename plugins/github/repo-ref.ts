export const GITHUB_HOST = "github.com";

export const REPO_REF_PATTERN =
  /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+\/)?[\w.-]+\/[\w.-]+$/i;

export interface RepoRef {
  host: string;
  owner: string;
  name: string;
  path: string;
}

export function isRepoRef(value: unknown): value is string {
  return typeof value === "string" && REPO_REF_PATTERN.test(value);
}

export function parseRepoRef(repo: string): RepoRef {
  const parts = repo.split("/");
  const [host, owner, name] =
    parts.length === 3
      ? [parts[0]!.toLowerCase(), parts[1]!, parts[2]!]
      : [GITHUB_HOST, parts[0]!, parts[1]!];
  return { host, owner, name, path: `${owner}/${name}` };
}

export function formatRepoRef(host: string, owner: string, name: string) {
  return host === GITHUB_HOST ? `${owner}/${name}` : `${host}/${owner}/${name}`;
}

export function repoFromRemote(
  url: string,
  knownHosts: readonly string[],
): string | null {
  const match = url
    .trim()
    .match(
      /^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i,
    );
  if (match === null) return null;
  const remoteHost = match[1]!.toLowerCase();
  const hosts = [GITHUB_HOST, ...knownHosts.filter((h) => h !== GITHUB_HOST)];
  const host = hosts.find(
    (candidate) =>
      remoteHost === candidate ||
      remoteHost.startsWith(`${candidate}-`) ||
      remoteHost.startsWith(`${candidate}_`),
  );
  if (host === undefined) return null;
  return formatRepoRef(host, match[2]!, match[3]!);
}

export function avatarUrl(host: string, login: string): string {
  return `https://${host}/${encodeURIComponent(login)}.png?size=64`;
}

export interface GhAccount {
  host: string;
  login: string;
  active: boolean;
}

export function parseAuthStatus(text: string): GhAccount[] {
  const accounts: GhAccount[] = [];
  for (const line of text.split("\n")) {
    const loggedIn = /Logged in to (\S+) account (\S+)/.exec(line);
    if (loggedIn !== null) {
      accounts.push({
        host: loggedIn[1]!.toLowerCase(),
        login: loggedIn[2]!,
        active: false,
      });
      continue;
    }
    if (/Active account:\s*true/i.test(line) && accounts.length > 0) {
      accounts[accounts.length - 1]!.active = true;
    }
  }
  return accounts;
}
