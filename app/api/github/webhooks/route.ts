import {NextResponse} from 'next/server'
import {headers} from 'next/headers'
import {createGitHubClient, createGitHubClientWithAppToken} from '@/lib/github-api'
import {getGitHubAppClient} from '@/lib/github-app'
import {matchBranchWithLinearIssues} from '@/lib/branch-matching'
import {api} from '@/convex/_generated/api'
import {fetchMutation, fetchQuery} from 'convex/nextjs'

// GitHub webhook signature verification
const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
	const crypto = require('crypto')

	const hmac = crypto.createHmac('sha256', secret)
	const digest = 'sha256=' + hmac.update(payload).digest('hex')

	return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export const GET = async () => {
	return NextResponse.json({status: 'Webhook endpoint is active'}, {status: 200})
}

export const POST = async (request: Request) => {
	try {
		const body = await request.text()
		const headersList = await headers()
		const signature = headersList.get('x-hub-signature-256')
		const eventType = headersList.get('x-github-event')
		const deliveryId = headersList.get('x-github-delivery')

		if (!signature || !eventType) {
			return NextResponse.json({error: 'Missing required headers'}, {status: 400})
		}

		// Parse webhook payload
		let payload
		try {
			payload = JSON.parse(body)
		} catch (error) {
			return NextResponse.json({error: 'Invalid JSON payload'}, {status: 400})
		}

		// Extract repository info from payload
		const {repository} = payload
		if (!repository || !repository.id || !repository.owner?.login || !repository.name) {
			return NextResponse.json({error: 'Invalid repository data in payload'}, {status: 400})
		}

		// Find repository in database
		const {getRepositoryByGitHubId} = api.repositories
		const repositoryData = await fetchQuery(getRepositoryByGitHubId, {
			githubId: repository.id,
			owner: repository.owner.login
		})

		if (!repositoryData) {
			return NextResponse.json({error: 'Repository not found'}, {status: 404})
		}

		// Verify webhook signature
		if (!verifyWebhookSignature(body, signature, repositoryData.webhookSecret)) {
			return NextResponse.json({error: 'Invalid signature'}, {status: 401})
		}

		// Get GitHub App installation for this repository
		const githubAppClient = getGitHubAppClient()
		const installation = await githubAppClient.getRepositoryInstallation(
			repository.owner.login,
			repository.name
		)

		if (!installation) {
			return NextResponse.json({error: 'GitHub App not installed on repository'}, {status: 403})
		}

		const installationToken = await githubAppClient.getInstallationToken(installation.id)

		// Create GitHub client with app token
		const githubClient = createGitHubClientWithAppToken(installationToken)

		// Create webhook event record
		const {createWebhookEvent} = api.repositories
		await fetchMutation(createWebhookEvent, {
			repositoryId: repositoryData._id,
			eventType,
			payload
		})

		// Handle different event types
		switch (eventType) {
		case 'push':
			await handlePushEvent(payload, repositoryData, githubClient)
			break

		case 'ping':
			// GitHub sends a ping event when webhook is created
			break

		default:
		}

		return NextResponse.json({success: true})
	} catch (error) {
		return NextResponse.json({error: 'Internal server error'}, {status: 500})
	}
}

// Handle push events
const handlePushEvent = async (payload: any, repositoryData: any, githubClient: any) => {
	const {ref, commits, repository, sender} = payload

	// Only process branch pushes (not tags)
	if (!ref.startsWith('refs/heads/')) {
		return
	}

	const branchName = ref.replace('refs/heads/', '')

	// Check if this is a new branch creation
	const isNewBranch = payload.created && commits.length === 1

	if (isNewBranch) {

		/*
		 * TODO: Process new branch - match with Linear issues and create PRs
		 * This will be implemented in the next phase
		 */
		await processNewBranch(branchName, repositoryData, payload, githubClient)
	}
}

// Process new branch - match with Linear issues and create PRs
const processNewBranch = async (branchName: string, repositoryData: any, payload: any, githubClient: any) => {
	try {
		// Match branch with Linear issues
		const matchResult = await matchBranchWithLinearIssues(branchName, repositoryData)

		if (!matchResult.matchedIssue) {
			return
		}

		// Only proceed with high or medium confidence matches
		if (matchResult.confidence === 'low') {
			return
		}

		// Create PR for the matched issue
		await createPRForLinearIssue(matchResult, repositoryData, payload, githubClient)

	} catch {}
}

