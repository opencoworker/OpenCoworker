# Open Coworker (Workbench) — High-Level Technical Design
## Phase 1: Slack PoC — Daily Summary Skill

**Version:** 0.2 Draft  
**Status:** In Review  
**Date:** 2026-08-20  
**Changes from v0.1:** Added model provider abstraction (BYO subscription + API key); harness architecture from Cindy; updated system diagram, skill runtime, onboarding, risks.

---

## 1. Purpose & Scope

This document covers the technical architecture for **Phase 1**: a Mac desktop PoC that proves Open Coworker can:

1. Connect to a user's Slack workspace via OAuth and hold permissions securely.
2. Execute a **Daily Summary Skill** each morning that reads Slack activity and delivers a rich HTML digest to the user.
3. Run LLM tasks through the user's **existing Claude or Codex subscription** (no duplicate billing) or a direct API key — user's choice.

Phase 1 is deliberately narrow — one connector, one skill, one automation. The goal is to validate the full stack (auth → plugin → skill → model → automation → output) before adding more connectors or skills.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      Workbench Mac App (Electron)                     │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐   │
│  │  UI Shell    │  │  Skill       │  │  Automation               │   │
│  │  (React)     │  │  Runtime     │  │  Scheduler (cron)         │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────────┘   │
│         │                 │                        │                   │
│  ┌──────▼─────────────────▼────────────────────────▼────────────────┐ │
│  │                   Capability Gateway (local)                      │ │
│  │     Credential Vault │ Permission Checks │ Audit Log              │ │
│  └────────────────────────────────┬──────────────────────────────────┘ │
│                                   │                                     │
│         ┌─────────────────────────┼───────────────────────┐            │
│         │                         │                         │           │
│  ┌──────▼────────┐    ┌───────────▼────────────┐          │           │
│  │  MCP Client   │    │  Model Provider Router  │          │           │
│  │  (Connectors) │    │                         │          │           │
│  └──────┬────────┘    └───┬──────────┬──────────┘          │           │
│         │                 │          │                       │           │
└─────────┼─────────────────┼──────────┼───────────────────────────────--┘
          │ stdio           │          │
  ┌───────▼──────┐  ┌───────▼──────┐  └──────────────────┐
  │  Slack MCP   │  │ Claude Code  │  │  Direct API Key   │
  │  Server      │  │ Harness      │  │  (Anthropic /     │
  │  (local)     │  │ (subprocess) │  │   OpenAI)         │
  └───────┬──────┘  └───────┬──────┘  └──────────────────-┘
          │                 │
  ┌───────▼──────┐  ┌───────▼──────┐
  │  Slack Cloud │  │ claude.ai    │
  │  (Web API)   │  │ subscription │
  └──────────────┘  └──────────────┘
