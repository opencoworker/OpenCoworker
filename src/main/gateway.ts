import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs'

const DATA_DIR = join(app.getPath('home'), '.workbench')
const CONFIG_PATH = join(DATA_DIR, 'config.json')
const SECRETS_PATH = join(DATA_DIR, 'secrets.enc')
const AUDIT_PATH = join(DATA_DIR, 'audit.log')
const SUMMARIES_DIR = join(DATA_DIR, 'summaries')

export interface Config {
  providerType: 'claude-code' | 'anthropic-api' | 'openai-api' | null
  slackConnected: boolean
  slackTeamId: string
  slackTeamName: string
  slackUserId: string
  slackUserName: string
  summaryTime: string
  summaryChannelLimit: number
  schedulerEnabled: boolean
  lastSummaryDate: string
  // Slack auth mode: 'token' = paste a token (PoC), 'oauth-relay' = backend OAuth flow (production)
  slackAuthMode: 'token' | 'oauth-relay'
  oauthRelayUrl: string
  // Linear connector (enabled per client via config)
  linearConnected: boolean
  linearWorkspaceName: string
}

const DEFAULT_CONFIG: Config = {
  providerType: null,
  slackConnected: false,
  slackTeamId: '',
  slackTeamName: '',
  slackUserId: '',
  slackUserName: '',
  summaryTime: '07:30',
  summaryChannelLimit: 20,
  schedulerEnabled: false,
  lastSummaryDate: '',
  slackAuthMode: 'token',
  oauthRelayUrl: '',
  linearConnected: false,
  linearWorkspaceName: ''
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(SUMMARIES_DIR)) mkdirSync(SUMMARIES_DIR, { recursive: true })
}

// ─── Config ────────────────────────────────────────────────────────────────

export function loadConfig(): Config {
  ensureDataDir()
  try {
    if (existsSync(CONFIG_PATH)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) }
    }
  } catch {
    // fall through to default
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(config: Config): void {
  ensureDataDir()
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function updateConfig(patch: Partial<Config>): Config {
  const config = { ...loadConfig(), ...patch }
  saveConfig(config)
  return config
}

// ─── Secrets (encrypted via Electron safeStorage) ──────────────────────────

interface Secrets {
  slackAccessToken?: string
  anthropicApiKey?: string
  openaiApiKey?: string
  linearApiKey?: string
}

export function loadSecrets(): Secrets {
  ensureDataDir()
  try {
    if (!existsSync(SECRETS_PATH)) return {}
    if (!safeStorage.isEncryptionAvailable()) {
      // dev fallback: base64 only (not for production)
      const raw = readFileSync(SECRETS_PATH, 'utf-8')
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    }
    const encrypted = readFileSync(SECRETS_PATH)
    const decrypted = safeStorage.decryptString(encrypted)
    return JSON.parse(decrypted)
  } catch {
    return {}
  }
}

export function saveSecrets(secrets: Secrets): void {
  ensureDataDir()
  const json = JSON.stringify(secrets)
  if (!safeStorage.isEncryptionAvailable()) {
    writeFileSync(SECRETS_PATH, Buffer.from(json).toString('base64'))
    return
  }
  const encrypted = safeStorage.encryptString(json)
  writeFileSync(SECRETS_PATH, encrypted)
}

export function setSecret(key: keyof Secrets, value: string): void {
  const secrets = { ...loadSecrets(), [key]: value }
  saveSecrets(secrets)
}

export function getSecret(key: keyof Secrets): string | undefined {
  return loadSecrets()[key]
}

export function secretsPresent(): Record<keyof Secrets, boolean> {
  const s = loadSecrets()
  return {
    slackAccessToken: !!s.slackAccessToken,
    anthropicApiKey: !!s.anthropicApiKey,
    openaiApiKey: !!s.openaiApiKey,
    linearApiKey: !!s.linearApiKey
  }
}

// ─── Audit log ─────────────────────────────────────────────────────────────

export function auditLog(entry: {
  skill?: string
  tool?: string
  provider?: string
  status: 'ok' | 'error'
  detail?: string
}): void {
  ensureDataDir()
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
  appendFileSync(AUDIT_PATH, line)
}

// ─── Summaries dir ─────────────────────────────────────────────────────────

export function summariesDir(): string {
  ensureDataDir()
  return SUMMARIES_DIR
}