// Create PR for Linear issue
const createPRForLinearIssue = async (
	matchResult: any,
	repositoryData: any,
	payload: any,
	githubClient: any
) => {
	try {
		const {repository, sender} = payload
		const {matchedIssue} = matchResult

		/*
		 * Get default branch (usually main or master)
		 * Note: githubClient is already created with app token above
		 */

		// For now, assume main branch as default
		const defaultBranch = 'main'

		// Create PR title
		const prTitle = `${matchedIssue.identifier} | ${matchedIssue.title}`

		// Generate PR description using existing infrastructure
		const prDescription = await generatePRDescription(matchedIssue)

		// Create the PR
		const prData = await githubClient.createPullRequest(
			repository.owner.login,
			repository.name,
			{
				title: prTitle,
				head: matchResult.branchName,
				base: defaultBranch,
				body: prDescription,
				draft: true // Create as draft initially
			}
		)

		// Record the PR mapping in database
		const {createGitHubPrMapping} = api.repositories
		await fetchMutation(createGitHubPrMapping, {
			linearIssueId: matchedIssue.id,
			githubPrId: prData.id,
			githubRepositoryId: repositoryData._id,
			githubPrNumber: prData.number,
			githubPrUrl: prData.html_url
		})

		// Link GitHub issue if it exists and apply labels/milestones/assignee
		await linkGitHubIssueAndApplyMetadata(prData, matchedIssue, repositoryData, githubClient)
	} catch {}
}

// Generate PR description using existing infrastructure
const generatePRDescription = async (issue: any): Promise<string> => {
	try {
		// Use the existing PR generation endpoint
		const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				issue: {
					id: issue.id,
					identifier: issue.identifier,
					title: issue.title,
					description: issue.description,
					url: issue.url
				},
				customInstructions: '' // Could be enhanced to include repository-specific instructions
			})
		})

		if (!response.ok) {
			throw new Error('Failed to generate PR description')
		}

		const data = await response.json()
		return data.text || `Related to: ${issue.title}`
	} catch (error) {
		// Fallback to basic description
		return `## Issue\n[${issue.identifier}](${issue.url})\n\n## Description\n${issue.title}`
	}
}

// Link GitHub issue and apply metadata (labels, milestones)
const linkGitHubIssueAndApplyMetadata = async (
	prData: any,
	matchedIssue: any,
	repositoryData: any,
	githubClient: any
) => {
	try {
		// Ensure repo exists; response shape not used further
		await githubClient.getRepository(repositoryData.owner, repositoryData.name)

		// STEP 1: Check for existing GitHub-Linear mapping
		const {getGitHubIssueByLinearIssue} = api.repositories
		const githubIssueMapping = await fetchQuery(getGitHubIssueByLinearIssue, {
			linearIssueId: matchedIssue.id,
			githubRepositoryId: repositoryData._id
		})

		// Check if Linear issue has GitHub integration data
		if (matchedIssue.githubIssue) {
			const sourceOwner = matchedIssue.githubIssue.owner || repositoryData.owner
			const sourceRepo = matchedIssue.githubIssue.repo || repositoryData.name

			// If issue repo differs from PR repo, link cross-repo using closing keyword reference (won't auto-close across repos, but links UI)
			if (sourceOwner !== repositoryData.owner || sourceRepo !== repositoryData.name) {
				const updatedBody = `${prData.body}\n\nFixes ${sourceOwner}/${sourceRepo}#${matchedIssue.githubIssue.number}`
				await githubClient.updatePullRequest(
					repositoryData.owner,
					repositoryData.name,
					prData.number,
					{body: updatedBody}
				)

				// Try to mirror milestone by name from the source issue
				try {
					const appClient = getGitHubAppClient()
					const sourceOctokit = await appClient.getClientForRepo(sourceOwner, sourceRepo)
					if (sourceOctokit) {
						const {data: issue} = await sourceOctokit.issues.get({owner: sourceOwner, repo: sourceRepo, issue_number: matchedIssue.githubIssue.number})
						if (issue.milestone?.title) {
							await applyLinearMilestoneToPR(
								repositoryData,
								prData,
								{id: '', name: issue.milestone.title},
								githubClient
							)
						}

						// Add a back-reference comment on the source issue to ensure a visible link
						try {
							const prUrl = prData.html_url
							await sourceOctokit.issues.createComment({
								owner: sourceOwner,
								repo: sourceRepo,
								issue_number: matchedIssue.githubIssue.number,
								body: `Linked PR: ${prUrl}`
							})
						} catch {}
					}
				} catch {}
			} else {
				// Same-repo flow
				await linkIssueToPR(
					repositoryData,
					prData,
					matchedIssue.githubIssue.number,
					githubClient
				)

				try {
					const sourceIssue = await githubClient.getIssue(
						repositoryData.owner,
						repositoryData.name,
						matchedIssue.githubIssue.number
					)
					if (sourceIssue.milestone) {
						await githubClient.updateIssue(
							repositoryData.owner,
							repositoryData.name,
							prData.number,
							{milestone: sourceIssue.milestone.number}
						)
					}
				} catch {}
			}
		} else if (githubIssueMapping) {
			// Link the GitHub issue to the PR
			await linkIssueToPR(
				repositoryData,
				prData,
				githubIssueMapping.githubIssueId,
				githubClient
			)

			// Mirror milestone from the mapped GitHub issue onto the PR
			try {
				const sourceIssue = await githubClient.getIssue(
					repositoryData.owner,
					repositoryData.name,
					githubIssueMapping.githubIssueId
				)

				if (sourceIssue.milestone) {
					await githubClient.updateIssue(
						repositoryData.owner,
						repositoryData.name,
						prData.number,
						{milestone: sourceIssue.milestone.number}
					)
				}
			} catch {}
		}

		// STEP 2: Apply labels from Linear issue to GitHub PR
		if (matchedIssue.labels && matchedIssue.labels.length > 0) {
			await ensureAndApplyLabelsToPR(repositoryData, prData, matchedIssue.labels, githubClient)
		}

		// STEP 3: Try to assign PR to a matching GitHub user
		await tryAssignPRAssignee(repositoryData, prData, matchedIssue, githubClient)

		// STEP 4: Apply milestone from Linear issue if available
		if (matchedIssue.milestone) {
			await applyLinearMilestoneToPR(repositoryData, prData, matchedIssue.milestone, githubClient)
		}

	} catch {}
}

