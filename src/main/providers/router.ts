import { loadConfig, getSecret } from '../gateway'
import { detectClaudeCode, claudeCodeComplete } from './claude-code'
import { initAnthropicClient, anthropicComplete } from './anthropic-api'

export interface LLMCompleteOpts {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
}

export interface ProviderStatus {
  type: string
  label: string
  available: boolean
  detail?: string
}

export async function detectProviders(): Promise<ProviderStatus[]> {
  const results: ProviderStatus[] = []

  // Claude Code harness
  const cc = await detectClaudeCode()
  results.push({
    type: 'claude-code',
    label: 'Claude Code (claude.ai subscription)',
    available: cc.available && (cc.loggedIn ?? false),
    detail: cc.loggedIn ? `Found at ${cc.path}${cc.detail ? ` (${cc.detail})` : ''}` : cc.error
  })

  // Anthropic API key
  const anthropicKey = getSecret('anthropicApiKey')
  results.push({
    type: 'anthropic-api',
    label: 'Anthropic API Key',
    available: !!anthropicKey,
    detail: anthropicKey ? 'API key configured' : 'No API key set'
  })

  // OpenAI (placeholder — Phase 2)
  results.push({
    type: 'openai-api',
    label: 'OpenAI / Codex API Key',
    available: false,
    detail: 'Coming in Phase 2'
  })

  return results
}

export async function complete(opts: LLMCompleteOpts): Promise<string> {
  const config = loadConfig()
  const providerType = config.providerType

  if (providerType === 'claude-code') {
    return claudeCodeComplete(opts)
  }

  if (providerType === 'anthropic-api') {
    const key = getSecret('anthropicApiKey')
    if (!key) throw new Error('Anthropic API key not set')
    initAnthropicClient(key)
    return anthropicComplete(opts)
  }

  // Auto-fallback: try Claude Code first, then Anthropic API key
  const cc = await detectClaudeCode()
  if (cc.available && cc.loggedIn) {
    return claudeCodeComplete(opts)
  }
  const key = getSecret('anthropicApiKey')
  if (key) {
    initAnthropicClient(key)
    return anthropicComplete(opts)
  }

  throw new Error('No LLM provider configured. Set up Claude Code or an API key in Preferences.')
}
