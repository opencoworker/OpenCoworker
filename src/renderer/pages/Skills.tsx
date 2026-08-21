import React, { useState, useEffect, useCallback } from 'react'
import type { Skill, SkillMeta } from '../App'

type ExportFormat = 'claude-code' | 'chatgpt' | 'raw'

const FORMAT_LABELS: Record<ExportFormat, string> = {
  'claude-code': 'Claude Code (SKILL.md)',
  'chatgpt': 'ChatGPT / Generic',
  'raw': 'Raw Markdown',
}

const FORMAT_HINTS: Record<ExportFormat, string> = {
  'claude-code': 'Drop into .claude/skills/<name>/SKILL.md in any project',
  'chatgpt': 'Paste into ChatGPT custom instructions or system prompt',
  'raw': 'Full file content with frontmatter',
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── List view ────────────────────────────────────────────────────────────────

function SkillCard({ skill, selected, onClick }: {
  skill: SkillMeta
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all
        ${selected
          ? 'border-signal bg-signal/5 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-ink truncate">{skill.name}</span>
            {skill.builtIn && (
              <span className="text-xs bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 flex-none">built-in</span>
            )}
          </div>
          <p className="text-xs text-slate-400 line-clamp-2">{skill.description}</p>
        </div>
        <span className={`text-base flex-none mt-0.5 ${selected ? 'text-signal' : 'text-slate-300'}`}>›</span>
      </div>
      {skill.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {skill.tags.map((t) => (
            <span key={t} className="text-xs bg-gray-100 text-slate-500 rounded px-1.5 py-0.5">{t}</span>
          ))}
        </div>
      )}
    </button>
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function SkillEditor({ skillId, onSaved, onDeleted, onClose }: {
  skillId: string | '__new__'
  onSaved: () => void
  onDeleted: () => void
  onClose: () => void
}): React.JSX.Element {
  const isNew = skillId === '__new__'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [body, setBody] = useState('')
  const [builtIn, setBuiltIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copyFormat, setCopyFormat] = useState<ExportFormat>('claude-code')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isNew) {
      setName('')
      setDescription('')
      setTagsInput('')
      setBody(NEW_SKILL_TEMPLATE)
      setBuiltIn(false)
      return
    }
    window.api.getSkill(skillId).then((skill: Skill | null) => {
      if (!skill) return
      setName(skill.name)
      setDescription(skill.description)
      setTagsInput(skill.tags.join(', '))
      setBody(skill.body)
      setBuiltIn(skill.builtIn)
    })
  }, [skillId, isNew])

  async function handleSave(): Promise<void> {
    const id = isNew ? slugify(name) || `skill-${Date.now()}` : skillId
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
    const now = today()
    setSaving(true)
    await window.api.saveSkill(id, {
      name, description, tags,
      created: now, updated: now, builtIn
    }, body)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSaved()
  }

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await window.api.deleteSkill(skillId)
    onDeleted()
  }

  async function handleCopy(): Promise<void> {
    const text = await window.api.exportSkill(
      isNew ? '' : skillId,
      copyFormat
    )
    if (!text) {
      // For unsaved new skills, build the export locally
      const body_export = copyFormat === 'chatgpt'
        ? `# ${name}\n\n${description ? description + '\n\n' : ''}${body}`
        : buildRawLocally()
      await navigator.clipboard.writeText(body_export)
    } else {
      await navigator.clipboard.writeText(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function buildRawLocally(): string {
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean).join(', ')
    const now = today()
    return [
      '---',
      `name: ${name}`,
      `description: ${description}`,
      `tags: ${tags}`,
      `created: ${now}`,
      `updated: ${now}`,
      `builtIn: ${builtIn}`,
      '---',
      '',
      body
    ].join('\n')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Editor header */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onClose} className="text-slate-400 hover:text-ink text-sm flex-none">←</button>
        <h2 className="text-sm font-semibold text-ink flex-1 truncate">
          {isNew ? 'New skill' : name}
        </h2>
        {!isNew && !builtIn && (
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 flex-none"
          >
            Delete
          </button>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-2 mb-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Skill name"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One-line description"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Tags (comma-separated): slack, summary, daily"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>

      {/* Body editor */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="flex-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-signal leading-relaxed"
        placeholder="Write your skill instructions in Markdown…"
        spellCheck={false}
      />

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-3">
        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save'}
        </button>

        {/* Export / Copy */}
        <div className="flex-1 flex items-center gap-1.5 justify-end">
          <div className="relative">
            <select
              value={copyFormat}
              onChange={(e) => setCopyFormat(e.target.value as ExportFormat)}
              className="appearance-none border border-gray-200 rounded-lg pl-2.5 pr-6 py-2 text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-signal bg-white cursor-pointer"
            >
              {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((f) => (
                <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▾</span>
          </div>
          <button
            onClick={handleCopy}
            className="border border-gray-200 rounded-lg px-3 py-2 text-xs text-slate-600 hover:bg-gray-50 transition-colors"
            title={FORMAT_HINTS[copyFormat]}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Format hint */}
      <p className="text-xs text-slate-300 mt-1.5 text-right">{FORMAT_HINTS[copyFormat]}</p>
    </div>
  )
}

// ─── Main Skills page ─────────────────────────────────────────────────────────

export default function Skills(): React.JSX.Element {
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const loadSkills = useCallback(async () => {
    const list = await window.api.listSkills()
    setSkills(list)
  }, [])

  useEffect(() => { loadSkills() }, [loadSkills])

  const filtered = skills.filter((s) => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.tags.some((t) => t.includes(q))
  })

  function handleNewSkill(): void {
    setSelected('__new__')
  }

  function handleSaved(): void {
    loadSkills()
    // If we just saved a new skill, stay on it but reload
  }

  function handleDeleted(): void {
    setSelected(null)
    loadSkills()
  }

  // Editor view
  if (selected) {
    return (
      <div className="px-6 py-5 h-full flex flex-col" style={{ minHeight: 0 }}>
        <SkillEditor
          skillId={selected}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          onClose={() => setSelected(null)}
        />
      </div>
    )
  }

  // List view
  return (
    <div className="px-6 py-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-ink">Skills</h1>
          <p className="text-xs text-slate-400 mt-0.5">Reusable AI instructions — export to Claude Code, ChatGPT, and more</p>
        </div>
        <button
          onClick={handleNewSkill}
          className="bg-signal text-white rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          + New skill
        </button>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search skills…"
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-signal"
      />

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-300 text-sm">
          {search ? 'No skills match your search.' : 'No skills yet — create one!'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              selected={false}
              onClick={() => setSelected(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── New skill template ───────────────────────────────────────────────────────

const NEW_SKILL_TEMPLATE = `## Purpose
Describe what this skill does and when to use it.

## Trigger
When should this skill run? Manual, scheduled, or event-driven?

## Process
1. Step one
2. Step two
3. Step three

## System Prompt
You are a helpful assistant that...

## Output
Describe the expected output format.
`
