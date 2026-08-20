import React, { useState, useEffect } from 'react'

interface PreferencesProps {
  onBack: () => void
}

export default function Preferences({ onBack }: PreferencesProps): React.JSX.Element {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [summaryTime, setSummaryTime] = useState('07:30')
  const [channelLimit, setChannelLimit] = useState(20)
  const [schedulerEnabled, setSchedulerEnabled] = useState(true)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      setConfig(cfg)
      setSummaryTime((cfg.summaryTime as string) || '07:30')
      setChannelLimit((cfg.summaryChannelLimit as number) || 20)
      setSchedulerEnabled((cfg.schedulerEnabled as boolean) ?? true)
    })
  }, [])

  async function handleSave(): Promise<void> {
    setSaving(true)
    await window.api.updateConfig({
      summaryTime,
      summaryChannelLimit: channelLimit,
      schedulerEnabled
    })
    if (anthropicKey.trim()) {
      await window.api.setSecret('anthropicApiKey', anthropicKey.trim())
    }
    if (schedulerEnabled) {
      await window.api.startScheduler()
    } else {
      await window.api.stopScheduler()
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleDisconnectSlack(): Promise<void> {
    if (!confirm('Disconnect Slack? You will need to re-authorize to use this app.')) return
    await window.api.disconnectSlack()
    alert('Slack disconnected. Restart the app to reconnect.')
  }

  return (
    <div className="px-8 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack} className="text-slate-400 hover:text-ink text-sm">← Back</button>
        <h1 className="text-lg font-bold text-ink">Preferences</h1>
      </div>

      <div className="space-y-4">

        {/* Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-semibold text-ink">Automation</h2>

          <label className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Enable daily scheduler</span>
            <button
              onClick={() => setSchedulerEnabled(!schedulerEnabled)}
              className={`relative w-10 h-6 rounded-full transition-colors ${schedulerEnabled ? 'bg-signal' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${schedulerEnabled ? 'left-5' : 'left-1'}`} />
            </button>
          </label>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Run time (weekdays)</label>
            <input
              type="time"
              value={summaryTime}
              onChange={(e) => setSummaryTime(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">
              Channel limit: <strong>{channelLimit}</strong>
            </label>
            <input
              type="range"
              min={5} max={50} step={5}
              value={channelLimit}
              onChange={(e) => setChannelLimit(Number(e.target.value))}
              className="w-full accent-signal"
            />
            <div className="flex justify-between text-xs text-slate-300 mt-0.5">
              <span>5</span><span>50 channels</span>
            </div>
          </div>
        </div>

        {/* Slack connection */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">Slack</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600">{(config.slackTeamName as string) || '—'}</p>
              <p className="text-xs text-slate-400">@{(config.slackUserName as string) || '—'}</p>
            </div>
            <button
              onClick={handleDisconnectSlack}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* AI provider */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold text-ink">AI Model</h2>
          <div className="text-sm text-slate-500">
            Active: <strong>{(config.providerType as string) ?? '—'}</strong>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1">Update Anthropic API Key</label>
            <input
              type="password"
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-… (leave blank to keep current)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-signal"
            />
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-signal text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  )
}
