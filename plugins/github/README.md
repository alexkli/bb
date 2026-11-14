# bb-plugin-github

GitHub issues and pull requests inside BB, with one-click agent dispatch.

Install it from the BB Official catalog:

```sh
bb plugin install github
```

## What it does

- **Sidebar panel** (GitHub logo, full width): Issues and Pull requests tabs
  across every tracked repo, with a repo filter (persisted in localStorage)
  and a New issue form.
- **Issue detail**: markdown body, comments, comment box, status,
  assignee, and label editing, plus "Send agent".
  Deep-linkable via the URL hash: `#/issues/<owner>/<repo>/<number>`.
- **Send agent / Review with agent**: spawns a BB worker thread on the issue
  (or a review thread on the PR) in the repo's BB project. The issue/PR then
  shows a ⚡ pill linking to the thread.
- **Homepage section**: recent open issues with the same Send agent buttons.
- **Mentions**: `@` or `#` in any composer completes GitHub issues and PRs; the
  selected item's title/body/state is attached as agent context at send time.
- **`bb github` CLI**: `repos`, `issues [repo]`, `prs [repo]`, `sync` — also
  discoverable by agents through the plugin-commands skill. Each command takes
  `--json` (`{"ok":true,…}` on success, `{"ok":false,"error":{…}}` on failure)
  and `--help`, which prints its arguments and options and exits 0.

## Auth

Uses the GitHub CLI. If `gh auth status` passes, the plugin works; otherwise
it reports needs-configuration. No tokens are stored by the plugin.

Every account listed by `gh auth status` is used, on github.com and on GitHub
Enterprise Server hosts. For each repository the plugin uses the host's active
account when it has access, otherwise it tries the host's other accounts and
remembers the first one that can read the repository. Commands for that
repository then run with that account's token (`gh auth token --user`) passed
through `GH_TOKEN`, so `gh auth switch` is never changed. The account shown for
each repository is part of the `status` RPC, and `@me` in filters matches any
of your accounts.

## Which repos are tracked

- Every BB project source whose checkout has a GitHub `origin` remote
  (repo → project mapping is also how spawn picks the project).
- Remotes on GitHub Enterprise Server hosts that `gh` is logged in to, and ssh
  host aliases such as `github.com-work`, are recognized too. Enterprise repos
  are named `host/owner/repo`.
- Plus the `extraRepos` setting: comma-separated `owner/repo` (or
  `host/owner/repo`) list. Entries that
  are not `owner/repo` — a `owner/*` wildcard, a bare owner, a typo — are not
  tracked; `bb github repos` names them on stderr and the plugin log warns once
  per distinct set. Wildcards are not supported.
- `defaultProject` setting: where threads spawn for repos with no project.

```
bb plugin config github set extraRepos "owner/repo, owner/other"
bb plugin reload github
```

## List columns

The issue and pull request lists show ID, Repo, Title, Assignee, Status, and
Updated by default. Repo shows the repository name, or
`owner/repo` when two tracked owners share a name; hover it for the full name.
Pick columns from the **Columns** menu next to the tabs, or set the ordered
`columns` setting:

```
bb plugin config github set columns "repo, id, title, status"
bb plugin config github unset columns
```

| Column      | Shows                                                            |
| ----------- | ---------------------------------------------------------------- |
| `id`        | Issue or PR number                                               |
| `repo`      | Repository                                                       |
| `title`     | Title; always shown                                              |
| `labels`    | Label chips that fit, then a `+N` count; hover for all           |
| `author`    | Avatar of who opened it; hover for name and @handle              |
| `assignee`  | Assignee avatars; hover for name and @handle                     |
| `status`    | Open/closed/merged state                                         |
| `review`    | PRs only: approved, changes requested, or review required        |
| `checks`    | PRs only: CI rollup of the head commit (success/failure/pending) |
| `draft`     | PRs only: draft marker                                           |
| `size`      | PRs only: lines added and removed                                |
| `agent`     | BB agent threads working on it (otherwise shown after the title) |
| `comments`  | Comment count                                                    |
| `milestone` | Milestone title                                                  |
| `created`   | When it was opened                                               |
| `updated`   | When it last changed                                             |

PR-only columns are skipped on the Issues tab. Unknown names are rejected.
Changes apply to open panels immediately. Drag a column header to reorder the
columns; the new order is saved to the same setting.

Drag the right edge of a column header to resize it; double-click the edge to
restore its default width, or use **Reset column widths** in the Columns menu.
Title is not resizable: it takes the remaining space. Widths are saved to the
`columnWidths` setting:

```
bb plugin config github set columnWidths "repo=160, labels=220"
bb plugin config github unset columnWidths
```

Widths are in pixels, clamped to 32–640, and apply to the wide layout only.

Click a column header to sort by it, and click again to reverse. The sort is a
filter qualifier, `sort:<column>-<asc|desc>` (for example `sort:repo-asc`), so
it can also be typed into the filter and is remembered with it. Without one,
lists are sorted by `updated-desc`.

A background service refreshes immediately on startup, then waits 15 minutes
after each completed sync. Each tracked repository uses one bounded `gh api graphql`
request per sweep, using the existing GitHub CLI authentication. It fetches
100 open and 50 closed issues, plus 50 open and 30 closed or merged PRs,
ordered by creation time descending. Labels and assignees are each limited to
100 per item, matching the previous list commands. Repositories with Issues
disabled still sync PRs. Failed or incomplete repository responses retain that
repository’s cached rows.

Batching reduces list-fetch process invocations from four to one per repository
(75%). This does not measure GraphQL rate-limit point savings.
Background data may take 15 minutes plus sync time to refresh. The panel's
Refresh button, the `refresh` RPC, or `bb github sync` starts a sync immediately.

Transient authentication failures and failures across all repositories retain
the existing retry backoff: 30 seconds, doubling to a five-minute cap, reset
after a successful sync. Partial repository failures use the normal interval.
The interval is internal policy; there is no polling setting.

## Development

Run the checks from the repository root:

```sh
pnpm exec turbo run typecheck test --filter=bb-plugin-github
```
