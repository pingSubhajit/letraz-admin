import {LinearClient} from '@linear/sdk'
import {getCookie} from 'cookies-next'
import {getGitHubClient} from './github-api'
import {api} from '@/convex/_generated/api'
import {fetchQuery, fetchMutation} from 'convex/nextjs'

export interface MatchedLinearIssue {
  id: string
  identifier: string
  title: string
  description?: string
  url: string
  state: string
  assignee?: {
    id: string
    name: string
  }
  labels: Array<{
    id: string
    name: string
  }>
  priority: number
  estimate?: number
  team: {
    id: string
    name: string
  }
  project?: {
    id: string
    name: string
  }
  milestone?: {
    id: string
    name: string
  }
  githubIssue?: {
    id: string
    owner: string
    repo: string
    number: number
  }
}

export interface BranchMatchResult {
  branchName: string
  linearIssueId: string | null
  matchedIssue: MatchedLinearIssue | null
  confidence: 'high' | 'medium' | 'low' | 'none'
}

// Extract Linear issue identifier from branch name
export const extractLinearIssueId = (branchName: string): string | null => {
	// Generic capture: any PROJECT-123 anywhere in the branch name
	const generic = branchName.match(/([A-Z]+-\d+)/i)
	if (generic && generic[1]) {
		return generic[1].toUpperCase()
	}

	return null
}

/*
 * Get Linear access token
 * Build a Linear client for both client and server environments
 */
const buildLinearClient = (): LinearClient | null => {
	// In browser: use OAuth access token stored in cookie
	if (typeof window !== 'undefined') {
		const accessToken = (getCookie('linear_access_token') as string) || null
		if (accessToken) {
			return new LinearClient({accessToken})
		}
		return null
	}

	// On server (webhook processing): prefer API key, then access token
	const apiKey = process.env.LINEAR_API_KEY
	if (apiKey) {
		return new LinearClient({apiKey})
	}

	const accessToken = process.env.LINEAR_ACCESS_TOKEN
	if (accessToken) {
		return new LinearClient({accessToken})
	}

	return null
}

