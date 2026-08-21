import { ipcMain, shell } from 'electron'
import { loadConfig, updateConfig, setSecret, secretsPresent } from './gateway'
import { complete } from './providers/router'
import { detectProviders } from './providers/router'
import { connectWithToken, connectViaOAuthRelay, disconnectSlack, resetClient } from './connectors/slack'
import { connectWithApiKey as connectLinearWithApiKey, disconnectLinear } from './connectors/linear'
import { generateCandidates, createFromCandidates, ActionCandidate } from './skills/weekly-action-items'
import { listSkills, getSkill, saveSkill, deleteSkill, exportForClaudeCode, exportForChatGPT, exportRaw } from './skills/manager'
import { triggerSummary, startScheduler, stopScheduler, setSchedulerCallbacks } from './scheduler'

type EventEmitter = (event: string, ...args: unknown[]) => void

export function registerIpcHandlers(emit: EventEmitter): void {

  // Config
  ipcMain.handle('config:get', () => loadConfig())
  ipcMain.handle('config:update', (_e, patch) => updateConfig(patch))

  // Secrets presence (never send the actual values to renderer)
  ipcMain.handle('secrets:status', () => secretsPresent())

  // Store a secret
  ipcMain.handle('secrets:set', (_e, key: string, value: string) => {
    setSecret(key as never, value)
    return { ok: true }
  })

  // Provider detection
  ipcMain.handle('provider:detect', async () => detectProviders())

  // Set active provider
  ipcMain.handle('provider:set', (_e, type: string) => {
    updateConfig({ providerType: type as never })
    return { ok: true }
  })

  // Test LLM provider
  ipcMain.handle('provider:test', async () => {
    try {
      const result = await complete({ prompt: 'Reply with exactly: OK', maxTokens: 10 })
      return { ok: true, response: result.trim() }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Slack connect — routes to token paste or OAuth relay based on config
  ipcMain.handle('slack:connect', async (_e, token?: string) => {
    try {
      if (token) {
        await connectWithToken(token)
      } else {
        const cfg = loadConfig()
        if (cfg.slackAuthMode !== 'oauth-relay' || !cfg.oauthRelayUrl) {
          throw new Error('OAuth relay not configured. Set slackAuthMode and oauthRelayUrl in config.')
        }
        await connectViaOAuthRelay(cfg.oauthRelayUrl)
      }
      return { ok: true, config: loadConfig() }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('slack:disconnect', () => {
    disconnectSlack()
    resetClient()
    return { ok: true }
  })

  // Linear connector
  ipcMain.handle('linear:connect', async (_e, apiKey: string) => {
    try {
      await connectLinearWithApiKey(apiKey)
      return { ok: true, config: loadConfig() }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('linear:disconnect', () => {
    disconnectLinear()
    return { ok: true }
  })

  ipcMain.handle('linear:generate-candidates', async () => {
    try {
      const data = await generateCandidates(
        (step, msg) => emit('skill:progress', { step, message: msg })
      )
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('linear:create-from-candidates', async (_e, candidates: ActionCandidate[], teamId: string) => {
    try {
      const result = await createFromCandidates(
        candidates,
        teamId,
        (step, msg) => emit('skill:progress', { step, message: msg })
      )
      return { ok: true, result }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Run skill manually
  ipcMain.handle('skill:run', async () => {
    try {
      const path = await triggerSummary()
      return { ok: true, path }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Open last summary
  ipcMain.handle('skill:open-output', (_e, filePath: string) => {
    shell.openPath(filePath)
  })

  // Scheduler controls
  ipcMain.handle('scheduler:start', () => {
    startScheduler()
    return { ok: true }
  })
  ipcMain.handle('scheduler:stop', () => {
    stopScheduler()
    return { ok: true }
  })

  // Skills management
  ipcMain.handle('skills:list', () => listSkills())
  ipcMain.handle('skills:get', (_e, id: string) => getSkill(id))
  ipcMain.handle('skills:save', (_e, id: string, meta: Parameters<typeof saveSkill>[1], body: string) => {
    return saveSkill(id, meta, body)
  })
  ipcMain.handle('skills:delete', (_e, id: string) => { deleteSkill(id); return { ok: true } })
  ipcMain.handle('skills:export', (_e, id: string, format: 'claude-code' | 'chatgpt' | 'raw') => {
    const skill = getSkill(id)
    if (!skill) return null
    if (format === 'claude-code') return exportForClaudeCode(skill)
    if (format === 'chatgpt') return exportForChatGPT(skill)
    return exportRaw(skill)
  })

  // Wire scheduler callbacks → renderer events
  setSchedulerCallbacks(
    (step, msg) => emit('skill:progress', { step, message: msg }),
    (path) => emit('skill:complete', { path }),
    (msg) => emit('skill:error', { message: msg })
  )
}
