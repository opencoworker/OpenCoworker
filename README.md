# Open Coworker

Model-neutral AI work platform for macOS — connects Slack and Linear, runs AI skills, delivers digests and action items.

## Quick start

```bash
npm install
npm run dev
```

Walk through the 4-step onboarding: Welcome → AI Model → Slack → Done.

---

## Product overview

Open Coworker is a macOS desktop app (Electron + React) that acts as an AI-powered coworker assistant. It reads your Slack activity, runs AI skills against it, and takes action — summarizing conversations, extracting tasks, and creating work items in Linear.

### Core capabilities

| Capability | Description |
|---|---|
| **Daily Slack Summary** | Fetches 24h of channel activity, scores by importance, summarises with AI, delivers a styled HTML digest + macOS notification |
| **Weekly Action Items → Linear** | Scans 7 days of Slack, extracts action items with AI, shows a review table, then creates Linear issues assigned to the right members |
| **Skills** | View, edit, and export reusable AI skill definitions in formats compatible with Claude Code, ChatGPT, and other agent tools |
| **Linear connector** | Connect a Linear workspace via API key; platform provides the capability, clients enable it via config |

---

## AI providers

The app is model-neutral. Configure one of:

| Provider | How to connect |
|---|---|
| **Claude Code** (claude.ai subscription) | Install the `claude` CLI; detected automatically |
| **Anthropic API** | Set your API key in Preferences |

---

## Connectors

### Slack

Two auth modes, switchable via `~/.workbench/config.json`.

**Mode 1 — Token paste (default, PoC)**
```json
{ "slackAuthMode": "token" }
```
Paste a Bot OAuth Token (`xoxb-…`) from your Slack app's OAuth & Permissions page.

**Mode 2 — OAuth relay (production)**
```json
{ "slackAuthMode": "oauth-relay", "oauthRelayUrl": "https://your-worker.workers.dev" }
```
User clicks "Sign in with Slack" in the app — browser opens, they authorize, done. A Cloudflare Worker holds the Client Secret and brokers the OAuth exchange. See [`relay/DEPLOY.md`](relay/DEPLOY.md) for full deployment steps.

**OAuth relay flow:**
```
App generates state token
  → Opens browser: https://relay/slack/start?state=xxx
  → Relay redirects to Slack OAuth (Client Secret never leaves Cloudflare)
  → User clicks Allow
  → Slack calls: https://relay/slack/callback?code=yyy&state=xxx
  → Relay exchanges code → stores token in KV (5-min TTL)
  → App polls: https://relay/slack/token?state=xxx every 2s
  → Token returned → stored encrypted in macOS Keychain
```

### Linear

Connect from **Preferences → Linear** by pasting a Personal API Key (`lin_api_…`) from Linear → Settings → API → Personal API Keys.

Once connected, the **Weekly Action Items → Linear** skill becomes available on the Dashboard.

---

## Skills

Skills are reusable AI instruction sets stored as Markdown files at `~/.workbench/skills/*.md`.

### Built-in skills

| Skill | Trigger | What it does |
|---|---|---|
| `daily-slack-summary` | Scheduled / manual | 24h Slack digest → HTML report + notification |
| `weekly-action-items` | Manual | 7-day Slack scan → AI extraction → Linear issue creation |

### Weekly Action Items flow (two-phase)

```
1. Generate  →  Slack fetch (7 days) + thread replies
               + LLM extraction (titles, assignees, priority, channel)
               + Linear member lookup + fuzzy name matching
               → Returns candidate list for review

2. Review    →  Editable table: title · priority · assignee dropdown · channel
               User edits, removes, or reorders candidates

3. Create    →  Only approved candidates are written to Linear
               Each issue: title, description with context, assignee, team
               Results shown: identifier · title · assignee · link
```

### Skills page

The **Skills** tab in the app lets you:
- Browse all skill definitions (built-in and custom)
- Edit any skill's name, description, tags, and Markdown body
- Create new skills from a template
- **Export** in three formats:
  - **Claude Code** — full `SKILL.md` with YAML frontmatter, drop into `.claude/skills/<name>/SKILL.md`
  - **ChatGPT / Generic** — clean Markdown body, paste as custom instructions or system prompt
  - **Raw** — full file content

Skill files use YAML frontmatter:
```markdown
---
name: My Skill
description: What it does
tags: slack, summary
created: 2026-08-21
updated: 2026-08-21
builtIn: false
---

## Purpose
...
```

---

## Architecture

```
Electron main process
  ├── Gateway              — config (JSON), secrets (safeStorage/Keychain), audit log
  ├── Provider Router
  │     ├── Claude Code    — spawns `claude` CLI subprocess
  │     └── Anthropic API  — direct SDK call
  ├── Connectors
  │     ├── Slack          — token or OAuth relay, Web API wrapper
  │     └── Linear         — API key auth, GraphQL (teams, members, issue create)
  ├── Skills
  │     ├── daily-slack-summary    — Slack → LLM → HTML
  │     ├── weekly-action-items    — Slack → LLM → review → Linear
  │     └── manager                — CRUD + export for skill .md files
  └── Scheduler            — node-cron, weekdays 07:30

Electron renderer (React + Tailwind)
  ├── Onboarding          — 4-step setup wizard
  ├── Dashboard           — run skills, progress log, output links
  ├── Skills              — browse, edit, export skill definitions
  └── Preferences         — schedule, provider, Slack, Linear connectors

relay/ (Cloudflare Worker)
  ├── /slack/start        — redirect to Slack OAuth
  ├── /slack/callback     — exchange code for token, store in KV
  └── /slack/token        — poll for token (desktop app polls every 2s)
```

---

## Data flow — Weekly Action Items

```
Slack (7 days)
  ↓ conversations.history + conversations.replies (per channel)
  ↓ users.info (resolve display names)
  ↓
LLM (Claude Code or Anthropic API)
  ↓ structured extraction prompt → JSON
  ↓ { title, description, assignee, channel, priority }[]
  ↓
Linear API
  ↓ GET teams + users (member list for assignee dropdown)
  ↓ fuzzy name match (Slack display name ↔ Linear member name)
  ↓
Review UI (Dashboard)
  ↓ user edits / removes / reassigns candidates
  ↓
Linear API
  ↓ mutation IssueCreate per approved candidate
  ↓ { identifier, url, title } returned
  ↓
Result summary (identifier + link per created issue)
```

---

## File locations

| Path | Contents |
|------|----------|
| `~/.workbench/config.json` | App config (provider, schedule, Slack metadata, Linear metadata, auth mode) |
| `~/.workbench/secrets.enc` | Encrypted credentials: Slack token, Anthropic key, Linear API key (macOS safeStorage) |
| `~/.workbench/summaries/YYYY-MM-DD.html` | Generated daily HTML summaries |
| `~/.workbench/skills/*.md` | Skill definition files (YAML frontmatter + Markdown body) |
| `~/.workbench/audit.log` | Skill run audit log (NDJSON: timestamp, skill, provider, status) |
| `relay/` | Cloudflare Worker source for OAuth relay |
| `relay/DEPLOY.md` | Step-by-step relay deployment guide |

---

## Security

- All credentials stored encrypted via Electron `safeStorage` (macOS Keychain-backed)
- No secrets in source code or config files
- Slack Client Secret never leaves the Cloudflare Worker
- Linear API key scoped to the workspace; revoke from Linear Settings anytime
- OAuth relay tokens expire after 5 minutes and are deleted on first read
- Audit log records every skill invocation (no message content logged)
