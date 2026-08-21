import React, { useState, useEffect, useCallback } from 'react'
import type { ActionCandidate, LinearMember, CandidateReviewData, CreateResult } from '../App'

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-600',
  medium: 'bg-amber-100 text-amber-600',
  low: 'bg-gray-100 text-slate-500',
}

function CandidateRow({ candidate, members, onChange, onRemove }: {
  candidate: ActionCandidate
  members: LinearMember[]
  onChange: (patch: Partial<ActionCandidate>) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-white hover:border-violet-200 transition-colors">
      <div className="flex items-start gap-2">
        {/* Title */}
        <input
          value={candidate.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="flex-1 text-xs font-medium text-ink border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-violet-300 rounded px-1 py-0.5 min-w-0"
        />
        {/* Priority */}
        <select
          value={candidate.priority}
          onChange={(e) => onChange({ priority: e.target.value as ActionCandidate['priority'] })}
          className={`text-xs rounded px-1.5 py-0.5 border-0 cursor-pointer flex-none ${PRIORITY_COLORS[candidate.priority]}`}
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {/* Remove */}
        <button
          onClick={onRemove}
          className="text-slate-300 hover:text-red-400 text-sm flex-none transition-colors"
          title="Remove"
        >
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        {/* Source channel */}
        <span className="text-xs text-slate-400 bg-gray-50 rounded px-1.5 py-0.5 flex-none">
          #{candidate.channel}
        </span>
        {/* Assignee */}
        <select
          value={candidate.assigneeId}
          onChange={(e) => {
            const m = members.find((m) => m.id === e.target.value)
            onChange({ assigneeId: e.target.value, assigneeName: m?.displayName ?? m?.name ?? '' })
          }}
          className="flex-1 text-xs text-slate-600 border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-300 bg-white"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
          ))}
        </select>
      </div>

      {/* Description (collapsed by default, expand on click) */}
      {candidate.description && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{candidate.description}</p>
      )}
    </div>
  )
}

interface DashboardProps {
  onOpenPreferences: () => void
}

interface ProgressEvent {
  step: string
  message: string
}