// Apply Linear milestone to PR by finding/creating matching GitHub milestone
const applyLinearMilestoneToPR = async (
	repositoryData: any,
	prData: any,
	linearMilestone: any,
	githubClient: any
) => {
	try {
		// Get all GitHub milestones for the repository
		const githubMilestones = await githubClient.getMilestones(
			repositoryData.owner,
			repositoryData.name
		)

		// Look for exact match by title
		let matchingMilestone = githubMilestones.find((m: any) => m.title.toLowerCase() === linearMilestone.name.toLowerCase())

		// If not found, create it
		if (!matchingMilestone) {
			try {
				matchingMilestone = await githubClient.createMilestone(
					repositoryData.owner,
					repositoryData.name,
					{title: linearMilestone.name}
				)
			} catch {
				return
			}
		}

		// Apply the milestone to the PR
		await githubClient.updateIssue(
			repositoryData.owner,
			repositoryData.name,
			prData.number,
			{milestone: matchingMilestone.number}
		)

	} catch {}
}

// Link GitHub issue to PR
const linkIssueToPR = async (
	repositoryData: any,
	prData: any,
	githubIssueNumber: number,
	githubClient: any
) => {
	try {
		// Get the GitHub issue details
		const githubIssues = await githubClient.getRepositoryIssues(
			repositoryData.owner,
			repositoryData.name
		)

		const githubIssue = githubIssues.find((issue: any) => issue.number === githubIssueNumber)

		if (!githubIssue) {
			return
		}

		// Update PR body to reference the GitHub issue
		const updatedBody = `${prData.body}\n\nCloses #${githubIssueNumber}`

		// Update the PR
		await githubClient.updatePullRequest(
			repositoryData.owner,
			repositoryData.name,
			prData.number,
			{
				body: updatedBody
			}
		)

	} catch {}
}

// Apply Linear labels to GitHub PR
const ensureAndApplyLabelsToPR = async (
	repositoryData: any,
	prData: any,
	linearLabels: any[],
	githubClient: any
) => {
	try {
		const targetLabelNames = linearLabels.map((l: any) => l.name)

		// Ensure labels exist; create if missing
		const existing = await githubClient.getLabels(
			repositoryData.owner,
			repositoryData.name
		)
		const existingSet = new Set(existing.map((l: any) => l.name.toLowerCase()))

		for (const name of targetLabelNames) {
			if (!existingSet.has(name.toLowerCase())) {
				try {
					await githubClient.createLabel(
						repositoryData.owner,
						repositoryData.name,
						{name}
					)
				} catch {}
			}
		}

		// Apply labels to PR (Issues and PRs share the same labels API)
		await githubClient.request(
			`/repos/${repositoryData.owner}/${repositoryData.name}/issues/${prData.number}/labels`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({labels: targetLabelNames})
			}
		)

	} catch {}
}

// Assign PR to a GitHub user by matching Linear assignee displayName to repository assignees
const tryAssignPRAssignee = async (
	repositoryData: any,
	prData: any,
	matchedIssue: any,
	githubClient: any
) => {
	try {
		const assigneeName: string | undefined = matchedIssue.assignee?.name

		if (!assigneeName) {
			return
		}

		const candidates = await githubClient.listAssignees(
			repositoryData.owner,
			repositoryData.name
		)

		// Match by login if name is a substring; fallback exact, case-insensitive
		const login = candidates.find((u: any) => u.login.toLowerCase() === assigneeName.toLowerCase() ||
      assigneeName.toLowerCase().includes(u.login.toLowerCase()) ||
      u.login.toLowerCase().includes(assigneeName.toLowerCase()))?.login

		if (!login) {
			return
		}

		await githubClient.addAssignees(
			repositoryData.owner,
			repositoryData.name,
			prData.number,
			[login]
		)
	} catch {}
}
