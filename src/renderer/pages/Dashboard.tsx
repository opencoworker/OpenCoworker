import React, { useState, useEffect, useCallback } from 'react'

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
