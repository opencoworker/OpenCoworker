import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const SKILLS_DIR = join(app.getPath('home'), '.workbench', 'skills')

function ensureDir(): void {
  if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true })
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SkillMeta {
  id: string
  name: string
  description: string
  tags: string[]
  created: string
  updated: string
  builtIn: boolean
}

export interface Skill extends SkillMeta {
  body: string   // markdown body (without frontmatter)
  raw: string    // full file content
}

// ─── Frontmatter parser/serializer ───────────────────────────────────────────

function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }

  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '')
    meta[key] = val
  }
  return { meta, body: match[2].trimStart() }
}

function buildFrontmatter(meta: Omit<SkillMeta, 'id'>, body: string): string {
  const tags = Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags ?? '')
  return [
    '---',
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    `tags: ${tags}`,
    `created: ${meta.created}`,
    `updated: ${meta.updated}`,
    `builtIn: ${meta.builtIn}`,
    '---',
    '',
    body
  ].join('\n')
}

function fileToSkill(id: string, content: string): Skill {
  const { meta, body } = parseFrontmatter(content)
  return {
    id,
    name: meta.name ?? id,
    description: meta.description ?? '',
    tags: (meta.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    created: meta.created ?? '',
    updated: meta.updated ?? '',
    builtIn: meta.builtIn === 'true',
    body,
    raw: content
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function listSkills(): SkillMeta[] {
  ensureDir()
  return readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const id = f.replace(/\.md$/, '')
      try {
        const content = readFileSync(join(SKILLS_DIR, f), 'utf-8')
        const s = fileToSkill(id, content)
        return { id: s.id, name: s.name, description: s.description, tags: s.tags, created: s.created, updated: s.updated, builtIn: s.builtIn }
      } catch {
        return null
      }
    })
    .filter((s): s is SkillMeta => s !== null)
    .sort((a, b) => (b.updated || b.created).localeCompare(a.updated || a.created))
}

export function getSkill(id: string): Skill | null {
  ensureDir()
  const path = join(SKILLS_DIR, `${id}.md`)
  if (!existsSync(path)) return null
  return fileToSkill(id, readFileSync(path, 'utf-8'))
}

export function saveSkill(id: string, meta: Omit<SkillMeta, 'id'>, body: string): Skill {
  ensureDir()
  const content = buildFrontmatter(meta, body)
  writeFileSync(join(SKILLS_DIR, `${id}.md`), content, 'utf-8')
  return fileToSkill(id, content)
}

export function deleteSkill(id: string): void {
  const path = join(SKILLS_DIR, `${id}.md`)
  if (existsSync(path)) unlinkSync(path)
}

// ─── Export formatters ────────────────────────────────────────────────────────

export function exportForClaudeCode(skill: Skill): string {
  // Full SKILL.md format — drop into .claude/skills/<id>/SKILL.md
  return skill.raw
}

export function exportForChatGPT(skill: Skill): string {
  // ChatGPT custom instructions: plain markdown, no frontmatter
  return `# ${skill.name}\n\n${skill.description ? skill.description + '\n\n' : ''}${skill.body}`
}

export function exportRaw(skill: Skill): string {
  return skill.raw
}

// ─── Seed built-in skills ────────────────────────────────────────────────────
// Called once on startup to ensure built-in skills exist as editable files.

const BUILTIN_SKILLS: Array<{ id: string; meta: Omit<SkillMeta, 'id'>; body: string }> = [
  {
    id: 'daily-slack-summary',
    meta: {
      name: 'Daily Slack Summary',
      description: 'Summarize 24h of Slack activity into a styled HTML digest delivered via macOS notification',
      tags: ['slack', 'summary', 'daily', 'automation'],
      created: '2026-08-01',
      updated: '2026-08-01',
      builtIn: true
    },
    body: `## Purpose
Summarize a day's worth of Slack activity across all joined channels into a scannable HTML report, then deliver it as a macOS notification.

## Trigger
Runs automatically at a scheduled time (default 07:30 weekdays) or manually from the dashboard.

## Process
1. Fetch messages from all joined channels for the past 24 hours
2. Score messages by reactions, replies, and @mentions — surface the most important ones
3. Fetch thread replies for threads with 2+ replies
4. Send to the configured LLM with a structured JSON extraction prompt
5. Render extracted data to a styled HTML report
6. Deliver a macOS notification linking to the report

## System Prompt
You are a work assistant helping {userName} understand their Slack activity.
Be concise and action-oriented. Focus on decisions, action items, and important announcements.
Always respond with valid JSON.

## Output Schema
\`\`\`json
{
  "channels": [
    {
      "name": "channel-name",
      "summary": "2-3 sentence summary",
      "actionItems": ["things the user needs to do"],
      "skipped": false,
      "messageCount": 0,
      "threadCount": 0
    }
  ],
  "topAttentionItems": ["urgent items needing attention"]
}
\`\`\`

## Output
Styled HTML saved to \`~/.workbench/summaries/YYYY-MM-DD.html\`, opened via macOS notification click.
`
  },
  {
    id: 'weekly-action-items',
    meta: {
      name: 'Weekly Action Items → Linear',
      description: 'Scan 7 days of Slack for action items, extract with AI, and create Linear issues assigned to members',
      tags: ['slack', 'linear', 'weekly', 'tasks', 'automation'],
      created: '2026-08-21',
      updated: '2026-08-21',
      builtIn: true
    },
    body: `## Purpose
Read a week of Slack conversations, extract concrete action items using an LLM, and create Linear issues for each one — assigned to the right team member.

## Trigger
Run manually from the dashboard (requires both Slack and Linear connected).

## Process
1. Fetch 7 days of messages from all joined Slack channels (up to the configured channel limit)
2. Fetch thread replies for active threads (2+ replies)
3. Resolve Slack user IDs to display names
4. Send to the configured LLM with a structured extraction prompt
5. Fuzzy-match extracted assignee names against Linear workspace members
6. Create a Linear issue for each action item, assigning where a member match is found

## System Prompt
You are a project management assistant analyzing Slack conversations.
Extract concrete, actionable tasks — things someone needs to DO, not discussion points.
Only extract clear commitments, assigned work, or decisions requiring follow-up.
Always respond with valid JSON, no markdown fences.

## Extraction Prompt Rules
- Only include items with a clear next-action verb (review, create, send, fix, schedule, etc.)
- Skip vague statements ("we should improve X")
- Skip items already marked done
- Max 20 action items per run

## Output Schema
\`\`\`json
{
  "actionItems": [
    {
      "title": "Short verb+object title, max 80 chars",
      "description": "Context from the conversation",
      "assignee": "Person's name (empty if not clear)",
      "channel": "source-channel-name",
      "priority": "high | medium | low"
    }
  ]
}
\`\`\`

## Linear Issue Format
- **Title**: extracted title
- **Description**: context + source channel + priority
- **Assignee**: matched Linear member (unassigned if no match)
- **Team**: first team in the Linear workspace (configurable in future)

## Member Matching
Fuzzy match by normalized name: exact → substring. Unmatched items are still created as unassigned and reported in the result summary.
`
  }
]

export function seedBuiltins(): void {
  ensureDir()
  for (const { id, meta, body } of BUILTIN_SKILLS) {
    const path = join(SKILLS_DIR, `${id}.md`)
    if (!existsSync(path)) {
      writeFileSync(path, buildFrontmatter(meta, body), 'utf-8')
    }
  }
}
