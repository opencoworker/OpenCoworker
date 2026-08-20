import { WebClient } from '@slack/web-api'
import { shell } from 'electron'
import { randomBytes } from 'crypto'
import { getSecret, setSecret, updateConfig, loadConfig, loadSecrets, saveSecrets } from '../gateway'

// Registered Slack app Client ID (not secret — safe to commit).
// Override via SLACK_CLIENT_ID env var if needed.
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID ?? '498187249974.11869539635846'

let _client: WebClient | null = null

function getClient(): WebClient {
  if (_client) return _client
  const token = getSecret('slackAccessToken')
  if (!token) throw new Error('Slack not connected — run OAuth first')
  _client = new WebClient(token)
  return _client
}

export function resetClient(): void {
  _client = null
}

// ─── Connect ─────────────────────────────────────────────────────────────────

export async function connectViaOAuthRelay(relayUrl: string): Promise<void> {
  const state = randomBytes(16).toString('hex')
  shell.openExternal(`${relayUrl}/slack/start?state=${state}`)

  // Poll the relay for the token until the user completes the browser flow.
  const deadline = Date.now() + 5 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(`${relayUrl}/slack/token?state=${state}`)
    const json = await res.json() as { token?: string; error?: string; pending?: boolean }
    if (json.token) {
      await connectWithToken(json.token)
      return
    }
    if (json.error) throw new Error(json.error)
    // json.pending === true → still waiting, keep polling
  }
  throw new Error('OAuth timed out — no response within 5 minutes')
}

export async function connectWithToken(token: string): Promise<void> {
  const client = new WebClient(token)
  const authInfo = await client.auth.test()
  if (!authInfo.ok) throw new Error(authInfo.error ?? 'Token validation failed')

  setSecret('slackAccessToken', token)
  _client = client
  updateConfig({
    slackConnected: true,
    slackTeamId: (authInfo.team_id as string) ?? '',
    slackTeamName: (authInfo.team as string) ?? '',
    slackUserId: (authInfo.user_id as string) ?? '',
    slackUserName: (authInfo.user as string) ?? ''
  })
}

export function disconnectSlack(): void {
  _client = null
  const current = loadSecrets()
  saveSecrets({ ...current, slackAccessToken: undefined })
  updateConfig({
    slackConnected: false,
    slackTeamId: '',
    slackTeamName: '',
    slackUserId: '',
    slackUserName: ''
  })
}

// ─── Slack API wrappers ──────────────────────────────────────────────────────

export interface SlackChannel {
  id: string
  name: string
  numMembers: number
  isMember: boolean
}

export async function listChannels(): Promise<SlackChannel[]> {
  const client = getClient()
  const channels: SlackChannel[] = []
  let cursor: string | undefined

  do {
    const res = await client.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
      limit: 200,
      cursor
    })
    for (const ch of res.channels ?? []) {
      if (ch.is_member) {
        channels.push({
          id: ch.id!,
          name: ch.name!,
          numMembers: ch.num_members ?? 0,
          isMember: true
        })
      }
    }
    cursor = res.response_metadata?.next_cursor ?? undefined
  } while (cursor)

  return channels.sort((a, b) => b.numMembers - a.numMembers)
}

export interface SlackMessage {
  ts: string
  userId: string
  text: string
  replyCount: number
  reactions: number
  isThread: boolean
  threadTs?: string
}

export async function getChannelHistory(
  channelId: string,
  oldestTs: number,
  latestTs: number,
  limit = 200
): Promise<SlackMessage[]> {
  const client = getClient()
  const res = await client.conversations.history({
    channel: channelId,
    oldest: String(oldestTs),
    latest: String(latestTs),
    limit
  })

  return (res.messages ?? [])
    .filter((m) => m.type === 'message' && !m.subtype)
    .map((m) => ({
      ts: m.ts!,
      userId: m.user ?? m.bot_id ?? 'unknown',
      text: m.text ?? '',
      replyCount: m.reply_count ?? 0,
      reactions: (m.reactions ?? []).reduce((sum: number, r: { count?: number }) => sum + (r.count ?? 0), 0),
      isThread: !!m.thread_ts && m.thread_ts !== m.ts,
      threadTs: m.thread_ts
    }))
}

export async function getThreadReplies(
  channelId: string,
  threadTs: string,
  limit = 20
): Promise<SlackMessage[]> {
  const client = getClient()
  const res = await client.conversations.replies({
    channel: channelId,
    ts: threadTs,
    limit
  })
  return (res.messages ?? [])
    .slice(1)
    .map((m) => ({
      ts: m.ts!,
      userId: m.user ?? 'unknown',
      text: m.text ?? '',
      replyCount: 0,
      reactions: 0,
      isThread: true,
      threadTs
    }))
}

export interface UserProfile {
  id: string
  displayName: string
  realName: string
}

const _userCache = new Map<string, UserProfile>()

export async function getUserProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
  const client = getClient()
  const uncached = userIds.filter((id) => !_userCache.has(id))

  await Promise.all(
    uncached.map(async (id) => {
      try {
        const res = await client.users.info({ user: id })
        const u = res.user
        if (u) {
          _userCache.set(id, {
            id,
            displayName: u.profile?.display_name || u.name || id,
            realName: u.profile?.real_name || u.name || id
          })
        }
      } catch {
        _userCache.set(id, { id, displayName: id, realName: id })
      }
    })
  )

  const result = new Map<string, UserProfile>()
  for (const id of userIds) {
    result.set(id, _userCache.get(id) ?? { id, displayName: id, realName: id })
  }
  return result
}

export function getCurrentUserId(): string {
  return loadConfig().slackUserId
}