export default function Dashboard({ onOpenPreferences }: DashboardProps): React.JSX.Element {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<ProgressEvent[]>([])
  const [lastOutput, setLastOutput] = useState<string | null>(null)
  const [error, setError] = useState('')
  type ActionPhase = 'idle' | 'generating' | 'review' | 'creating' | 'done'
  const [actionPhase, setActionPhase] = useState<ActionPhase>('idle')
  const [reviewData, setReviewData] = useState<CandidateReviewData | null>(null)
  const [candidates, setCandidates] = useState<ActionCandidate[]>([])
  const [createResult, setCreateResult] = useState<CreateResult | null>(null)
  const [actionError, setActionError] = useState('')

  const loadConfig = useCallback(async () => {
    const cfg = await window.api.getConfig()
    setConfig(cfg)
  }, [])

  useEffect(() => {
    loadConfig()

    const offProgress = window.api.on('skill:progress', (data) => {
      const { step, message } = data as ProgressEvent
      setProgress((prev) => [...prev, { step, message }])
    })
    const offComplete = window.api.on('skill:complete', (data) => {
      const { path } = data as { path: string }
      setRunning(false)
      setLastOutput(path)
      setError('')
      loadConfig()
    })
    const offError = window.api.on('skill:error', (data) => {
      const { message } = data as { message: string }
      setRunning(false)
      setError(message)
    })

    return () => {
      offProgress?.()
      offComplete?.()
      offError?.()
    }
  }, [loadConfig])

  async function handleRunNow(): Promise<void> {
    setRunning(true)
    setProgress([])
    setError('')
    setLastOutput(null)
    const result = await window.api.runSummary()
    if (!result.ok) {
      setRunning(false)
      setError(result.error ?? 'Unknown error')
    } else if (result.path) {
      setLastOutput(result.path)
      setRunning(false)
    }
  }

  async function handleGenerate(): Promise<void> {
    setActionPhase('generating')
    setActionError('')
    setProgress([])
    setReviewData(null)
    setCandidates([])
    setCreateResult(null)
    const res = await window.api.generateCandidates()
    if (!res.ok || !res.data) {
      setActionPhase('idle')
      setActionError(res.error ?? 'Generation failed')
      return
    }
    setReviewData(res.data)
    setCandidates(res.data.candidates.map((c) => ({ ...c })))
    setActionPhase('review')
  }

  async function handleCreate(): Promise<void> {
    if (!reviewData) return
    setActionPhase('creating')
    setProgress([])
    const selected = candidates.filter((c) => (c as ActionCandidate & { selected?: boolean }).selected !== false)
    const res = await window.api.createFromCandidates(selected, reviewData.teamId)
    if (!res.ok || !res.result) {
      setActionPhase('review')
      setActionError(res.error ?? 'Creation failed')
      return
    }
    setCreateResult(res.result)
    setActionPhase('done')
  }

  function updateCandidate(id: string, patch: Partial<ActionCandidate>): void {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c))
  }

  function removeCandidate(id: string): void {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  const slackUser = config.slackUserName as string
  const slackTeam = config.slackTeamName as string
  const providerType = config.providerType as string
  const summaryTime = config.summaryTime as string
  const lastDate = config.lastSummaryDate as string

  const providerLabel =
    providerType === 'claude-code' ? 'Claude Code' :
    providerType === 'anthropic-api' ? 'Anthropic API' :
    providerType ?? '—'

  return (
    <div className="px-8 py-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-bold text-ink">Open Coworker</h1>
          <p className="text-sm text-slate-400 mt-0.5">Daily Slack Summary · Phase 1 PoC</p>
        </div>
        <button
          onClick={onOpenPreferences}
          className="text-xs text-slate-400 hover:text-ink border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
        >
          ⚙ Preferences
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Slack</div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-400 flex-none" />
            <span className="text-sm font-semibold text-ink truncate">{slackTeam || '—'}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">@{slackUser || '—'}</div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">AI Model</div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-400 flex-none" />
            <span className="text-sm font-semibold text-ink">{providerLabel}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5">Daily at {summaryTime || '07:30'} weekdays</div>
        </div>
      </div>

      {/* Run button */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Daily Slack Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {lastDate ? `Last run: ${lastDate}` : 'Not run yet today'}
            </p>
          </div>
          <button
            onClick={handleRunNow}
            disabled={running}
            className="bg-signal text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {running ? (
              <>
                <span className="animate-spin text-base">⏳</span>
                Running…
              </>
            ) : (
              '▶ Run now'
            )}
          </button>
        </div>

        {/* Progress log */}
        {(running || progress.length > 0) && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
            {progress.map((p, i) => (
              <div key={i} className="text-xs text-slate-500 font-mono">
                <span className="text-slate-300">[{p.step}]</span> {p.message}
              </div>
            ))}
            {running && (
              <div className="text-xs text-blue-400 font-mono animate-pulse">
                processing…
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Output link */}
        {lastOutput && !running && !error && (
          <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <span className="text-green-600 text-sm">✅</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700">Summary ready!</p>
              <p className="text-xs text-green-600 font-mono truncate">{lastOutput}</p>
            </div>
            <button
              onClick={() => window.api.openOutput(lastOutput!)}
              className="text-xs bg-green-600 text-white rounded px-2.5 py-1 hover:bg-green-700 transition-colors flex-none"
            >
              Open
            </button>
          </div>
        )}
      </div>

      {/* Weekly Action Items → Linear */}
      {config.linearConnected && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Weekly Action Items → Linear</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {actionPhase === 'idle' && 'Scan 7 days of Slack · review candidates · create Linear tasks'}
                {actionPhase === 'generating' && 'Reading Slack and extracting action items…'}
                {actionPhase === 'review' && `${candidates.length} candidates — edit, remove, then create`}
                {actionPhase === 'creating' && 'Creating issues in Linear…'}
                {actionPhase === 'done' && `Done — ${createResult?.created.length ?? 0} tasks created`}
              </p>
            </div>
            {actionPhase === 'idle' && (
              <button
                onClick={handleGenerate}
                disabled={running}
                className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                Generate
              </button>
            )}
            {actionPhase === 'review' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActionPhase('idle'); setCandidates([]) }}
                  className="text-xs text-slate-400 hover:text-slate-600 border border-gray-200 rounded-lg px-3 py-2"
                >
                  Reset
                </button>
                <button
                  onClick={handleCreate}
                  disabled={candidates.length === 0}
                  className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Create {candidates.length} in Linear
                </button>
              </div>
            )}
            {actionPhase === 'done' && (
              <button
                onClick={() => { setActionPhase('idle'); setCreateResult(null) }}
                className="text-xs text-slate-400 hover:text-slate-600 border border-gray-200 rounded-lg px-3 py-2"
              >
                Reset
              </button>
            )}
          </div>

          {/* Progress log (generating / creating phases) */}
          {(actionPhase === 'generating' || actionPhase === 'creating') && (
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 max-h-36 overflow-y-auto mb-3">
              {progress.map((p, i) => (
                <div key={i} className="text-xs text-slate-500 font-mono">
                  <span className="text-slate-300">[{p.step}]</span> {p.message}
                </div>
              ))}
              <div className="text-xs text-violet-400 font-mono animate-pulse">processing…</div>
            </div>
          )}

          {/* Error */}
          {actionError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-600 mb-3">
              {actionError}
            </div>
          )}

          {/* Review table */}
          {actionPhase === 'review' && candidates.length > 0 && reviewData && (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {candidates.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  members={reviewData.members}
                  onChange={(patch) => updateCandidate(c.id, patch)}
                  onRemove={() => removeCandidate(c.id)}
                />
              ))}
            </div>
          )}

          {actionPhase === 'review' && candidates.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">
              No candidates remaining. Adjust Slack channels or try again.
            </p>
          )}

          {/* Done results */}
          {actionPhase === 'done' && createResult && (
            <div className="space-y-1.5">
              {createResult.created.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-violet-50 rounded-lg px-3 py-2">
                  <span className="font-mono text-violet-500 flex-none">{t.issue.identifier}</span>
                  <span className="flex-1 text-violet-800 truncate">{t.issue.title}</span>
                  <span className="text-slate-400 flex-none">{t.assigneeName}</span>
                  <a
                    href={t.issue.url}
                    onClick={(e) => { e.preventDefault(); window.api.openOutput(t.issue.url) }}
                    className="text-violet-500 hover:text-violet-700 flex-none"
                  >
                    ↗
                  </a>
                </div>
              ))}
              {createResult.failed.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-red-50 rounded-lg px-3 py-2">
                  <span className="text-red-500 flex-none">✗</span>
                  <span className="flex-1 text-red-700 truncate">{f.title}</span>
                  <span className="text-red-400 flex-none truncate max-w-32">{f.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">How it works</h3>
        <ol className="space-y-2 text-xs text-slate-500">
          {[
            'Fetches 24h of messages from your joined Slack channels',
            'Scores messages by reactions, replies, and @mentions',
            `Summarizes with ${providerLabel} — runs on your existing subscription`,
            'Delivers a styled HTML report + macOS notification'
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="w-4 h-4 rounded-full bg-gray-100 text-center flex-none font-semibold text-gray-400">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
