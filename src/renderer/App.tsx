import React, { useEffect, useState } from 'react'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Preferences from './pages/Preferences'

type Page = 'onboarding' | 'dashboard' | 'preferences'

declare global {
  interface Window {
    api: {
      getConfig: () => Promise<Record<string, unknown>>
      updateConfig: (patch: Record<string, unknown>) => Promise<void>
      secretsStatus: () => Promise<Record<string, boolean>>
      setSecret: (key: string, value: string) => Promise<{ ok: boolean }>
      detectProviders: () => Promise<Array<{ type: string; label: string; available: boolean; detail?: string }>>
      setProvider: (type: string) => Promise<{ ok: boolean }>
      testProvider: () => Promise<{ ok: boolean; response?: string; error?: string }>
      connectSlack: (token?: string) => Promise<{ ok: boolean; config?: Record<string, unknown>; error?: string }>
      disconnectSlack: () => Promise<{ ok: boolean }>
      runSummary: () => Promise<{ ok: boolean; path?: string; error?: string }>
      openOutput: (path: string) => Promise<void>
      startScheduler: () => Promise<{ ok: boolean }>
      stopScheduler: () => Promise<{ ok: boolean }>
      on: (channel: string, cb: (...args: unknown[]) => void) => (() => void) | undefined
    }
  }
}

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('onboarding')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      const isSetup = cfg.providerType && cfg.slackConnected
      setPage(isSetup ? 'dashboard' : 'onboarding')
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* macOS titlebar drag area */}
      <div className="titlebar-drag flex-none" />

      <div className="flex-1 overflow-y-auto">
        {page === 'onboarding' && (
          <Onboarding onComplete={() => setPage('dashboard')} />
        )}
        {page === 'dashboard' && (
          <Dashboard onOpenPreferences={() => setPage('preferences')} />
        )}
        {page === 'preferences' && (
          <Preferences onBack={() => setPage('dashboard')} />
        )}
      </div>
    </div>
  )
}
