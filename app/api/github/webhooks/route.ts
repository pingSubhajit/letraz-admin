import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createGitHubClient, createGitHubClientWithAppToken } from '@/lib/github-api'
import { getGitHubAppClient } from '@/lib/github-app'
import { matchBranchWithLinearIssues } from '@/lib/branch-matching'
import { api } from '@/convex/_generated/api'
import { fetchMutation, fetchQuery } from 'convex/nextjs'

// GitHub webhook signature verification
const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  const crypto = require('crypto')

  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
}

export const GET = async () => {
  return NextResponse.json({ status: 'Webhook endpoint is active' }, { status: 200 })
}

export const POST = async (request: Request) => {
  try {
    const body = await request.text()
    const headersList = await headers()
    const signature = headersList.get('x-hub-signature-256')
    const eventType = headersList.get('x-github-event')
    const deliveryId = headersList.get('x-github-delivery')

    if (!signature || !eventType) {
      return NextResponse.json({ error: 'Missing required headers' }, { status: 400 })
    }

    // Parse webhook payload
    let payload
    try {
      payload = JSON.parse(body)
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    // Extract repository info from payload
    const { repository } = payload
    if (!repository || !repository.id || !repository.owner?.login || !repository.name) {
      return NextResponse.json({ error: 'Invalid repository data in payload' }, { status: 400 })
    }

    // Find repository in database
    const { getRepositoryByGitHubId } = api.repositories
    const repositoryData = await fetchQuery(getRepositoryByGitHubId, {
      githubId: repository.id,
      owner: repository.owner.login,
    })

    if (!repositoryData) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(body, signature, repositoryData.webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Get GitHub App installation for this repository
    const githubAppClient = getGitHubAppClient()
    const installation = await githubAppClient.getRepositoryInstallation(
      repository.owner.login,
      repository.name
    )

    if (!installation) {
      console.error('No GitHub App installation found for repository:', `${repository.owner.login}/${repository.name}`)
      return NextResponse.json({ error: 'GitHub App not installed on repository' }, { status: 403 })
    }

    console.log('Using GitHub App installation:', installation.id)
    const installationToken = await githubAppClient.getInstallationToken(installation.id)
    console.log('Got GitHub App installation token')

    // Create GitHub client with app token
    const githubClient = createGitHubClientWithAppToken(installationToken)

    // Create webhook event record
    const { createWebhookEvent } = api.repositories
    await fetchMutation(createWebhookEvent, {
      repositoryId: repositoryData._id,
      eventType,
      payload,
    })

    // Handle different event types
    switch (eventType) {
      case 'push':
        await handlePushEvent(payload, repositoryData, githubClient)
        break

      case 'ping':
        // GitHub sends a ping event when webhook is created
        console.log('Webhook ping received for repository:', repository.full_name)
        break

      default:
        console.log('Unhandled webhook event type:', eventType)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Handle push events
const handlePushEvent = async (payload: any, repositoryData: any, githubClient: any) => {
  const { ref, commits, repository, sender } = payload

  // Only process branch pushes (not tags)
  if (!ref.startsWith('refs/heads/')) {
    return
  }

  const branchName = ref.replace('refs/heads/', '')

  // Check if this is a new branch creation
  const isNewBranch = payload.created && commits.length === 1

  if (isNewBranch) {
    console.log(`New branch created: ${branchName} in ${repository.full_name}`)

    // TODO: Process new branch - match with Linear issues and create PRs
    // This will be implemented in the next phase
    await processNewBranch(branchName, repositoryData, payload, githubClient)
  } else {
    console.log(`Push to existing branch: ${branchName} in ${repository.full_name}`)
  }
}

// Process new branch - match with Linear issues and create PRs
const processNewBranch = async (branchName: string, repositoryData: any, payload: any, githubClient: any) => {
  try {
    console.log(`Processing new branch: ${branchName}`)

    // Match branch with Linear issues
    const matchResult = await matchBranchWithLinearIssues(branchName, repositoryData)

    if (!matchResult.matchedIssue) {
      console.log(`No matching Linear issue found for branch: ${branchName}`)
      return
    }

    console.log(`Found matching Linear issue: ${matchResult.matchedIssue.identifier} - ${matchResult.matchedIssue.title}`)
    console.log(`Match confidence: ${matchResult.confidence}`)
    console.log('Linear issue details:', {
      id: matchResult.matchedIssue.id,
      identifier: matchResult.matchedIssue.identifier,
      title: matchResult.matchedIssue.title,
      state: matchResult.matchedIssue.state,
      assignee: matchResult.matchedIssue.assignee,
      labels: matchResult.matchedIssue.labels,
      project: matchResult.matchedIssue.project,
      milestone: matchResult.matchedIssue.milestone,
      githubIssue: matchResult.matchedIssue.githubIssue
    })

    // Only proceed with high or medium confidence matches
    if (matchResult.confidence === 'low') {
      console.log(`Skipping low confidence match for branch: ${branchName}`)
      return
    }

    // Create PR for the matched issue
    await createPRForLinearIssue(matchResult, repositoryData, payload, githubClient)

  } catch (error) {
    console.error('Error processing new branch:', error)
  }
}

// Create PR for Linear issue
const createPRForLinearIssue = async (
  matchResult: any,
  repositoryData: any,
  payload: any,
  githubClient: any
) => {
  try {
    console.log('=== STARTING PR CREATION PROCESS ===')
    const { repository, sender } = payload
    const { matchedIssue } = matchResult

    console.log('PR creation inputs:', {
      repository: `${repository.owner.login}/${repository.name}`,
      branchName: matchResult.branchName,
      linearIssue: {
        id: matchedIssue.id,
        identifier: matchedIssue.identifier,
        title: matchedIssue.title,
        milestone: matchedIssue.milestone,
        assignee: matchedIssue.assignee
      }
    })

    // Get default branch (usually main or master)
    // Note: githubClient is already created with app token above

    // For now, assume main branch as default
    const defaultBranch = 'main'
    console.log(`Using default branch: ${defaultBranch}`)

    // Create PR title
    const prTitle = `${matchedIssue.identifier} | ${matchedIssue.title}`
    console.log(`PR title: ${prTitle}`)

    // Generate PR description using existing infrastructure
    console.log('Generating PR description...')
    const prDescription = await generatePRDescription(matchedIssue)
    console.log(`PR description generated, length: ${prDescription.length}`)

    // Create the PR
    console.log('Creating GitHub PR...')
    const prData = await githubClient.createPullRequest(
      repository.owner.login,
      repository.name,
      {
        title: prTitle,
        head: matchResult.branchName,
        base: defaultBranch,
        body: prDescription,
        draft: true, // Create as draft initially
      }
    )

    console.log(`✅ Created PR #${prData.number} for Linear issue ${matchedIssue.identifier}`)
    console.log(`PR URL: ${prData.html_url}`)

    // Record the PR mapping in database
    console.log('Recording PR mapping in database...')
    const { createGitHubPrMapping } = api.repositories
    await fetchMutation(createGitHubPrMapping, {
      linearIssueId: matchedIssue.id,
      githubPrId: prData.id,
      githubRepositoryId: repositoryData._id,
      githubPrNumber: prData.number,
      githubPrUrl: prData.html_url,
    })
    console.log('✅ PR mapping recorded')

    // Link GitHub issue if it exists and apply labels/milestones/assignee
    console.log('=== APPLYING METADATA TO PR ===')
    await linkGitHubIssueAndApplyMetadata(prData, matchedIssue, repositoryData, githubClient)

    console.log('=== PR CREATION PROCESS COMPLETE ===')

  } catch (error) {
    console.error('❌ Error creating PR for Linear issue:', error)
  }
}

// Generate PR description using existing infrastructure
const generatePRDescription = async (issue: any): Promise<string> => {
  try {
    // Use the existing PR generation endpoint
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description,
          url: issue.url,
        },
        customInstructions: '', // Could be enhanced to include repository-specific instructions
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to generate PR description')
    }

    const data = await response.json()
    return data.text || `Related to: ${issue.title}`
  } catch (error) {
    console.error('Error generating PR description:', error)
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
    console.log('🔍 === STARTING METADATA APPLICATION ===')
    console.log('PR Data:', {
      number: prData.number,
      title: prData.title,
      html_url: prData.html_url
    })
    console.log('Linear Issue Data:', {
      id: matchedIssue.id,
      identifier: matchedIssue.identifier,
      title: matchedIssue.title,
      milestone: matchedIssue.milestone,
      assignee: matchedIssue.assignee,
      labels: matchedIssue.labels?.map((l: any) => l.name),
      project: matchedIssue.project
    })

    // Ensure repo exists; response shape not used further
    console.log('📋 Checking repository access...')
    await githubClient.getRepository(repositoryData.owner, repositoryData.name)
    console.log('✅ Repository access confirmed')

    // STEP 1: Check for existing GitHub-Linear mapping
    console.log('🔍 Looking for existing GitHub-Linear mappings...')
    const { getGitHubIssueByLinearIssue } = api.repositories
    const githubIssueMapping = await fetchQuery(getGitHubIssueByLinearIssue, {
      linearIssueId: matchedIssue.id,
      githubRepositoryId: repositoryData._id
    })

    console.log('GitHub-Linear mapping lookup result:', githubIssueMapping ? 'found' : 'not found', {
      linearIssueId: matchedIssue.id,
      repositoryId: repositoryData._id
    })

    // Check if Linear issue has GitHub integration data
    if (matchedIssue.githubIssue) {
      console.log(`✅ Found GitHub issue directly attached to Linear issue:`, matchedIssue.githubIssue)

      const sourceOwner = matchedIssue.githubIssue.owner || repositoryData.owner
      const sourceRepo = matchedIssue.githubIssue.repo || repositoryData.name

      // If issue repo differs from PR repo, link cross-repo using closing keyword reference (won't auto-close across repos, but links UI)
      if (sourceOwner !== repositoryData.owner || sourceRepo !== repositoryData.name) {
        console.log('🔗 Linking cross-repo GitHub issue to PR body with closing keyword reference')
        const updatedBody = `${prData.body}\n\nFixes ${sourceOwner}/${sourceRepo}#${matchedIssue.githubIssue.number}`
        await githubClient.updatePullRequest(
          repositoryData.owner,
          repositoryData.name,
          prData.number,
          { body: updatedBody }
        )

        // Try to mirror milestone by name from the source issue
        try {
          const appClient = getGitHubAppClient()
          const sourceOctokit = await appClient.getClientForRepo(sourceOwner, sourceRepo)
          if (sourceOctokit) {
            const { data: issue } = await sourceOctokit.issues.get({ owner: sourceOwner, repo: sourceRepo, issue_number: matchedIssue.githubIssue.number })
            if (issue.milestone?.title) {
              await applyLinearMilestoneToPR(
                repositoryData,
                prData,
                { id: '', name: issue.milestone.title },
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
                body: `Linked PR: ${prUrl}`,
              })
              console.log('✅ Added cross-repo back-reference comment on source issue')
            } catch (e) {
              console.warn('❌ Failed to add back-reference comment on source issue:', e)
            }
          }
        } catch (e) {
          console.warn('❌ Failed to mirror milestone from cross-repo issue:', e)
        }
      } else {
        // Same-repo flow as before
        console.log('🔗 Linking GitHub issue to PR...')
        await linkIssueToPR(
          repositoryData,
          prData,
          matchedIssue.githubIssue.number,
          githubClient
        )

        console.log('🏷️ Mirroring milestone from GitHub issue...')
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
              { milestone: sourceIssue.milestone.number }
            )
          }
        } catch (e) {
          console.warn('❌ Failed to mirror milestone from GitHub issue:', e)
        }
      }
    } else if (githubIssueMapping) {
      console.log(`✅ Found existing GitHub issue mapping for Linear issue ${matchedIssue.identifier}`)
      console.log('Mapping details:', {
        githubIssueId: githubIssueMapping.githubIssueId,
        linearIssueId: githubIssueMapping.linearIssueId
      })

      // Link the GitHub issue to the PR
      console.log('🔗 Linking GitHub issue to PR...')
      await linkIssueToPR(
        repositoryData,
        prData,
        githubIssueMapping.githubIssueId,
        githubClient
      )

      // Mirror milestone from the mapped GitHub issue onto the PR
      console.log('🏷️ Mirroring milestone from mapped GitHub issue...')
      try {
        const sourceIssue = await githubClient.getIssue(
          repositoryData.owner,
          repositoryData.name,
          githubIssueMapping.githubIssueId
        )
        console.log('Source GitHub issue details:', {
          number: sourceIssue.number,
          title: sourceIssue.title,
          milestone: sourceIssue.milestone
        })

        if (sourceIssue.milestone) {
          console.log(`Found milestone #${sourceIssue.milestone.number} on GitHub issue`)
          await githubClient.updateIssue(
            repositoryData.owner,
            repositoryData.name,
            prData.number,
            { milestone: sourceIssue.milestone.number }
          )
          console.log(`✅ Applied milestone #${sourceIssue.milestone.number} to PR #${prData.number}`)
        } else {
          console.log('⚠️ No milestone found on source GitHub issue')
        }
      } catch (e) {
        console.warn('❌ Failed to mirror milestone from mapped issue:', e)
      }
    } else {
      console.log(`❌ No GitHub issue found for Linear issue ${matchedIssue.identifier}`)
      console.log('This could be because:')
      console.log('- Linear issue is not synced with GitHub yet')
      console.log('- GitHub integration data is not available on Linear issue')
      console.log('- externalId field is not populated')
    }

    // STEP 2: Apply labels from Linear issue to GitHub PR
    console.log('🏷️ === APPLYING LABELS ===')
    console.log('Linear labels to apply:', matchedIssue.labels?.map((l: any) => l.name))
    if (matchedIssue.labels && matchedIssue.labels.length > 0) {
      await ensureAndApplyLabelsToPR(repositoryData, prData, matchedIssue.labels, githubClient)
    } else {
      console.log('⚠️ No labels found on Linear issue')
    }

    // STEP 3: Try to assign PR to a matching GitHub user
    console.log('👤 === ASSIGNING PR ===')
    await tryAssignPRAssignee(repositoryData, prData, matchedIssue, githubClient)

    // STEP 4: Apply milestone from Linear issue if available
    console.log('🎯 === APPLYING MILESTONE ===')
    if (matchedIssue.milestone) {
      console.log(`Found Linear milestone: "${matchedIssue.milestone.name}"`)
      await applyLinearMilestoneToPR(repositoryData, prData, matchedIssue.milestone, githubClient)
    } else {
      console.log('⚠️ No milestone found on Linear issue')
    }

    console.log('✅ === METADATA APPLICATION COMPLETE ===')

  } catch (error) {
    console.error('❌ Error linking GitHub issue and applying metadata:', error)
  }
}

