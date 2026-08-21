import {
  listChannels,
  getChannelHistory,
  getThreadReplies,
  getUserProfiles,
  SlackMessage,
  SlackChannel
} from '../connectors/slack'
import { listTeams, listMembers, createIssue, LinearMember, LinearIssue } from '../connectors/linear'
import { complete } from '../providers/router'
import { loadConfig, auditLog } from '../gateway'
import type { SkillProgressCallback } from './daily-slack-summary'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ActionCandidate {
  id: string
  title: string
  description: string
  assigneeId: string   // Linear member ID, or '' for unassigned
  assigneeName: string // display name (for UI)
  channel: string
  priority: 'high' | 'medium' | 'low'
}

export interface CandidateReviewData {
  candidates: ActionCandidate[]
  members: LinearMember[]
  teamId: string
  teamName: string
}

export interface CreatedTask {
  issue: LinearIssue
  assigneeName: string
  channel: string
}

export interface CreateResult {
  created: CreatedTask[]
  failed: Array<{ title: string; error: string }>
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface LLMExtractionResponse {
  actionItems: Array<{
    title: string
    description: string
    assignee: string
    channel: string
    priority: 'high' | 'medium' | 'low'
  }>
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findMember(name: string, members: LinearMember[]): LinearMember | undefined {
  if (!name.trim()) return undefined
  const n = normalize(name)
  let hit = members.find((m) => normalize(m.displayName) === n || normalize(m.name) === n)
  if (hit) return hit
  hit = members.find((m) => normalize(m.displayName).includes(n) || normalize(m.name).startsWith(n.slice(0, 4)))
  return hit
}

let _nextId = 1
function nextId(): string {
  return String(_nextId++)
}

// ─── Phase 1: Generate candidates ────────────────────────────────────────────

export async function generateCandidates(
  onProgress: SkillProgressCallback
): Promise<CandidateReviewData> {
  const config = loadConfig()

  onProgress('init', 'Fetching Slack activity for the past 7 days…')

  const allChannels = await listChannels()
  const channels = allChannels.slice(0, config.summaryChannelLimit)

  const now = Date.now() / 1000
  const weekAgo = now - 7 * 86400

  onProgress('messages', `Reading ${channels.length} channels…`)

  const channelMessages = await Promise.all(
    channels.map(async (ch: SlackChannel) => {
      try {
        const msgs = await getChannelHistory(ch.id, weekAgo, now, 200)
        return { channel: ch, messages: msgs }
      } catch {
        return { channel: ch, messages: [] as SlackMessage[] }
      }
    })
  )

  onProgress('threads', 'Fetching thread replies…')

  const withReplies = await Promise.all(
    channelMessages.map(async ({ channel, messages }) => {
      const parents = messages.filter((m) => m.replyCount >= 2 && !m.isThread)
      const replies = await Promise.all(
        parents.slice(0, 10).map((m) => getThreadReplies(channel.id, m.ts, 20))
      )
      return { channel, messages, replies: replies.flat() }
    })
  )

  onProgress('users', 'Resolving user names…')

  const allUserIds = new Set<string>()
  for (const { messages, replies } of withReplies) {
    for (const m of [...messages, ...replies]) allUserIds.add(m.userId)
  }
  const userProfiles = await getUserProfiles([...allUserIds])

  const channelBlocks: string[] = []
  for (const { channel, messages, replies } of withReplies) {
    if (messages.length === 0) continue
    const msgLines = messages.slice(0, 30).map((m) => {
      const name = userProfiles.get(m.userId)?.displayName ?? m.userId
      return `  [${name}]: ${m.text.slice(0, 400)}`
    }).join('\n')
    const replyLines = replies.slice(0, 20).map((r) => {
      const name = userProfiles.get(r.userId)?.displayName ?? r.userId
      return `  [reply][${name}]: ${r.text.slice(0, 200)}`
    }).join('\n')
    channelBlocks.push(`### #${channel.name}\n${msgLines}${replyLines ? '\nReplies:\n' + replyLines : ''}`)
  }

  if (channelBlocks.length === 0) {
    // No Slack activity — still need to return Linear context
    onProgress('linear', 'No Slack activity found. Loading Linear workspace…')
    const [teams, members] = await Promise.all([listTeams(), listMembers()])
    return { candidates: [], members, teamId: teams[0]?.id ?? '', teamName: teams[0]?.name ?? '' }
  }

  onProgress('llm', 'Extracting action items with AI…')

  const systemPrompt = `You are a project management assistant analyzing Slack conversations.
Extract concrete, actionable tasks — things someone needs to DO, not discussion points.
Only extract clear commitments, assigned work, or decisions requiring follow-up.
Always respond with valid JSON, no markdown fences.`

  const prompt = `Analyze these Slack messages from the past week and extract concrete action items.

${channelBlocks.join('\n\n')}

Respond ONLY with this JSON:
{
  "actionItems": [
    {
      "title": "Clear verb+object title, max 80 chars",
      "description": "Context from the conversation (1-2 sentences)",
      "assignee": "Person's name who should do this — empty string if unclear",
      "channel": "source-channel-name",
      "priority": "high | medium | low"
    }
  ]
}

Rules:
- Only items with a clear next-action verb (review, create, send, fix, schedule, update, etc.)
- Skip vague ("we should improve X") or already-done items
- Max 20 items`

  let extraction: LLMExtractionResponse
  try {
    const raw = await complete({ prompt, systemPrompt, maxTokens: 4096 })
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    extraction = JSON.parse(cleaned) as LLMExtractionResponse
    auditLog({ skill: 'weekly-action-items', provider: config.providerType ?? 'auto', status: 'ok' })
  } catch (err) {
    auditLog({ skill: 'weekly-action-items', provider: config.providerType ?? 'auto', status: 'error', detail: String(err) })
    throw new Error(`LLM extraction failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  onProgress('linear', 'Loading Linear workspace members…')

  const [teams, members] = await Promise.all([listTeams(), listMembers()])
  const team = teams[0]

  // Map extracted items → candidates with pre-matched assignees
  const candidates: ActionCandidate[] = (extraction.actionItems ?? []).map((item) => {
    const member = findMember(item.assignee, members)
    return {
      id: nextId(),
      title: item.title,
      description: item.description,
      assigneeId: member?.id ?? '',
      assigneeName: member?.displayName ?? item.assignee,
      channel: item.channel,
      priority: item.priority ?? 'medium'
    }
  })

  onProgress('done', `Found ${candidates.length} action items — ready for review.`)

  return {
    candidates,
    members,
    teamId: team?.id ?? '',
    teamName: team?.name ?? ''
  }
}

// ─── Phase 2: Create approved candidates in Linear ────────────────────────────

export async function createFromCandidates(
  candidates: ActionCandidate[],
  teamId: string,
  onProgress: SkillProgressCallback
): Promise<CreateResult> {
  const created: CreatedTask[] = []
  const failed: Array<{ title: string; error: string }> = []

  for (const c of candidates) {
    try {
      const issue = await createIssue({
        title: c.title,
        description: `${c.description}\n\n**Source:** #${c.channel} · **Priority:** ${c.priority}\n**Created by:** Open Coworker weekly action item skill`,
        teamId,
        assigneeId: c.assigneeId || undefined
      })
      created.push({ issue, assigneeName: c.assigneeName || 'Unassigned', channel: c.channel })
      onProgress('linear', `Created ${issue.identifier}: ${c.title}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failed.push({ title: c.title, error: msg })
      onProgress('linear', `Failed "${c.title}": ${msg}`)
    }
  }

  onProgress('done', `Done — ${created.length} created, ${failed.length} failed.`)
  return { created, failed }
}
