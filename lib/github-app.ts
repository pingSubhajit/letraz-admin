import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'

export interface GitHubAppInstallation {
  id: number
  account: {
    login: string
    id: number
    type?: 'User' | 'Organization' | string
  } | null
  repository_selection: 'selected' | 'all'
  permissions: Record<string, string>
  events: string[]
  created_at: string
  updated_at: string
  repositories_count?: number
}

export class GitHubAppClient {
  private appId: string
  private privateKey: string
  private clientId: string
  private clientSecret: string
  private appSlug: string

  constructor() {
    this.appId = process.env.GITHUB_APP_ID || ''
    this.privateKey = this.normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY || '')
    this.clientId = process.env.GITHUB_APP_CLIENT_ID || ''
    this.clientSecret = process.env.GITHUB_APP_CLIENT_SECRET || ''
    this.appSlug = process.env.GITHUB_APP_SLUG || process.env.NEXT_PUBLIC_GITHUB_APP_SLUG || ''

    // Validate required environment variables
    if (!this.appId) {
      throw new Error('GITHUB_APP_ID environment variable is required')
    }
    if (!this.privateKey) {
      throw new Error('GITHUB_APP_PRIVATE_KEY environment variable is required')
    }
    // clientId/clientSecret are optional for pure App authentication flows
  }

  /**
   * Normalize private key value from env to a valid PEM string
   * - Supports values with literal \n sequences by converting them to newlines
   * - Supports base64-encoded keys and decodes to PEM
   */
  private normalizePrivateKey(raw: string): string {
    if (!raw) return ''

    console.log('normalizePrivateKey input:', {
      rawLength: raw.length,
      rawFirstChars: raw.substring(0, 50) + '...',
      rawLastChars: '...' + raw.substring(raw.length - 50),
    })

    let value = raw.trim()

    // Check if it's a valid PEM key (has BEGIN and END markers)
    const isValidPEM = value.includes('BEGIN') && value.includes('END') && value.includes('PRIVATE KEY')

    console.log('normalizePrivateKey analysis:', {
      isValidPEM,
      hasBegin: value.includes('BEGIN'),
      hasEnd: value.includes('END'),
      hasPrivateKey: value.includes('PRIVATE KEY'),
      looksBase64: /^[A-Za-z0-9+/=\r\n]+$/.test(value) && !value.includes('BEGIN'),
    })

    if (isValidPEM) {
      // It's already a valid PEM, just replace escaped newlines
      const originalValue = value
      value = value.replace(/\\n/g, '\n')
      console.log('normalizePrivateKey: PEM detected, replacing escaped newlines', {
        originalLength: originalValue.length,
        newLength: value.length,
        hasEscapedNewlines: originalValue.includes('\\n'),
        hasRealNewlines: value.includes('\n'),
      })
      return value
    }

    // If it's base64 of a PEM, decode
    const looksBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(value) && !value.includes('BEGIN')
    if (looksBase64) {
      try {
        value = Buffer.from(value, 'base64').toString('utf8').trim()
        console.log('normalizePrivateKey: base64 decoded', {
          originalLength: raw.length,
          decodedLength: value.length,
          hasBegin: value.includes('BEGIN'),
          hasEnd: value.includes('END'),
        })
      } catch (error) {
        console.log('normalizePrivateKey: base64 decode failed', error)
        // ignore, will try fallback below
      }
    }

    // Replace escaped newlines with real newlines
    const beforeReplacement = value
    value = value.replace(/\\n/g, '\n')
    console.log('normalizePrivateKey: final replacement', {
      beforeLength: beforeReplacement.length,
      afterLength: value.length,
      hadEscapedNewlines: beforeReplacement.includes('\\n'),
    })

    return value
  }

  /**
   * Get app installations
   */
  async getInstallations(): Promise<GitHubAppInstallation[]> {
    console.log('GitHub App Debug Info:', {
      appId: this.appId,
      privateKeyLength: this.privateKey.length,
      privateKeyFirstChars: this.privateKey.substring(0, 50) + '...',
      privateKeyLastChars: '...' + this.privateKey.substring(this.privateKey.length - 50),
      privateKeyHasBegin: this.privateKey.includes('BEGIN'),
      privateKeyHasEnd: this.privateKey.includes('END'),
      privateKeyHasNewlines: this.privateKey.includes('\n'),
    })

    const auth = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
    })

    const appAuth = await auth({ type: 'app' })
    const octokit = new Octokit({ auth: appAuth.token })

    const { data } = await octokit.apps.listInstallations()
    return data
  }

  /**
   * Get installation token for a specific installation
   */
  async getInstallationToken(installationId: number): Promise<string> {
    const auth = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
    })

    const appAuth = await auth({ type: 'app' })
    const octokit = new Octokit({ auth: appAuth.token })

    const { data } = await octokit.apps.createInstallationAccessToken({
      installation_id: installationId,
    })

    return data.token
  }

  /**
   * Get installation details for a repository
   */
  async getRepositoryInstallation(owner: string, repo: string): Promise<GitHubAppInstallation | null> {
    const installations = await this.getInstallations()

    // Find installation that has access to this repository
    for (const installation of installations) {
      if (installation.repository_selection === 'all') {
        return installation
      }

      // Check if this installation includes the repository using INSTALLATION token
      const token = await this.getInstallationToken(installation.id)
      const octokit = new Octokit({ auth: token })

      try {
        const { data } = await octokit.apps.listReposAccessibleToInstallation({ per_page: 100 })

        if ((data.repositories as any[]).some((r: any) => r.full_name === `${owner}/${repo}`)) {
          return installation
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error checking installation repositories:', error)
      }
    }

    return null
  }

  /**
   * Create installation URL for user to install the app
   */
  getInstallationUrl(): string {
    // Use the GitHub settings install page if slug is known, else fallback to generic apps page
    if (this.appSlug) {
      return `https://github.com/settings/apps/${this.appSlug}/installations`
    }
    return `https://github.com/apps/${this.appId}`
  }

  /**
   * Get app details
   */
  async getAppDetails() {
    const auth = createAppAuth({
      appId: this.appId,
      privateKey: this.privateKey,
    })

    const appAuth = await auth({ type: 'app' })
    const octokit = new Octokit({ auth: appAuth.token })

    const { data } = await octokit.apps.getAuthenticated()
    return data
  }
}

// Singleton instance
let githubAppClient: GitHubAppClient | null = null

export const getGitHubAppClient = (): GitHubAppClient => {
  if (!githubAppClient) {
    githubAppClient = new GitHubAppClient()
  }
  return githubAppClient
}
