import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { showWindow } from './window'

let _tray: Tray | null = null

export function createTray(): Tray {
  // Use a small icon from resources, fall back to empty image in dev
  let icon = nativeImage.createEmpty()
  try {
    icon = nativeImage.createFromPath(join(__dirname, '../../resources/trayIconTemplate.png'))
    icon.setTemplateImage(true)
  } catch {}

  _tray = new Tray(icon)
  _tray.setToolTip('Open Coworker')
  updateTrayMenu('idle')

  _tray.on('click', () => showWindow())
  return _tray
}

export function updateTrayMenu(
  state: 'idle' | 'running' | 'done',
  detail?: string
): void {
  if (!_tray) return

  const statusLabel =
    state === 'running' ? `⏳ ${detail ?? 'Generating summary…'}` :
    state === 'done'    ? `✅ Summary ready` :
                          'Open Coworker'

  const menu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: 'Open', click: showWindow },
    { label: 'Run Summary Now', click: () => {
        showWindow()
        // renderer picks this up via the window focus
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  _tray.setContextMenu(menu)
}
