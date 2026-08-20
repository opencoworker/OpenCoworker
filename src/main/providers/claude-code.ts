import { execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

const KNOWN_PATHS = [
  '/usr/local/bin/claude',
  '/usr/bin/claude',
  `${process.env.HOME}/.claude/bin/claude`,
  `${process.env.HOME}/.local/bin/claude`
]

function findClaudeBinary(): string | null {
  // check PATH first
  try {
    const result = execFileSync('which', ['claude'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    const p = result.trim()
    if (p && existsSync(p)) return p
  } catch {}
  // check known install locations
  for (const p of KNOWN_PATHS) {
    if (existsSync(p)) return p
  }
  return null
}

export interface ClaudeCodeDetection {
  available: boolean
  path?: string
  loggedIn?: boolean
  error?: string
  detail?: string
}

export async function detectClaudeCode(): Promise<ClaudeCodeDetection> {
  const path = findClaudeBinary()
  if (!path) return { available: false, error: 'claude CLI not found' }

  try {
    const { stdout } = await execFileAsync(path, ['--version'], { timeout: 5000 })
    const version = stdout.trim()
    if (!version) return { available: true, path, loggedIn: false, error: 'could not determine version' }
    // Binary runs — treat as available. testProvider() will catch auth issues.
    return { available: true, path, loggedIn: true, detail: version }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { available: true, path, loggedIn: false, error: msg }
  }
}

export async function claudeCodeComplete(opts: {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
}): Promise<string> {
  const path = findClaudeBinary()
  if (!path) throw new Error('claude CLI not found')

  const args: string[] = ['--print', '--output-format', 'text']
  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt)
  if (opts.model) args.push('--model', opts.model)
  args.push(opts.prompt)

  const { stdout, stderr } = await execFileAsync(path, args, {
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024
  })

  if (!stdout.trim() && stderr.trim()) {
    throw new Error(`claude error: ${stderr.trim()}`)
  }
  return stdout.trim()
}
