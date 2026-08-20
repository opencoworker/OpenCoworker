import React, { useState, useEffect } from 'react'

type Step = 'welcome' | 'provider' | 'slack' | 'done'

interface OnboardingProps {
  onComplete: () => void
}

export default function Onboarding({ onComplete }: OnboardingProps): React.JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [providers, setProviders] = useState<Array<{ type: string; label: string; available: boolean; detail?: string }>>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (step === 'provider') {
      setLoading(true)
      window.api.detectProviders().then((p) => {
        setProviders(p)
        const avail = p.find((x) => x.available)
        if (avail) setSelectedProvider(avail.type)
        setLoading(false)
      })
    }
  }, [step])

  async function handleProviderNext(): Promise<void> {
    setError('')
    if (!selectedProvider) { setError('Select a provider.'); return }

    setLoading(true)
    if (selectedProvider === 'anthropic-api' && apiKey) {
      await window.api.setSecret('anthropicApiKey', apiKey)
    }
    await window.api.setProvider(selectedProvider)

    setStatus('Testing provider…')
    const test = await window.api.testProvider()
    setLoading(false)
    if (!test.ok) {
      setError(`Provider test failed: ${test.error}`)
      return
    }
    setStep('slack')
  }

  const [slackToken, setSlackToken] = useState('')
  const [slackAuthMode, setSlackAuthMode] = useState<'token' | 'oauth-relay'>('token')

  useEffect(() => {
    if (step === 'slack') {
      window.api.getConfig().then((cfg) => {
        setSlackAuthMode((cfg.slackAuthMode as 'token' | 'oauth-relay') ?? 'token')
      })
    }
  }, [step])

  async function handleSlackConnect(): Promise<void> {
    setError('')
    if (slackAuthMode === 'token' && !slackToken.trim()) {
      setError('Paste your Slack OAuth token.')
      return
    }
    setLoading(true)
    setStatus(slackAuthMode === 'oauth-relay' ? 'Waiting for browser authorization…' : 'Validating token…')
    const result = await window.api.connectSlack(slackAuthMode === 'token' ? slackToken.trim() : undefined)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Slack connection failed')
      return
    }
    setStep('done')
  }

  async function handleFinish(): Promise<void> {
    await window.api.updateConfig({ schedulerEnabled: true })
    await window.api.startScheduler()
    onComplete()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-full px-8 py-12 -mt-12">
      <div className="w-full max-w-md">

        {/* Logo / wordmark */}
        <div className="text-center mb-10">
          <div className="text-2xl font-bold text-ink tracking-tight">Open Coworker</div>
          <div className="text-sm text-slate-400 mt-1">Model-neutral AI work platform</div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'provider', 'slack', 'done'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-semibold transition-colors
                ${step === s ? 'bg-signal text-white' : i < (['welcome','provider','slack','done'] as Step[]).indexOf(step) ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                {i < (['welcome','provider','slack','done'] as Step[]).indexOf(step) ? '✓' : i + 1}
              </div>
              {i < 3 && <div className="w-8 h-px bg-gray-200" />}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">

          {step === 'welcome' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">👋</div>
              <h1 className="text-xl font-semibold text-ink">Welcome to Open Coworker</h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Connect your Slack workspace and an AI model to get a beautiful HTML digest of your Slack activity every morning.
              </p>
              <p className="text-xs text-slate-400 bg-gray-50 rounded-lg p-3">
                Phase 1 PoC — Slack Daily Summary
              </p>
              <button
                onClick={() => setStep('provider')}
                className="w-full mt-4 bg-signal text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Get started →
              </button>
            </div>
          )}

          {step === 'provider' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">Set up AI model</h2>
                <p className="text-sm text-slate-400 mt-1">Choose how Open Coworker runs AI tasks.</p>
              </div>

              {loading && !providers.length ? (
                <div className="text-sm text-slate-400 py-4 text-center">Detecting providers…</div>
              ) : (
                <div className="space-y-2">
                  {providers.filter(p => p.type !== 'openai-api').map((p) => (
                    <label key={p.type}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                        ${selectedProvider === p.type ? 'border-signal bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input
                        type="radio"
                        name="provider"
                        value={p.type}
                        checked={selectedProvider === p.type}
                        onChange={() => setSelectedProvider(p.type)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink">{p.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{p.detail}</div>
                        {p.available ? (
                          <span className="inline-block text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5 mt-1">Available</span>
                        ) : p.type === 'claude-code' ? (
                          <span className="inline-block text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 mt-1">Run `claude login` if not yet logged in</span>
                        ) : null}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {selectedProvider === 'anthropic-api' && (
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Anthropic API Key</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <p className="text-xs text-slate-400 mt-1">Stored encrypted in macOS Keychain.</p>
                </div>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
              {status && !error && <p className="text-xs text-blue-500">{status}</p>}

              <button
                onClick={handleProviderNext}
                disabled={loading}
                className="w-full bg-signal text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? 'Testing…' : 'Continue →'}
              </button>
            </div>
          )}

          {step === 'slack' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-ink">Connect Slack</h2>
                <p className="text-sm text-slate-400 mt-1">Paste your Slack OAuth token to connect your workspace.</p>
              </div>

              {slackAuthMode === 'token' ? (
                <>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-xs text-slate-600">
                    <p className="font-semibold text-slate-700">How to get your token:</p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-500">
                      <li>Go to <span className="font-mono bg-white px-1 rounded border border-gray-200">api.slack.com/apps</span> → your app → <strong>OAuth &amp; Permissions</strong></li>
                      <li>Under <strong>OAuth Tokens</strong>, click <strong>Install to Workspace</strong> if not done yet</li>
                      <li>Copy the <strong>Bot User OAuth Token</strong> (starts with <span className="font-mono">xoxb-</span>)</li>
                    </ol>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 block mb-1">Bot OAuth Token</label>
                    <input
                      type="password"
                      value={slackToken}
                      onChange={(e) => setSlackToken(e.target.value)}
                      placeholder="xoxb-…"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-signal"
                    />
                    <p className="text-xs text-slate-400 mt-1">Stored encrypted in macOS Keychain.</p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-6 gap-3 text-center">
                  <p className="text-sm text-slate-500">Your browser will open for a one-time sign-in.</p>
                  <p className="text-xs text-slate-400">Open Coworker never posts messages or modifies your workspace.</p>
                </div>
              )}

              {error && <p className="text-xs text-red-500">{error}</p>}
              {status && !error && <p className="text-xs text-blue-500">{status}</p>}

              <button
                onClick={handleSlackConnect}
                disabled={loading}
                className="w-full bg-[#4A154B] text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading
                  ? (slackAuthMode === 'oauth-relay' ? 'Waiting for browser…' : 'Validating…')
                  : (slackAuthMode === 'oauth-relay' ? 'Sign in with Slack →' : 'Connect Slack →')}
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="text-4xl">🎉</div>
              <h2 className="text-xl font-semibold text-ink">You're all set!</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Open Coworker is connected to your Slack workspace. A daily summary will be generated each weekday morning at 7:30 AM.
              </p>
              <button
                onClick={handleFinish}
                className="w-full mt-4 bg-signal text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Open Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
