import React, { useEffect, useState } from 'react'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Preferences from './pages/Preferences'
import Skills from './pages/Skills'

type Page = 'onboarding' | 'dashboard' | 'skills' | 'preferences'

export interface ActionCandidate {
  id: string
  title: string
  description: string
  assigneeId: string
  assigneeName: string
  channel: string
  priority: 'high' | 'medium' | 'low'
}

export interface LinearMember {
  id: string
  name: string
  displayName: string
  email: string
}

export interface CandidateReviewData {
  candidates: ActionCandidate[]
  members: LinearMember[]
  teamId: string
  teamName: string
}

export interface CreatedTask {
  issue: { id: string; identifier: string; url: string; title: string }
  assigneeName: string
  channel: string
}

export interface CreateResult {
  created: CreatedTask[]
  failed: Array<{ title: string; error: string }>
}

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
  body: string
  raw: string
}

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
      connectLinear: (apiKey: string) => Promise<{ ok: boolean; config?: Record<string, unknown>; error?: string }>
      disconnectLinear: () => Promise<{ ok: boolean }>
      generateCandidates: () => Promise<{ ok: boolean; data?: CandidateReviewData; error?: string }>
      createFromCandidates: (candidates: ActionCandidate[], teamId: string) => Promise<{ ok: boolean; result?: CreateResult; error?: string }>
      runSummary: () => Promise<{ ok: boolean; path?: string; error?: string }>
      listSkills: () => Promise<SkillMeta[]>
      getSkill: (id: string) => Promise<Skill | null>
      saveSkill: (id: string, meta: Record<string, unknown>, body: string) => Promise<Skill>
      deleteSkill: (id: string) => Promise<{ ok: boolean }>
      exportSkill: (id: string, format: string) => Promise<string | null>
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

  const showNav = page !== 'onboarding'

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
        {page === 'skills' && (
          <Skills />
        )}
        {page === 'preferences' && (
          <Preferences onBack={() => setPage('dashboard')} />
        )}
      </div>

      {/* Bottom tab nav (shown after onboarding) */}
      {showNav && page !== 'preferences' && (
        <div className="flex-none border-t border-gray-100 bg-white flex">
          {([
            { key: 'dashboard', label: 'Dashboard', icon: '⊞' },
            { key: 'skills', label: 'Skills', icon: '⚡' },
          ] as { key: Page; label: string; icon: string }[]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setPage(key)}
              className={`flex-1 py-2.5 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors
                ${page === key ? 'text-signal' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </button>
          ))}
          <button
            onClick={() => setPage('preferences')}
            className="flex-1 py-2.5 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors text-slate-400 hover:text-slate-600"
          >
            <span className="text-base leading-none">⚙</span>
            Settings
          </button>
        </div>
      )}
    </div>
  )
}
