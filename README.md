# Open Coworker

Model-neutral AI work platform — Phase 1 PoC (Slack Daily Summary).

## Quick start

```bash
npm install
npm run dev
```

Walk through the 4-step onboarding: Welcome → AI Model → Slack → Done.

See [SETUP.md](SETUP.md) for prerequisites (Claude Code or Anthropic API key, Slack app).

---

## Slack authentication modes

The app supports two modes, switchable via `~/.workbench/config.json`.

### Mode 1: Token paste (current default — PoC)

```json
{ "slackAuthMode": "token" }
```

User pastes a Bot OAuth Token (`xoxb-…`) obtained from their Slack app's **OAuth & Permissions** page. Simple, no backend needed. Good for early testers who can follow setup steps.

### Mode 2: OAuth relay backend (production)

```json
{ "slackAuthMode": "oauth-relay", "oauthRelayUrl": "https://your-worker.workers.dev" }
```

User clicks "Sign in with Slack" — browser opens, they authorize, done. No token to copy.

#### How it works

```
Desktop app generates random state token
  → Opens browser to https://relay/slack/start?state=xxx
  → Relay redirects to Slack OAuth (holds Client Secret securely)
  → User authorizes in browser
  → Slack calls https://relay/slack/callback?code=yyy&state=xxx
  → Relay exchanges code for token, stores it keyed by state (5-min TTL)
  → Desktop app polls https://relay/slack/token?state=xxx every 2s
  → Gets token back, stores encrypted in macOS Keychain
```

#### Building the relay (Cloudflare Worker)

The relay needs three endpoints. Deploy on Cloudflare Workers (free tier).

**Environment variables to set in the Worker:**
- `SLACK_CLIENT_ID` — from your Slack app's Basic Information
- `SLACK_CLIENT_SECRET` — from your Slack app's Basic Information
- `SLACK_SCOPES` — `channels:history,channels:read,groups:history,groups:read,im:history,mpim:history,search:read,users:read,reactions:read`

**Slack app config:**
- Add `https://your-worker.workers.dev/slack/callback` as a Redirect URL in OAuth & Permissions

**Worker pseudocode:**

```typescript
// GET /slack/start?state=xxx
// → redirect to Slack OAuth, passing state through
export function handleStart(state: string, env: Env): Response {
  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID)
  url.searchParams.set('scope', env.SLACK_SCOPES)
  url.searchParams.set('redirect_uri', `${env.RELAY_URL}/slack/callback`)
  url.searchParams.set('state', state)
  return Response.redirect(url.toString())
}

// GET /slack/callback?code=yyy&state=xxx
// → exchange code for token, store in KV with 5-min TTL
export async function handleCallback(code: string, state: string, env: Env): Promise<Response> {
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `${env.RELAY_URL}/slack/callback`,
    }),
  })
  const json = await res.json() as { ok: boolean; access_token?: string; error?: string }
  if (!json.ok || !json.access_token) {
    return new Response(JSON.stringify({ error: json.error }), { status: 400 })
  }
  // Store token in KV, keyed by state, TTL 5 min
  await env.KV.put(state, json.access_token, { expirationTtl: 300 })
  return new Response('<h2>Connected! You can close this tab.</h2>', {
    headers: { 'Content-Type': 'text/html' },
  })
}

// GET /slack/token?state=xxx
// → return token if ready, or { pending: true } if not yet
export async function handleToken(state: string, env: Env): Promise<Response> {
  const token = await env.KV.get(state)
  if (token) {
    await env.KV.delete(state)
    return new Response(JSON.stringify({ token }))
  }
  return new Response(JSON.stringify({ pending: true }))
}
```

**KV namespace:** bind a KV namespace called `KV` to the Worker in the Cloudflare dashboard.

#### Switching modes

1. Deploy the Worker, note the URL (e.g. `https://open-coworker-relay.workers.dev`)
2. Edit `~/.workbench/config.json`:
   ```json
   {
     "slackAuthMode": "oauth-relay",
     "oauthRelayUrl": "https://open-coworker-relay.workers.dev"
   }
   ```
3. Restart the app — onboarding step 3 now shows "Sign in with Slack" instead of the token field.

---

## Architecture

```
Electron main process
  ├── Capability Gateway   — credential vault (safeStorage), audit log
  ├── Model Provider Router
  │     ├── Claude Code Harness  (spawns `claude` CLI subprocess)
  │     └── Anthropic API        (direct SDK call)
  ├── Slack Connector       — token or OAuth relay, Web API wrapper
  ├── Daily Summary Skill   — orchestrates Slack fetch → LLM → HTML
  └── Scheduler             — node-cron, weekdays 07:30

Electron renderer (React + Tailwind)
  ├── Onboarding (4 steps)
  ├── Dashboard (run now, progress log, output link)
  └── Preferences (schedule, channel limit, provider)
```

## File locations

| Path | Contents |
|------|----------|
| `~/.workbench/config.json` | App config (provider, schedule, Slack metadata, auth mode) |
| `~/.workbench/secrets.enc` | Encrypted tokens and API keys (macOS safeStorage) |
| `~/.workbench/summaries/YYYY-MM-DD.html` | Generated HTML summaries |
| `~/.workbench/audit.log` | Tool call audit log (NDJSON) |
