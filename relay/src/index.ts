interface Env {
  KV: KVNamespace
  SLACK_CLIENT_ID: string
  SLACK_CLIENT_SECRET: string
}

const SLACK_SCOPES = [
  'channels:history', 'channels:read', 'groups:history', 'groups:read',
  'im:history', 'mpim:history', 'search:read', 'users:read', 'reactions:read',
].join(',')

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const relayUrl = url.origin

    switch (url.pathname) {
      case '/slack/start':    return handleStart(url, env, relayUrl)
      case '/slack/callback': return handleCallback(url, env, relayUrl)
      case '/slack/token':    return handleToken(url, env)
      default: return new Response('Open Coworker OAuth Relay', { status: 200 })
    }
  },
}

// ── /slack/start?state=xxx ────────────────────────────────────────────────────
// Desktop app opens this in the browser. Redirects to Slack OAuth.

function handleStart(url: URL, env: Env, relayUrl: string): Response {
  const state = url.searchParams.get('state')
  if (!state) return new Response('Missing state', { status: 400 })

  const authUrl = new URL('https://slack.com/oauth/v2/authorize')
  authUrl.searchParams.set('client_id', env.SLACK_CLIENT_ID)
  authUrl.searchParams.set('scope', SLACK_SCOPES)
  authUrl.searchParams.set('redirect_uri', `${relayUrl}/slack/callback`)
  authUrl.searchParams.set('state', state)

  return Response.redirect(authUrl.toString(), 302)
}

// ── /slack/callback?code=yyy&state=xxx ───────────────────────────────────────
// Slack redirects here after the user authorizes. Exchanges code for token,
// stores it in KV keyed by state with a 5-minute TTL.

async function handleCallback(url: URL, env: Env, relayUrl: string): Promise<Response> {
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return htmlResponse(`<h2>Authorization failed</h2><p>${error}</p><p>You can close this tab.</p>`)
  }
  if (!code || !state) return new Response('Missing code or state', { status: 400 })

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: `${relayUrl}/slack/callback`,
    }),
  })

  const json = await tokenRes.json() as { ok: boolean; access_token?: string; error?: string }

  if (!json.ok || !json.access_token) {
    return htmlResponse(`<h2>Error</h2><p>${json.error ?? 'Token exchange failed'}</p><p>You can close this tab.</p>`)
  }

  await env.KV.put(`oauth:${state}`, json.access_token, { expirationTtl: 300 })

  return htmlResponse(`
    <h2>✅ Connected to Slack!</h2>
    <p>You can close this tab and return to Open Coworker.</p>
  `)
}

// ── /slack/token?state=xxx ───────────────────────────────────────────────────
// Desktop app polls this every 2s. Returns { token } once ready, or { pending: true }.

async function handleToken(url: URL, env: Env): Promise<Response> {
  const state = url.searchParams.get('state')
  if (!state) return jsonResponse({ error: 'Missing state' }, 400)

  const token = await env.KV.get(`oauth:${state}`)
  if (token) {
    await env.KV.delete(`oauth:${state}`)
    return jsonResponse({ token })
  }

  return jsonResponse({ pending: true })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function htmlResponse(body: string): Response {
  return new Response(
    `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;padding:48px;text-align:center;color:#1a1d21">${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  )
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
