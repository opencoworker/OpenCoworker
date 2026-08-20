import { powerMonitor } from 'electron'
import * as cron from 'node-cron'
import { loadConfig, updateConfig } from './gateway'
import { runDailySummary } from './skills/daily-slack-summary'

let _task: cron.ScheduledTask | null = null
let _onProgress: ((step: string, msg: string) => void) | null = null
let _onComplete: ((path: string) => void) | null = null
let _onError: ((msg: string) => void) | null = null

export function setSchedulerCallbacks(
  onProgress: (step: string, msg: string) => void,
  onComplete: (path: string) => void,
  onError: (msg: string) => void
): void {
  _onProgress = onProgress
  _onComplete = onComplete
  _onError = onError
}

export function startScheduler(): void {
  const config = loadConfig()
  if (!config.schedulerEnabled) return

  const [hour, minute] = config.summaryTime.split(':').map(Number)
  const cronExpr = `${minute} ${hour} * * 1-5` // weekdays

  stopScheduler()

  _task = cron.schedule(
    cronExpr,
    async () => {
      const today = new Date().toISOString().slice(0, 10)
      const cfg = loadConfig()
      if (cfg.lastSummaryDate === today) return // already ran today
      await triggerSummary()
    },
    { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  )

  // Handle wake-from-sleep: if we missed the window by < 30 min, run immediately
  powerMonitor.on('resume', async () => {
    const config = loadConfig()
    if (!config.schedulerEnabled) return

    const now = new Date()
    const [h, m] = config.summaryTime.split(':').map(Number)
    const scheduled = new Date(now)
    scheduled.setHours(h, m, 0, 0)

    const diffMs = now.getTime() - scheduled.getTime()
    const today = now.toISOString().slice(0, 10)

    if (diffMs >= 0 && diffMs < 30 * 60 * 1000 && config.lastSummaryDate !== today) {
      await triggerSummary()
    }
  })
}

export function stopScheduler(): void {
  if (_task) {
    _task.stop()
    _task = null
  }
}

export async function triggerSummary(): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const path = await runDailySummary((step, msg) => _onProgress?.(step, msg))
    updateConfig({ lastSummaryDate: today })
    _onComplete?.(path)
    return path
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    _onError?.(msg)
    throw err
  }
}
