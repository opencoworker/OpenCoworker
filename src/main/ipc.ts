import { ipcMain, shell } from 'electron'
import { loadConfig, updateConfig, setSecret, secretsPresent } from './gateway'
import { complete } from './providers/router'
import { detectProviders } from './providers/router'
import { connectWithToken, connectViaOAuthRelay, disconnectSlack, resetClient } from './connectors/slack'
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

  // Wire scheduler callbacks → renderer events
  setSchedulerCallbacks(
    (step, msg) => emit('skill:progress', { step, message: msg }),
    (path) => emit('skill:complete', { path }),
    (msg) => emit('skill:error', { message: msg })
  )
}
