import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch: Record<string, unknown>) => ipcRenderer.invoke('config:update', patch),

  // Secrets
  secretsStatus: () => ipcRenderer.invoke('secrets:status'),
  setSecret: (key: string, value: string) => ipcRenderer.invoke('secrets:set', key, value),

  // Providers
  detectProviders: () => ipcRenderer.invoke('provider:detect'),
  setProvider: (type: string) => ipcRenderer.invoke('provider:set', type),
  testProvider: () => ipcRenderer.invoke('provider:test'),

  // Slack
  connectSlack: (token?: string) => ipcRenderer.invoke('slack:connect', token),
  disconnectSlack: () => ipcRenderer.invoke('slack:disconnect'),

  // Skill
  runSummary: () => ipcRenderer.invoke('skill:run'),
  openOutput: (path: string) => ipcRenderer.invoke('skill:open-output', path),

  // Scheduler
  startScheduler: () => ipcRenderer.invoke('scheduler:start'),
  stopScheduler: () => ipcRenderer.invoke('scheduler:stop'),

  // Events (main → renderer)
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const allowed = ['skill:progress', 'skill:complete', 'skill:error', 'status:update']
    if (!allowed.includes(channel)) return
    const handler = (_e: Electron.IpcRendererEvent, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
