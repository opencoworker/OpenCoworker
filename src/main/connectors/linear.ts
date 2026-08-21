import { getSecret, setSecret, updateConfig, loadSecrets, saveSecrets } from '../gateway'

const LINEAR_API = 'https://api.linear.app/graphql'
const LINEAR_MCP_URL = 'https://mcp.linear.app/mcp'

// ─── Internal GraphQL helper ──────────────────────────────────────────────────

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = getSecret('linearApiKey')
  if (!apiKey) throw new Error('Linear not connected')

  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)

  const json = await res.json() as { data?: T; errors?: { message: string }[] }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Empty response from Linear API')
  return json.data
}

// ─── Connect / Disconnect ────────────────────────────────────────────────────

export async function connectWithApiKey(apiKey: string): Promise<void> {
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({ query: '{ viewer { name organization { name } } }' })
  })
  if (!res.ok) throw new Error(`Linear API error: ${res.status}`)

  const json = await res.json() as {
    data?: { viewer?: { name: string; organization?: { name: string } } }
    errors?: { message: string }[]
  }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  const viewer = json.data?.viewer
  if (!viewer) throw new Error('Invalid API key — no viewer returned')

  setSecret('linearApiKey', apiKey)
  updateConfig({
    linearConnected: true,
    linearWorkspaceName: viewer.organization?.name ?? viewer.name
  })
}

export function disconnectLinear(): void {
  const current = loadSecrets()
  saveSecrets({ ...current, linearApiKey: undefined })
  updateConfig({ linearConnected: false, linearWorkspaceName: '' })
}

// ─── MCP endpoint helper ──────────────────────────────────────────────────────

export function getLinearMcpConfig(): { url: string; apiKey: string } {
  const apiKey = getSecret('linearApiKey')
  if (!apiKey) throw new Error('Linear not connected')
  return { url: LINEAR_MCP_URL, apiKey }
}

// ─── Teams ────────────────────────────────────────────────────────────────────

export interface LinearTeam {
  id: string
  name: string
  key: string
}

export async function listTeams(): Promise<LinearTeam[]> {
  const data = await gql<{ teams: { nodes: LinearTeam[] } }>(`
    { teams { nodes { id name key } } }
  `)
  return data.teams.nodes
}

// ─── Members ─────────────────────────────────────────────────────────────────

export interface LinearMember {
  id: string
  name: string
  displayName: string
  email: string
}

export async function listMembers(): Promise<LinearMember[]> {
  const data = await gql<{ users: { nodes: LinearMember[] } }>(`
    { users { nodes { id name displayName email } } }
  `)
  return data.users.nodes
}

// ─── Create Issue ────────────────────────────────────────────────────────────

export interface CreateIssueInput {
  title: string
  description?: string
  teamId: string
  assigneeId?: string
}

export interface LinearIssue {
  id: string
  identifier: string
  url: string
  title: string
}

export async function createIssue(input: CreateIssueInput): Promise<LinearIssue> {
  const data = await gql<{ issueCreate: { success: boolean; issue: LinearIssue } }>(`
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url title }
      }
    }
  `, { input })

  if (!data.issueCreate.success) throw new Error('Linear issue creation failed')
  return data.issueCreate.issue
}
