import { app, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createWindow, getWindow } from './window'
import { createTray, updateTrayMenu } from './tray'
import { registerIpcHandlers } from './ipc'
import { loadConfig } from './gateway'
import { startScheduler } from './scheduler'
import { seedBuiltins } from './skills/manager'
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.opencoworker.app')

  app.on('browser-window-created', (_, win) => {
    optimizer.watchWindowShortcuts(win)
  })

  createWindow()
  createTray()

  // Send events from main → renderer
  const emit = (event: string, ...args: unknown[]): void => {
    const w = getWindow()
    if (w && !w.isDestroyed()) {
      w.webContents.send(event, ...args)
    }
  }

  // Hook tray updates to skill progress events
  const origEmit = emit
  const emitWithTray = (event: string, ...args: unknown[]): void => {
    origEmit(event, ...args)
    if (event === 'skill:progress') {
      const { message } = args[0] as { step: string; message: string }
      updateTrayMenu('running', message)
    } else if (event === 'skill:complete') {
      updateTrayMenu('done')
    } else if (event === 'skill:error') {
      updateTrayMenu('idle')
    }
  }

  registerIpcHandlers(emitWithTray)
  seedBuiltins()

  // Start scheduler if previously enabled
  const config = loadConfig()
  if (config.schedulerEnabled) startScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Keep app running in background (tray app)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
