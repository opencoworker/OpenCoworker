import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function initAnthropicClient(apiKey: string): void {
  _client = new Anthropic({ apiKey })
}

export function getAnthropicClient(): Anthropic {
  if (!_client) throw new Error('Anthropic client not initialized — set API key first')
  return _client
}

export async function anthropicComplete(opts: {
  prompt: string
  systemPrompt?: string
  model?: string
  maxTokens?: number
}): Promise<string> {
  const client = getAnthropicClient()
  const model = opts.model ?? 'claude-sonnet-4-6'
  const maxTokens = opts.maxTokens ?? 4096

  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.prompt }]
  })

  const block = msg.content[0]
  if (block.type !== 'text') throw new Error('unexpected response type from Anthropic API')
  return block.text
}
