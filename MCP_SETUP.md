# MCP Servers — Vyora

This repo ships a committed [`.mcp.json`](.mcp.json) wiring up the MCP servers
used to build, test, and operate Vyora. Credentials are **never** hard-coded —
`.mcp.json` references `${ENV_VARS}` that Claude Code expands from the process
environment at launch.

## Servers

| Server | Purpose | Works now? | Needs |
|---|---|---|---|
| **filesystem** | File ops scoped to `D:/websites/Vyora` | ✅ verified — 14 tools | — |
| **playwright** | Drives a real browser for the `e2e/` suite | ✅ verified — 24 tools | — (downloads browsers on first use) |
| **context7** | Up-to-date library/API docs | ✅ verified — 2 tools | optional `CONTEXT7_API_KEY` (raises rate limits) |
| **github** | Repos, issues, PRs on `prasadkumarg202/Vyora` | 🔑 OAuth | run `/mcp` → authenticate. No PAT needed. |
| **supabase** | Remote project, `--read-only` | 🔑 | `SUPABASE_ACCESS_TOKEN` |
| **postgres-local** | Direct SQL over the local Supabase Postgres | ⛔ blocked | Docker (see below) |

"Verified" means an `initialize` + `tools/list` handshake succeeded against the
server as configured here.

The remote Supabase project ref is defaulted to **`hvvsmtiytihlbzlkkbjl`**
(project "Vyora", `ap-southeast-1`). A ref is public — it appears in the project
URL — so only the access token is a secret.

## Setup

1. Copy the credential template and fill in what you have:
   ```bash
   cp .env.mcp.example .env.mcp     # then edit; .env.mcp is gitignored
   ```
2. Export the vars **before** launching Claude Code — `${VAR}` in `.mcp.json` is
   expanded from the process env, not read from a file:
   ```bash
   set -a; source .env.mcp; set +a   # git-bash
   claude
   ```
3. On first load Claude Code shows a **workspace-trust prompt** for `.mcp.json`.
   Approve it, then run `/mcp` to check status and complete the GitHub OAuth flow.
4. A server whose credential is missing stays listed as "needs auth". It is
   simply unusable until you supply the key — nothing else breaks.

## postgres-local needs Docker

`postgres-local` points at the local Supabase stack
(`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, the `[db] port` in
[`supabase/config.toml`](supabase/config.toml)). That stack is started with
`supabase start`, which **requires Docker** — and Docker is not currently
installed on this machine, so the server fails to connect.

Two ways to make it usable:

- Install Docker Desktop, then `npx supabase start`; or
- Set `SUPABASE_DB_URL` in `.env.mcp` to any reachable Postgres DSN (e.g. the
  remote project's connection string from the Supabase dashboard) — the server
  honours it over the local default.

Until then use the **supabase** server (read-only, remote) for database work.

## Already on your claude.ai account

`claude mcp list` shows remote connectors attached account-wide, independent of
this file: **Supabase**, **Slack**, **Gmail**, **Google Drive** (connected);
Notion, Canva, Metal, OctoPerf (need auth). The `.mcp.json` entries here are the
project-local, portable equivalents so the setup reproduces for anyone who
clones the repo.