// Match branch name with Linear issues
export const matchBranchWithLinearIssues = async (
	branchName: string,
	repositoryData: any
): Promise<BranchMatchResult> => {
	const linearIssueId = extractLinearIssueId(branchName)

	if (!linearIssueId) {
		return {
			branchName,
			linearIssueId: null,
			matchedIssue: null,
			confidence: 'none'
		}
	}

	try {
		const linearClient = buildLinearClient()
		if (!linearClient) {
			return {
				branchName,
				linearIssueId,
				matchedIssue: null,
				confidence: 'none'
			}
		}

		// Extract the team key and issue number from the identifier (e.g., "LET-144" -> key LET, number 144)
		const issueNumberMatch = linearIssueId.match(/^([A-Z]+)-(\d+)$/)
		if (!issueNumberMatch) {
			return {
				branchName,
				linearIssueId,
				matchedIssue: null,
				confidence: 'none'
			}
		}

		const teamKey = issueNumberMatch[1]
		const issueNumber = parseInt(issueNumberMatch[2])

		// Query Linear for the issue (team key + number is the canonical way)
		const issues = await linearClient.issues({
			filter: {
				and: [
					{number: {eq: issueNumber}},
					{team: {key: {eq: teamKey}}},
					// Optional additional filter by team id if provided on repository
					...(repositoryData.linearTeamId ? [
						{team: {id: {eq: repositoryData.linearTeamId}}}
					] : [])
				]
			},
			first: 1
		})

		if ((issues as any).nodes?.length === 0) {
			return {
				branchName,
				linearIssueId,
				matchedIssue: null,
				confidence: 'none'
			}
		}

		const issue = (issues as any).nodes[0]

		/*
		 * Resolve lazy references from Linear SDK
		 * Some fields are already resolved, others need to be awaited
		 */
		const statePromise = (issue as any).state ? Promise.resolve((issue as any).state).catch(() => null) : Promise.resolve(null)
		const assigneePromise = (issue as any).assignee ? Promise.resolve((issue as any).assignee).catch(() => null) : Promise.resolve(null)
		const teamPromise = (issue as any).team ? Promise.resolve((issue as any).team).catch(() => null) : Promise.resolve(null)
		const projectPromise = (issue as any).project ? Promise.resolve((issue as any).project).catch(() => null) : Promise.resolve(null)
		const labelsPromise = (issue as any).labels ? Promise.resolve((issue as any).labels).catch(() => null) : Promise.resolve(null)

		const [stateObj, assigneeObj, teamObj, projectObj, issueProjectMilestone] = await Promise.all([
			statePromise,
			assigneePromise,
			teamPromise,
			projectPromise,
			// Some workspaces expose milestone directly on the issue as a lazy ref
			(issue as any).projectMilestone ? Promise.resolve((issue as any).projectMilestone).catch(() => null) : Promise.resolve(null)
		])

		// Fetch labels with proper 'this' binding to the issue instance
		let labelsConn: any = null
		try {
			if (typeof (issue as any).labels === 'function') {
				labelsConn = await (issue as any).labels()
			} else {
				labelsConn = (issue as any).labels || null
			}
		} catch {
			labelsConn = null
		}

		// Resolve state name
		const stateName = (stateObj as any)?.name || ''

		// Check if issue is in a valid state for PR creation
		const validStates = ['In Progress', 'Todo', 'Backlog']
		if (stateName && !validStates.includes(stateName)) {
			return {
				branchName,
				linearIssueId,
				matchedIssue: null,
				confidence: 'low'
			}
		}

		// Transform Linear issue to our interface
		const matchedIssue: MatchedLinearIssue = {
			id: issue.id,
			identifier: issue.identifier,
			title: issue.title,
			description: issue.description,
			url: issue.url || '',
			state: stateName,
			assignee: assigneeObj ? {
				id: (assigneeObj as any).id,
				name: (assigneeObj as any).displayName
			} : undefined,
			labels: (labelsConn as any)?.nodes?.map((label: any) => ({
				id: label.id,
				name: label.name
			})) || [],
			priority: issue.priority || 0,
			estimate: issue.estimate || undefined,
			team: {
				id: (teamObj as any).id,
				name: (teamObj as any).name
			},
			project: projectObj ? {
				id: (projectObj as any).id,
				name: (projectObj as any).name
			} : undefined,
			milestone: undefined, // Will be populated if available
			githubIssue: undefined // Will be populated if available
		}

		// Check for milestone directly on issue first
		if (issueProjectMilestone) {
			try {
				const m = await (issueProjectMilestone as any)
				if (m) {
					matchedIssue.milestone = {id: m.id, name: m.name}
				}
			} catch {}
		}

		// Check for milestone in project if available
		if (projectObj) {
			try {
				const projectData = projectObj as any

				// Try different ways to access milestone from project
				let milestoneObj = null

				// Try direct milestone field
				if (projectData.milestone) {
					milestoneObj = await (projectData.milestone as any).catch(() => null)
				}

				// Try projectMilestone field
				if (!milestoneObj && projectData.projectMilestone) {
					milestoneObj = await (projectData.projectMilestone as any).catch(() => null)
				}

				if (milestoneObj) {
					matchedIssue.milestone = {
						id: milestoneObj.id,
						name: milestoneObj.name
					}
				}
			} catch {}
		}

		// Check if this issue has a GitHub issue attached via integration
		if (issue.integrationSourceType && (issue.integrationSourceType as string).includes('github')) {
			// Try to extract GitHub issue info from various fields
			const externalId = (issue as any).externalId
			if (externalId) {
				// Parse external ID to extract GitHub issue number
				const githubMatch = externalId.match(/github\.com\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/)
				if (githubMatch) {
					matchedIssue.githubIssue = {
						id: `${githubMatch[1]}/${githubMatch[2]}#${githubMatch[3]}`,
						owner: githubMatch[1],
						repo: githubMatch[2],
						number: parseInt(githubMatch[3])
					}
				}
			}
		}

		// As a fallback, inspect attachments/links for GitHub issue URLs
		try {
			let attachmentsConn: any = null
			if (typeof (issue as any).attachments === 'function') {
				attachmentsConn = await (issue as any).attachments()
			} else {
				attachmentsConn = (issue as any).attachments || null
			}
			const attachments = (attachmentsConn as any)?.nodes || []
			const ghLink = attachments.find((a: any) => typeof a.url === 'string' && /github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/.test(a.url))
			if (ghLink) {
				const m = ghLink.url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/)
				if (m) {
					matchedIssue.githubIssue = {
						id: `${m[1]}/${m[2]}#${m[3]}`,
						owner: m[1],
						repo: m[2],
						number: parseInt(m[3])
					}
				}
			}
		} catch {}

		/*
		 * For now, we'll leave githubIssue as undefined since we need to implement
		 * the mapping lookup in the webhook handler
		 */

		// Calculate confidence based on match quality
		const confidence = calculateMatchConfidence(branchName, linearIssueId, matchedIssue)

		return {
			branchName,
			linearIssueId,
			matchedIssue,
			confidence
		}
	} catch (error) {
		return {
			branchName,
			linearIssueId,
			matchedIssue: null,
			confidence: 'none'
		}
	}
}

// Calculate confidence level for branch-issue match
const calculateMatchConfidence = (
	branchName: string,
	linearIssueId: string,
	issue: MatchedLinearIssue
): 'high' | 'medium' | 'low' => {
	// High confidence if branch name is exact match or very similar to issue title
	const branchNameLower = branchName.toLowerCase()
	const titleLower = issue.title.toLowerCase()

	// Check for exact match patterns
	if (branchNameLower.includes(linearIssueId.toLowerCase())) {
		return 'high'
	}

	// Check if branch name contains key words from issue title
	const titleWords = titleLower.split(' ').filter(word => word.length > 3)
	const matchingWords = titleWords.filter(word => branchNameLower.includes(word))

	if (matchingWords.length > 0) {
		return 'medium'
	}

	return 'low'
}

// Get or create GitHub-Linear issue mapping
export const getOrCreateGitHubLinearMapping = async (
	linearIssueId: string,
	githubIssueId: number,
	repositoryId: string
): Promise<boolean> => {
	try {
		const {getGitHubIssueByLinearIssue} = api.repositories

		// Check if mapping already exists
		const existingMapping = await fetchQuery(getGitHubIssueByLinearIssue, {
			linearIssueId,
			githubRepositoryId: repositoryId as any
		})

		if (existingMapping) {
			// Update existing mapping if needed
			return true
		}

		// Create new mapping
		const {createGitHubLinearMapping} = api.repositories
		await fetchMutation(createGitHubLinearMapping, {
			linearIssueId,
			githubIssueId,
			githubRepositoryId: repositoryId as any
		})

		return true
	} catch (error) {
		return false
	}
}

// Batch process multiple branches
export const processBranchesBatch = async (
	branches: string[],
	repositoryData: any
): Promise<BranchMatchResult[]> => {
	const results: BranchMatchResult[] = []

	for (const branchName of branches) {
		const result = await matchBranchWithLinearIssues(branchName, repositoryData)
		results.push(result)
	}

	return results
}