```

---

## 3. Application Shell

### 3.1 Runtime: Electron

| Decision | Rationale |
|----------|-----------|
| **Electron (Node.js + Chromium)** | Single codebase for Mac now, Windows later. Ecosystem overlap with MCP (Node.js), OAuth libraries, scheduler. Native Swift would require a full rewrite for Windows. |
| **React** (UI) | Component model fits the multi-surface design (task view, skill library, connector manager). |
| **Main Process** | Owns MCP client lifecycle, credential vault, scheduler, OS tray icon, model provider subprocess management. |
| **Renderer Process** | React UI. Communicates with main via IPC (`ipcRenderer`/`ipcMain`). |

### 3.2 Mac-specific integration (Phase 1)

- **System tray icon** — app runs in background after first launch; tray shows summary delivery status.
- **Notifications** — native `Notification` API (via Electron) when daily summary is ready.
- **Login item** — registers with macOS login items so automation survives reboots.
- **Keychain** — all secrets (Slack tokens, API keys) stored in macOS Keychain via `keytar`. Windows equivalent is Windows Credential Manager — same `keytar` API, no code change needed later.

---

## 4. Model Provider System

The biggest learning from Cindy: **don't require users to provision API keys**. Power users already have Claude Pro/Max subscriptions (and use Claude Code) or OpenAI/Codex subscriptions. Requiring a separate API key creates friction and double-billing. Instead, we offer three consumption modes — user picks one during onboarding.

### 4.1 Three Modes

| Mode | How it works | User requirement | Phase 1 |
|------|-------------|-----------------|---------|
| **BYO Claude Code subscription** | Spawn `claude` CLI as a harness subprocess; pipe prompts/responses via stdin/stdout. Runs on the user's claude.ai Pro/Max account. | Claude Code installed + logged in | ✅ Primary |
| **BYO Codex subscription** | Spawn `codex` CLI as a harness subprocess; same pattern. Runs on OpenAI account. | Codex CLI installed + logged in | ✅ Supported |
| **API key** | Direct HTTPS to Anthropic or OpenAI API. User pastes key in Preferences. | API key | ✅ Fallback |
| **Local model** | Route via Ollama or LM Studio local server. | Local model runtime | Phase 2 |

### 4.2 Model Provider Router

```
┌───────────────────────────────────────────────────────┐
│              ModelProviderRouter                       │
│                                                        │
│  resolve(skillManifest) → activeProvider               │
│                                                        │
│  Providers:                                            │
│  ┌────────────────────────────────────────────────┐   │
│  │ ClaudeCodeHarness                               │   │
│  │  - detects `claude` CLI via PATH / known paths  │   │
│  │  - spawns subprocess per invocation             │   │
│  │  - streams response via readline                │   │
│  │  - maps to Skill's llm.complete() contract      │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ CodexHarness                                    │   │
│  │  - same pattern, `codex` CLI                    │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ AnthropicAPIProvider                            │   │
│  │  - @anthropic-ai/sdk, key from Keychain         │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ OpenAIAPIProvider                               │   │
│  │  - openai SDK, key from Keychain                │   │
│  └────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

### 4.3 ClaudeCodeHarness (primary path)

Borrowing from Cindy's harness model: we treat Claude Code CLI as a first-class execution environment rather than just an API client. The user's existing claude.ai subscription does the inference — no API key, no extra cost.

**Detection at startup:**
```
1. Check PATH for `claude`
2. Check known install paths: /usr/local/bin/claude, ~/.claude/bin/claude
3. Run `claude --version` to confirm it's alive
4. Run `claude whoami` to confirm the user is logged in
5. If detected + logged in → set as default provider; skip API key prompt
```

**Invocation per skill call:**
```
spawn: claude -p "<prompt>" --output-format json
  └─ --output-format json gives structured response
  └─ model flag: --model claude-sonnet-4-6 (skill manifest can override)
  └─ stdin closed immediately (non-interactive)
stdout → parse JSON → return to Skill Runtime
stderr → log to ~/.workbench/logs/claude-harness.log
```

**Constraints:**
- Each LLM call spawns a short-lived subprocess; no persistent session across skill steps (acceptable for Phase 1; Phase 2 can add session pinning).
- Context window: the full prompt is assembled in-process and passed as `-p`; skill must stay within model context limits.
- No streaming in Phase 1 (collect full stdout then return); add streaming in Phase 2.

### 4.4 Onboarding: Model Provider Setup

```
Step 1 (auto-detect):
  ┌─────────────────────────────────────────────────────┐
  │  We found Claude Code on your Mac.                  │
  │  Use your claude.ai subscription for AI tasks?      │
  │                                                      │
  │  [Use Claude Code ✓]   [Set up differently]         │
  └─────────────────────────────────────────────────────┘

Step 1b (if not found, or user chooses "Set up differently"):
  ┌─────────────────────────────────────────────────────┐
  │  How should Open Coworker run AI tasks?             │
  │                                                      │
  │  ○ Install Claude Code (free, uses claude.ai acct)  │
  │  ○ Use Codex (uses OpenAI account)                  │
  │  ○ Enter Anthropic API key                          │
  │  ○ Enter OpenAI API key                             │
  └─────────────────────────────────────────────────────┘

Step 2 (for API key paths only):
  ┌─────────────────────────────────────────────────────┐
  │  Paste your API key. It's stored in macOS Keychain  │
  │  and never sent anywhere except the provider.       │
  │  [sk-ant-...________________]  [Save]               │
  └─────────────────────────────────────────────────────┘
```

### 4.5 Skill Runtime `llm` interface

Skills are model-agnostic. They call a stable interface; the router resolves which provider handles it:

```typescript
interface LLMClient {
  complete(opts: {
    prompt: string;
    systemPrompt?: string;
    model?: string;         // optional override; default from user preference
    maxTokens?: number;
    responseFormat?: 'text' | 'json';
  }): Promise<{ text: string; usage: TokenUsage }>;
}
```

The Skill never imports a provider SDK directly — it receives `llm` from the runtime, making Skills portable across providers with zero code changes.

---

## 5. Slack Connector (Plugin)

Borrowing the architecture from [`slackapi/slack-skills-plugin`](https://github.com/slackapi/slack-skills-plugin): a **local MCP server** wraps Slack Web API calls and exposes tools to the Skill Runtime via standard MCP protocol.

### 5.1 Slack MCP Server

- **Implemented as:** Node.js process spawned by the Electron main process at startup (stdio transport).
- **Pattern:** Local MCP server wrapping `@slack/web-api` — we run it locally rather than using Slack's hosted server, giving full control over credential handling.

**Exposed MCP tools (Phase 1 minimum set):**

| Tool | Description |
|------|-------------|
| `slack_list_channels` | List joined channels with metadata |
| `slack_get_channel_history` | Fetch messages from a channel in a time window |
| `slack_get_thread_replies` | Fetch thread replies for a message |
| `slack_search_messages` | Full-text search across workspace |
| `slack_get_user_profile` | Resolve user IDs to display names |
| `slack_list_reactions` | Get reactions on messages (signal for importance) |

- **MCP resource:** `slack://workspace/{team_id}` — workspace metadata, channel list, current user.

### 5.2 OAuth 2.0 Authorization Flow

```
User clicks "Connect Slack"
        │
        ▼
Electron opens OS browser to Slack OAuth URL
  (response_type=code, scopes below, redirect_uri=localhost callback)
        │
        ▼  (Slack redirects back)
Local HTTP server (ephemeral, port ~49152) receives auth code
        │
        ▼
Main process exchanges code → access_token + refresh_token
  via POST to slack.com/api/oauth.v2.access
        │
        ▼
Tokens stored in macOS Keychain via keytar
        │
        ▼
Slack MCP Server reads token from Keychain on startup
```

**Required Slack OAuth scopes (Phase 1):**
```
channels:history   channels:read    groups:history
groups:read        im:history       mpim:history
search:read        users:read       reactions:read
```

**Admin pre-approval note:** Following the `slack-skills-plugin` pattern, the Slack app must be installed to the workspace by a workspace admin before users can authenticate. Onboarding surfaces a deep-link to the admin install page plus an "email your admin" template if the user isn't an admin.

### 5.3 Connector Descriptor (Gateway registration)

```json
{
  "id": "slack",
  "name": "Slack",
  "version": "1.0.0",
  "transport": { "type": "stdio", "command": "node", "args": ["./connectors/slack/server.js"] },
  "actions": [
    { "tool": "slack_get_channel_history", "access": "read", "destructive": false },
    { "tool": "slack_search_messages",     "access": "read", "destructive": false }
  ],
  "requiredScopes": ["channels:history", "search:read", "users:read", "reactions:read"],
  "credentialRef": "keychain:slack_tokens"
}
```

---

## 6. Capability Gateway (local, Phase 1)

A lightweight in-process module in the Electron main process:

1. **Credential injection** — when a Skill invokes a Slack tool, the Gateway retrieves the token from Keychain and injects it into the MCP server call. The Skill never sees the raw token. Same for API keys when using API key mode.
2. **Permission check** — validates that the requested tool is in the connector's declared `actions` list and that the current user has granted that connector.
3. **Audit log** — append-only NDJSON (`~/.workbench/audit.log`) recording `{timestamp, skill, tool, args_hash, result_status, provider}`.

Full remote Gateway (multi-user, enterprise) is out of scope for Phase 1.

---

## 7. Skill Runtime

Skills are TypeScript modules bundled at install time with `esbuild`. A Skill is a directory with a manifest + bundled entry point.

### 7.1 Skill manifest (`skill.json`)

```json
{
  "id": "daily-slack-summary",
  "name": "Daily Slack Summary",
  "version": "1.0.0",
  "description": "Reads yesterday's Slack activity and delivers an HTML morning digest.",
  "requiredPlugins": ["slack"],
  "preferredModel": "claude-sonnet-4-6",
  "entrypoint": "index.js",
  "outputFormat": "html"
}
```

`preferredModel` is a hint to the router; it's honoured when the provider supports it and ignored otherwise (e.g., a Codex harness will use an appropriate OpenAI model instead).

### 7.2 Skill execution context

```typescript
interface SkillContext {
  tools: GatewayProxy;     // MCP tool calls, credentials injected by Gateway
  llm: LLMClient;          // provider-agnostic, resolved by ModelProviderRouter
  output: OutputChannel;   // typed: html | markdown | json
  ctx: {
    user: { name: string; slackUserId: string; timezone: string };
    trigger: { type: 'schedule' | 'manual'; time: Date };
  };
}
```

---

## 8. Daily Summary Skill (Phase 1 Skill)

### 8.1 What it does

Runs each morning (configurable, default 07:30 local time). Reads the past 24 hours of Slack activity and produces a single self-contained HTML page delivered via system notification.

### 8.2 Execution steps

```
1. Resolve active channels
   └─ slack_list_channels → filter: joined, non-archived, exclude bot channels

2. Fetch yesterday's messages per channel (parallel, max 20 channels)
   └─ slack_get_channel_history(channel, oldest=yesterday_00:00, latest=today_00:00)

3. Fetch thread replies for threads with ≥2 replies (parallel)
   └─ slack_get_thread_replies(channel, thread_ts)

4. Resolve user IDs → display names (batch, LRU-cached across runs)
   └─ slack_get_user_profile(user_ids[])

5. Score messages for importance
   └─ heuristic: reaction count × 2 + reply count + @mentions of current user × 5 + DM mentions

6. LLM summarization call  [via ModelProviderRouter]
   Input:  top-scored messages per channel + thread context
   System: "You are a work assistant. Be concise and action-oriented."
   Prompt: "Summarize yesterday's Slack activity for {user.name}.
            For each channel: key decisions, action items assigned to me,
            important announcements. Skip channels with no meaningful activity."
   ResponseFormat: json → {channels: [{name, summary, actionItems[], skipped}]}

7. Render HTML report  (self-contained, no external deps)
   └─ Inline CSS + JS template → ~/.workbench/summaries/YYYY-MM-DD.html

8. Deliver
   └─ macOS Notification: "Your daily Slack summary is ready"
   └─ Click → open HTML in default browser
   └─ Tray menu entry: "Open today's summary"
```

### 8.3 HTML Output Structure

```
┌──────────────────────────────────────────────────────────────┐
│  Good morning, [Name]  ·  Wed Aug 20  ·  Slack Digest        │
│  via Claude Code (claude.ai)  ·  generated 07:31             │
├──────────────────────────────────────────────────────────────┤
│  ★ NEEDS YOUR ATTENTION                                      │
│    · @Sam: can you review the API spec? (#backend)           │
│    · Action item assigned to you (#product standup)          │
├──────────────────────────────────────────────────────────────┤
│  CHANNELS  (12 active · 4 skipped)                           │
│  ┌ #backend ──────────────────────────────────────────────┐  │
│  │ Key decisions: Switched to cursor-based pagination      │  │
│  │ Action items: Review API spec PR (→ you)               │  │
│  │ 3 threads · 28 messages                                │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌ #product ──────────────────────────────────────────────┐  │
│  │ ...                                                    │  │
│  └────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  12 channels · 147 messages · 8s  ·  model: claude-sonnet-4-6│
└──────────────────────────────────────────────────────────────┘
```

The footer shows which provider/model was used — important for transparency since users may have multiple providers configured.

---

## 9. Automation Scheduler

- **Library:** `node-cron` (runs in Electron main process).
- **Config:** `~/.workbench/automations.json` — `[{skillId, schedule, lastRun, enabled, provider}]`.
- **Phase 1 default:** `30 7 * * 1-5` (07:30 weekdays, local timezone).
- **User-configurable** via Preferences UI: time picker, channel filter, channel limit, preferred provider for this automation.
- **Idempotency:** checks `lastRun` date before running; skips if already ran today.
- **On resume from sleep:** `powerMonitor.on('resume')` — if scheduled time was missed within the past 30 minutes, triggers run immediately.

---

## 10. Data & Storage

| Store | What | Location | Format |
|-------|------|----------|--------|
| Slack OAuth tokens | access + refresh tokens | macOS Keychain (`keytar`) | opaque string |
| API keys | Anthropic / OpenAI keys | macOS Keychain (`keytar`) | opaque string |
| User config | preferences, active provider, scheduler config | `~/.workbench/config.json` | JSON |
| Skill catalog | installed skills | `~/.workbench/skills/` | directories |
| Audit log | tool call + LLM call history | `~/.workbench/audit.log` | NDJSON |
| Summary outputs | generated HTML reports | `~/.workbench/summaries/` | HTML files |
| User ID cache | Slack user ID → display name | `~/.workbench/cache/slack-users.json` | JSON, TTL 24h |
| Connector + harness logs | diagnostics | `~/.workbench/logs/` | rotated text |

No cloud storage in Phase 1. All data stays local.

---

## 11. Tech Stack Summary

| Layer | Technology | Notes |
|-------|------------|-------|
| App shell | Electron 32+ | Main + renderer processes |
| UI | React 19 + TailwindCSS | Renderer |
| Slack MCP server | Node.js + `@slack/web-api` | Spawned subprocess |
| MCP client | `@modelcontextprotocol/sdk` | In main process |
| Model provider: harness | `claude` / `codex` CLI subprocess | BYO subscription, primary path |
| Model provider: API | `@anthropic-ai/sdk` / `openai` | API key fallback |
| Credential storage | `keytar` | Keychain on Mac, Credential Manager on Windows |
| Scheduler | `node-cron` | In main process |
| Skill bundler | `esbuild` | Skills compiled at install time |
| Build | Electron Forge + Vite | Mac `.dmg` / `.app` |
| Package | `electron-builder` | Code-signed `.dmg` for distribution |

---

## 12. Phase 1 Milestones

| Milestone | Scope |
|-----------|-------|
| **M1** | Electron app shell boots; system tray icon; preferences window skeleton |
| **M2** | Model provider onboarding: auto-detect Claude Code; API key fallback; provider stored in config |
| **M3** | Slack OAuth flow end-to-end; token stored in Keychain; connection status shown |
| **M4** | Slack MCP server spawned; `slack_list_channels` + `slack_get_channel_history` working |
| **M5** | Daily Summary Skill prototype; manual trigger from UI; raw LLM output viewable |
| **M6** | HTML report rendering with styling; provider/model attribution in footer |
| **M7** | Automation scheduler; morning notification delivery; sleep/wake recovery |
| **M8** | Polish: channel filter UI, time picker, error states, admin install onboarding for Slack |

---

## 13. What Phase 1 Does NOT Include

- Multi-workspace Slack support (single workspace only).
- Windows support (architecture is cross-platform ready; packaging is Mac-only).
- The full Capability Gateway (no remote auth, no approval workflows, no data-class policy).
- Model switcher mid-task (provider is set in preferences; switching requires preferences change + restart of active skills).
- Local model support (Ollama etc.) — Phase 2.
- Skill Library / sharing / App gallery.
- Any connectors other than Slack.
- Event-driven triggers (schedule only).
- Streaming LLM responses (batch only in Phase 1).

---

## 14. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Claude Code CLI not installed | Auto-detect at onboarding; offer download link; graceful fallback to API key mode |
| Claude Code session expires / logged out | Run `claude whoami` health check before each skill execution; surface re-login prompt in tray if it fails |
| Codex CLI command/flag changes (external dependency) | Pin to a tested version range; integration-test the subprocess contract in CI |
| API key stored insecurely | Always `keytar` (OS keychain) — never config files, env vars, or localStorage |
| Slack workspace admin must pre-approve app | Deep-link to admin install page in onboarding; "email your admin" template; surface clear error if user tries to auth before admin install |
| Token refresh edge cases (revocation, workspace removal) | Detect `invalid_auth` / `token_revoked` in MCP server; emit error event → tray icon + re-auth prompt |
| Large workspaces (1000+ channels, heavy volume) | Default cap: top 20 channels by member count + recent activity (configurable); message count ceiling per channel |
| MCP server subprocess crash | Main process monitors child exit; auto-restart with exponential backoff (max 3 attempts); surface in tray if exhausted |
| Electron app size | Lazy-load MCP server + harness deps; ASAR packing; separate `@anthropic-ai/sdk` and `openai` into optional chunks loaded only when that provider is active |

---

*End of Phase 1 Tech Design v0.2*