// Apply Linear milestone to PR by finding/creating matching GitHub milestone
const applyLinearMilestoneToPR = async (
  repositoryData: any,
  prData: any,
  linearMilestone: any,
  githubClient: any
) => {
  try {
    console.log(`🔍 Looking for GitHub milestone matching Linear milestone: "${linearMilestone.name}"`)

    // Get all GitHub milestones for the repository
    const githubMilestones = await githubClient.getMilestones(
      repositoryData.owner,
      repositoryData.name
    )

    console.log('GitHub milestones found:', githubMilestones.map((m: any) => ({ number: m.number, title: m.title })))

    // Look for exact match by title
    let matchingMilestone = githubMilestones.find((m: any) =>
      m.title.toLowerCase() === linearMilestone.name.toLowerCase()
    )

    // If not found, create it
    if (!matchingMilestone) {
      console.log(`Creating new GitHub milestone: "${linearMilestone.name}"`)
      try {
        matchingMilestone = await githubClient.createMilestone(
          repositoryData.owner,
          repositoryData.name,
          { title: linearMilestone.name }
        )
        console.log(`✅ Created GitHub milestone #${matchingMilestone.number}: "${linearMilestone.name}"`)
      } catch (e) {
        console.warn(`❌ Failed to create milestone "${linearMilestone.name}":`, e)
        return
      }
    } else {
      console.log(`✅ Found existing GitHub milestone #${matchingMilestone.number}: "${linearMilestone.name}"`)
    }

    // Apply the milestone to the PR
    console.log(`🏷️ Applying milestone #${matchingMilestone.number} to PR #${prData.number}`)
    await githubClient.updateIssue(
      repositoryData.owner,
      repositoryData.name,
      prData.number,
      { milestone: matchingMilestone.number }
    )

    console.log(`✅ Successfully applied milestone "${linearMilestone.name}" to PR #${prData.number}`)

  } catch (error) {
    console.error('❌ Error applying Linear milestone to PR:', error)
  }
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
      console.log(`GitHub issue #${githubIssueNumber} not found`)
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

    console.log(`Linked GitHub issue #${githubIssueNumber} to PR #${prData.number}`)

  } catch (error) {
    console.error('Error linking GitHub issue to PR:', error)
  }
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
    console.log('Starting label application process:', {
      prNumber: prData.number,
      targetLabelNames,
      linearLabelsCount: linearLabels.length
    })

    // Ensure labels exist; create if missing
    const existing = await githubClient.getLabels(
      repositoryData.owner,
      repositoryData.name
    )
    const existingSet = new Set(existing.map((l: any) => l.name.toLowerCase()))

    console.log('Existing GitHub labels:', existing.map((l: any) => l.name))

    for (const name of targetLabelNames) {
      if (!existingSet.has(name.toLowerCase())) {
        try {
          await githubClient.createLabel(
            repositoryData.owner,
            repositoryData.name,
            { name }
          )
          console.log('Created missing GitHub label:', name)
        } catch (e) {
          console.warn('Failed to create label (may already exist):', name, e)
        }
      }
    }

    // Apply labels to PR (Issues and PRs share the same labels API)
    await githubClient.request(
      `/repos/${repositoryData.owner}/${repositoryData.name}/issues/${prData.number}/labels`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: targetLabelNames })
      }
    )

    console.log(`Applied ${targetLabelNames.length} labels to PR #${prData.number}`)

  } catch (error) {
    console.error('Error applying labels to PR:', error)
  }
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
    console.log('Attempting to assign PR assignee:', {
      prNumber: prData.number,
      linearAssigneeName: assigneeName,
      hasAssignee: !!matchedIssue.assignee
    })

    if (!assigneeName) {
      console.log('No Linear assignee to match')
      return
    }

    const candidates = await githubClient.listAssignees(
      repositoryData.owner,
      repositoryData.name
    )

    console.log('GitHub assignees available:', candidates.map((u: any) => u.login))

    // Match by login if name is a substring; fallback exact, case-insensitive
    const login = candidates.find((u: any) =>
      u.login.toLowerCase() === assigneeName.toLowerCase() ||
      assigneeName.toLowerCase().includes(u.login.toLowerCase()) ||
      u.login.toLowerCase().includes(assigneeName.toLowerCase())
    )?.login

    if (!login) {
      console.log(`No matching GitHub assignee found for "${assigneeName}"`)
      return
    }

    await githubClient.addAssignees(
      repositoryData.owner,
      repositoryData.name,
      prData.number,
      [login]
    )
    console.log(`Assigned PR #${prData.number} to ${login}`)
  } catch (e) {
    console.warn('Failed to assign PR assignee:', e)
  }
}
