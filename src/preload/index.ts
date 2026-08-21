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

  // Linear
  connectLinear: (apiKey: string) => ipcRenderer.invoke('linear:connect', apiKey),
  disconnectLinear: () => ipcRenderer.invoke('linear:disconnect'),
  generateCandidates: () => ipcRenderer.invoke('linear:generate-candidates'),
  createFromCandidates: (candidates: unknown[], teamId: string) => ipcRenderer.invoke('linear:create-from-candidates', candidates, teamId),

  // Skills
  listSkills: () => ipcRenderer.invoke('skills:list'),
  getSkill: (id: string) => ipcRenderer.invoke('skills:get', id),
  saveSkill: (id: string, meta: Record<string, unknown>, body: string) => ipcRenderer.invoke('skills:save', id, meta, body),
  deleteSkill: (id: string) => ipcRenderer.invoke('skills:delete', id),
  exportSkill: (id: string, format: string) => ipcRenderer.invoke('skills:export', id, format),

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
