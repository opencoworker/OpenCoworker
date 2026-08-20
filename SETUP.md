# Open Coworker — Phase 1 PoC Setup

## Prerequisites

### 1. AI Model (choose one)

**Option A — Claude Code subscription (recommended, no API key needed)**
1. Install Claude Code: https://claude.ai/code
2. Run `claude login` in terminal
3. Open Coworker will detect it automatically during onboarding

**Option B — Anthropic API key**
1. Get a key at https://console.anthropic.com
2. Paste it during onboarding (stored encrypted in macOS Keychain)

### 2. Slack App (one-time developer setup)

Register one Slack app for the product. Users authenticate via a one-click OAuth flow — no credentials are ever entered during onboarding. No Client Secret is ever needed (PKCE is used for the token exchange).

1. Go to `api.slack.com/apps` → **Create New App** → **From scratch**
2. Name: `Open Coworker`
3. Under **OAuth & Permissions → Redirect URLs**, add: `http://localhost:7123/callback`
4. Under **OAuth & Permissions → Bot Token Scopes**, add:
   ```
   channels:history   channels:read    groups:history
   groups:read        im:history       mpim:history
   search:read        users:read       reactions:read
   ```
5. Under **Settings → Manage Distribution**, enable **Removable Installation** and turn on PKCE
6. Copy the **Client ID** from Basic Information (the Client Secret is not needed)
7. Set it before running the app:
   ```bash
   export SLACK_CLIENT_ID=your_client_id
   ```

End users just click **Sign in with Slack** — their browser opens, they grant permission, and they're done.

## Running the PoC

```bash
# Install dependencies (first time only)
npm install

# Start in dev mode
npm run dev
```

The app launches a window + system tray icon. Walk through the 4-step onboarding:
1. **Welcome** — intro screen
2. **AI Model** — auto-detects Claude Code; falls back to Anthropic API key
3. **Slack** — paste Client ID + Client Secret → opens browser for OAuth
4. **Done** → Dashboard

From the Dashboard, click **▶ Run now** to generate your first summary. The HTML file opens in your browser and a macOS notification fires.

## Where files live

| Path | Contents |
|------|----------|
| `~/.workbench/config.json` | App config (provider, schedule, Slack metadata) |
| `~/.workbench/secrets.enc` | Encrypted tokens and API keys (macOS safeStorage) |
| `~/.workbench/summaries/YYYY-MM-DD.html` | Generated HTML summaries |
| `~/.workbench/audit.log` | Tool call audit log (NDJSON) |

## Build for distribution

```bash
npm run build       # compile to out/
```

macOS app packaging (code signing required for distribution) is configured in `package.json` under `"build"`.

## Architecture overview

```
Electron main process
  ├── Capability Gateway   — credential vault (safeStorage), audit log
  ├── Model Provider Router
  │     ├── Claude Code Harness  (spawns `claude` CLI subprocess)
  │     └── Anthropic API        (direct SDK call)
  ├── Slack Connector       — OAuth flow + Web API wrapper
  ├── Daily Summary Skill   — orchestrates Slack fetch → LLM → HTML
  └── Scheduler             — node-cron, weekdays 07:30

Electron renderer (React + Tailwind)
  ├── Onboarding (4 steps)
  ├── Dashboard (run now, progress log, output link)
  └── Preferences (schedule, channel limit, provider)
```
