# Deploying the OAuth Relay to Cloudflare Workers

This relay holds the Slack Client Secret and handles the OAuth token exchange,
so the desktop app never needs to know it. Users just click "Sign in with Slack".

## Prerequisites

- Cloudflare account (free tier is fine): https://cloudflare.com
- Node.js installed (already required for the desktop app)

---

## Step 1 — Login to Cloudflare

```bash
cd relay
npx wrangler login
```

A browser tab will open. Sign in to your Cloudflare account.

---

## Step 2 — Create the KV namespace

The KV namespace temporarily stores tokens between Slack's callback and the
desktop app polling for them (5-minute TTL).

```bash
npx wrangler kv namespace create "OAUTH_TOKENS"
```

It will print something like:

```
{ binding = "KV", id = "abc123def456..." }
```

Copy that `id` value and paste it into `wrangler.toml`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "abc123def456..."   # ← paste here
```

---

## Step 3 — Set secrets

These are stored securely in Cloudflare — never in files or git.

```bash
npx wrangler secret put SLACK_CLIENT_ID
# paste your Slack app's Client ID when prompted

npx wrangler secret put SLACK_CLIENT_SECRET
# paste your Slack app's Client Secret when prompted
```

Both values are on your Slack app's **Basic Information** page at
api.slack.com/apps → your app → Basic Information → App Credentials.

---

## Step 4 — Deploy

```bash
npx wrangler deploy
```

It will print the Worker URL, e.g.:

```
https://open-coworker-relay.workers.dev
```

Note this URL — you'll need it in the next steps.

---

## Step 5 — Add redirect URL to your Slack app

1. Go to **api.slack.com/apps** → your app → **OAuth & Permissions**
2. Under **Redirect URLs** → click **Add New Redirect URL**
3. Enter: `https://open-coworker-relay.workers.dev/slack/callback`
   (replace with your actual Worker URL if different)
4. Click **Add** → **Save URLs**

---

## Step 6 — Switch the desktop app to OAuth relay mode

Edit `~/.workbench/config.json` (create it if it doesn't exist):

```json
{
  "slackAuthMode": "oauth-relay",
  "oauthRelayUrl": "https://open-coworker-relay.workers.dev"
}
```

Replace the URL with your actual Worker URL.

Restart the desktop app — onboarding step 3 will now show a single
**Sign in with Slack** button instead of the token paste field.

---

## Testing the relay locally

You can test the Worker locally before deploying:

```bash
npx wrangler dev
```

This runs the Worker at `http://localhost:8787`. To test with the desktop app,
temporarily set `oauthRelayUrl` to `http://localhost:8787` in your config.

Note: Slack won't redirect to localhost, so local testing only works for the
`/slack/token` polling endpoint. Use a deployed Worker for the full flow.

---

## How it works

```
1. Desktop app generates a random state token
2. Opens browser → https://relay/slack/start?state=xxx
3. Relay redirects to Slack OAuth page
4. User clicks Allow in the browser
5. Slack redirects to https://relay/slack/callback?code=yyy&state=xxx
6. Relay exchanges code for token using Client Secret (never leaves Cloudflare)
7. Relay stores token in KV under state key, TTL 5 min
8. Desktop app polls https://relay/slack/token?state=xxx every 2 seconds
9. Once token is available, desktop app stores it encrypted in macOS Keychain
10. Browser tab shows "Connected! You can close this tab."
```

---

## Switching back to token-paste mode

Edit `~/.workbench/config.json`:

```json
{
  "slackAuthMode": "token"
}
```

Restart the app.
