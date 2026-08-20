import { join } from 'path'
import { writeFileSync } from 'fs'
import { Notification } from 'electron'
import {
  listChannels,
  getChannelHistory,
  getThreadReplies,
  getUserProfiles,
  getCurrentUserId,
  SlackMessage,
  SlackChannel
} from '../connectors/slack'
import { complete } from '../providers/router'
import { loadConfig, summariesDir, auditLog } from '../gateway'

export type SkillProgressCallback = (step: string, message: string) => void

interface ChannelSummary {
  name: string
  summary: string
  actionItems: string[]
  skipped: boolean
  messageCount: number
  threadCount: number
}

interface LLMSummaryResponse {
  channels: ChannelSummary[]
  topAttentionItems: string[]
}

function scoreMessage(msg: SlackMessage, myUserId: string): number {
  let score = 0
  score += msg.reactions * 2
  score += msg.replyCount * 1.5
  if (msg.text.includes(`<@${myUserId}>`)) score += 10
  if (msg.text.toLowerCase().includes('action item') || msg.text.toLowerCase().includes('todo')) score += 3
  if (msg.text.toLowerCase().includes('decision') || msg.text.toLowerCase().includes('decided')) score += 3
  if (msg.text.toLowerCase().includes('urgent') || msg.text.toLowerCase().includes('asap')) score += 5
  return score
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

export async function runDailySummary(onProgress: SkillProgressCallback): Promise<string> {
  const config = loadConfig()
  const myUserId = getCurrentUserId()

  onProgress('init', 'Starting daily summary…')

  // ── Step 1: Get channels ────────────────────────────────────────────────
  onProgress('channels', 'Fetching joined channels…')
  const allChannels = await listChannels()
  const channels = allChannels.slice(0, config.summaryChannelLimit)
  onProgress('channels', `Found ${channels.length} channels (limited to ${config.summaryChannelLimit})`)

  // ── Step 2: Fetch message history ───────────────────────────────────────
  const now = Date.now() / 1000
  const yesterday = now - 86400

  onProgress('messages', `Fetching messages from ${channels.length} channels…`)

  const channelMessages = await Promise.all(
    channels.map(async (ch: SlackChannel) => {
      try {
        const msgs = await getChannelHistory(ch.id, yesterday, now, 100)
        return { channel: ch, messages: msgs }
      } catch {
        return { channel: ch, messages: [] }
      }
    })
  )

  // ── Step 3: Fetch thread replies for active threads ─────────────────────
  onProgress('threads', 'Fetching active thread replies…')

  const withReplies = await Promise.all(
    channelMessages.map(async ({ channel, messages }) => {
      const parentMessages = messages.filter((m) => m.replyCount >= 2 && !m.isThread)
      const threadReplies = await Promise.all(
        parentMessages.slice(0, 5).map((m) => getThreadReplies(channel.id, m.ts, 10))
      )
      return { channel, messages, threadReplies: threadReplies.flat() }
    })
  )

  // ── Step 4: Resolve user IDs ────────────────────────────────────────────
  onProgress('users', 'Resolving user names…')

  const allUserIds = new Set<string>()
  for (const { messages } of withReplies) {
    for (const m of messages) allUserIds.add(m.userId)
  }
  const userProfiles = await getUserProfiles([...allUserIds])

  // ── Step 5: Score + build LLM input ────────────────────────────────────
  onProgress('scoring', 'Scoring messages by importance…')

  const channelBlocks: string[] = []
  let totalMessages = 0
  let totalThreads = 0

  for (const { channel, messages, threadReplies } of withReplies) {
    if (messages.length === 0) continue
    totalMessages += messages.length

    const scored = messages.map((m) => ({
      ...m,
      score: scoreMessage(m, myUserId),
      userDisplayName: userProfiles.get(m.userId)?.displayName ?? m.userId
    }))
    scored.sort((a, b) => b.score - a.score)

    const threads = messages.filter((m) => m.replyCount >= 2)
    totalThreads += threads.length

    const topMessages = scored.slice(0, 15)
    const msgLines = topMessages.map(
      (m) => `  [${m.userDisplayName}]: ${truncate(m.text)}`
    ).join('\n')

    const replyLines = threadReplies
      .slice(0, 10)
      .map((r) => `  [reply][${userProfiles.get(r.userId)?.displayName ?? r.userId}]: ${truncate(r.text, 150)}`)
      .join('\n')

    channelBlocks.push(
      `### #${channel.name} (${messages.length} messages)\n${msgLines}${replyLines ? '\nThread replies:\n' + replyLines : ''}`
    )
  }

  const activeChannels = withReplies.filter(({ messages }) => messages.length > 0)

  if (channelBlocks.length === 0) {
    onProgress('done', 'No channel activity in the past 24 hours.')
    const today = new Date()
    const fileDateStr = today.toISOString().slice(0, 10)
    const outPath = join(summariesDir(), `${fileDateStr}.html`)
    const html = renderHTML({
      userName: config.slackUserName || 'there',
      teamName: config.slackTeamName,
      dateStr: today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      timeStr: today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      provider: config.providerType ?? 'auto',
      totalMessages: 0,
      totalChannels: 0,
      totalThreads: 0,
      summaryData: { channels: [], topAttentionItems: [] }
    })
    writeFileSync(outPath, html)
    return outPath
  }

  // ── Step 6: LLM summarization ───────────────────────────────────────────
  onProgress('llm', 'Generating AI summary…')

  const systemPrompt = `You are a work assistant helping ${config.slackUserName || 'the user'} understand their Slack activity.
Be concise and action-oriented. Focus on decisions, action items, and important announcements.
Always respond with valid JSON.`

  const prompt = `Summarize the following Slack messages from the past 24 hours.
My user ID is <@${myUserId}>.

${channelBlocks.join('\n\n')}

Respond ONLY with this JSON structure (no markdown, no code blocks, just JSON):
{
  "channels": [
    {
      "name": "channel-name",
      "summary": "2-3 sentence summary of key activity",
      "actionItems": ["action item for me if any"],
      "skipped": false,
      "messageCount": 0,
      "threadCount": 0
    }
  ],
  "topAttentionItems": ["things that need my attention most urgently"]
}

Skip channels with no meaningful activity (set skipped: true, empty summary).
topAttentionItems should include direct @mentions, assigned action items, or urgent items.`

  let summaryData: LLMSummaryResponse
  try {
    const raw = await complete({ prompt, systemPrompt, maxTokens: 4096 })
    // Strip markdown code fences if the model added them
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    summaryData = JSON.parse(cleaned)
    auditLog({ skill: 'daily-slack-summary', provider: config.providerType ?? 'auto', status: 'ok' })
  } catch (err) {
    auditLog({
      skill: 'daily-slack-summary',
      provider: config.providerType ?? 'auto',
      status: 'error',
      detail: String(err)
    })
    throw new Error(`LLM summarization failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── Step 7: Render HTML ─────────────────────────────────────────────────
  onProgress('render', 'Rendering HTML report…')

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const timeStr = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const fileDateStr = today.toISOString().slice(0, 10)
  const html = renderHTML({
    userName: config.slackUserName || 'there',
    teamName: config.slackTeamName,
    dateStr,
    timeStr,
    provider: config.providerType ?? 'auto',
    totalMessages,
    totalChannels: activeChannels.length,
    totalThreads,
    summaryData
  })

  const outPath = join(summariesDir(), `${fileDateStr}.html`)
  writeFileSync(outPath, html)

  // ── Step 8: Deliver notification ────────────────────────────────────────
  onProgress('notify', 'Sending notification…')

  if (Notification.isSupported()) {
    const n = new Notification({
      title: '☀️ Your daily Slack summary is ready',
      body: `${activeChannels.length} channels · ${totalMessages} messages · ${summaryData.topAttentionItems.length} items need attention`
    })
    n.on('click', () => {
      require('electron').shell.openPath(outPath)
    })
    n.show()
  }

  onProgress('done', `Summary saved to ${outPath}`)
  return outPath
}

// ─── HTML renderer ───────────────────────────────────────────────────────────

function renderHTML(opts: {
  userName: string
  teamName: string
  dateStr: string
  timeStr: string
  provider: string
  totalMessages: number
  totalChannels: number
  totalThreads: number
  summaryData: LLMSummaryResponse
}): string {
  const { userName, teamName, dateStr, timeStr, provider, totalMessages, totalChannels, totalThreads, summaryData } = opts
  const providerLabel =
    provider === 'claude-code' ? 'Claude Code (claude.ai)' :
    provider === 'anthropic-api' ? 'Anthropic API' :
    provider === 'openai-api' ? 'OpenAI API' : 'AI'

  const attentionHTML = summaryData.topAttentionItems.length > 0
    ? `<div class="attention-box">
        <h2 class="section-title attention">★ Needs Your Attention</h2>
        <ul class="attention-list">
          ${summaryData.topAttentionItems.map((item) => `<li>${escHtml(item)}</li>`).join('\n          ')}
        </ul>
      </div>`
    : ''

  const channelsHTML = summaryData.channels
    .filter((ch) => !ch.skipped && ch.summary)
    .map(
      (ch) => `
      <div class="channel-card">
        <div class="channel-header">
          <span class="channel-name">#${escHtml(ch.name)}</span>
          <span class="channel-meta">${ch.messageCount} messages · ${ch.threadCount} threads</span>
        </div>
        <p class="channel-summary">${escHtml(ch.summary)}</p>
        ${ch.actionItems.length > 0
          ? `<div class="action-items">
              <span class="action-label">Action items:</span>
              <ul>${ch.actionItems.map((a) => `<li>${escHtml(a)}</li>`).join('')}</ul>
            </div>`
          : ''}
      </div>`
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Slack Summary · ${dateStr}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f4f5f7;
    color: #1a1d21;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }

  .header {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    padding: 28px 32px;
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,.06);
  }
  .header-greeting { font-size: 22px; font-weight: 700; color: #1a1d21; margin-bottom: 4px; }
  .header-meta { font-size: 13px; color: #616061; }
  .header-meta .dot { margin: 0 6px; }

  .attention-box {
    background: #fff8e1;
    border: 1px solid #ffe082;
    border-radius: 12px;
    padding: 20px 24px;
    margin-bottom: 20px;
  }
  .section-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: .06em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .section-title.attention { color: #b5730a; }
  .section-title.channels { color: #5b6470; }
  .attention-list { list-style: none; padding: 0; }
  .attention-list li {
    padding: 6px 0 6px 18px;
    position: relative;
    font-size: 14px;
    color: #3d2c00;
    border-bottom: 1px solid #ffe08255;
  }
  .attention-list li:last-child { border-bottom: none; }
  .attention-list li::before { content: '·'; position: absolute; left: 0; color: #f59e0b; font-weight: 900; }

  .channels-section { margin-bottom: 20px; }
  .channel-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 18px 22px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,.04);
  }
  .channel-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .channel-name { font-size: 15px; font-weight: 700; color: #1a1d21; }
  .channel-meta { font-size: 12px; color: #9ca3af; }
  .channel-summary { font-size: 14px; color: #374151; margin-bottom: 10px; }
  .action-items { background: #eff6ff; border-radius: 6px; padding: 10px 14px; }
  .action-label { font-size: 12px; font-weight: 600; color: #2563eb; text-transform: uppercase; letter-spacing: .04em; display: block; margin-bottom: 4px; }
  .action-items ul { list-style: none; padding: 0; }
  .action-items li { font-size: 13px; color: #1e40af; padding: 2px 0 2px 14px; position: relative; }
  .action-items li::before { content: '→'; position: absolute; left: 0; }

  .footer {
    text-align: center;
    font-size: 12px;
    color: #9ca3af;
    padding-top: 24px;
    border-top: 1px solid #e5e7eb;
    margin-top: 32px;
  }
  .footer .dot { margin: 0 5px; }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-greeting">Good morning, ${escHtml(userName)} 👋</div>
    <div class="header-meta">
      ${escHtml(dateStr)}
      <span class="dot">·</span>
      ${escHtml(teamName)} Slack Digest
      <span class="dot">·</span>
      Generated ${escHtml(timeStr)} via ${escHtml(providerLabel)}
    </div>
  </div>

  ${attentionHTML}

  <div class="channels-section">
    <h2 class="section-title channels">${totalChannels} Active Channels · ${totalMessages} Messages · ${totalThreads} Threads</h2>
    ${channelsHTML}
  </div>

  <div class="footer">
    <span>Open Coworker</span>
    <span class="dot">·</span>
    <span>${escHtml(providerLabel)}</span>
    <span class="dot">·</span>
    <span>${new Date().toISOString()}</span>
  </div>

</div>
</body>
</html>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
