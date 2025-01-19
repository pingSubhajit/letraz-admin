'use client'

import useLinearClient from '@/hooks/useLinearClient'
import IssueSelect from '@/components/generate-pr/IssueSelect'
import {Button} from '@/components/ui/button'
import {useState} from 'react'
import {GitPullRequest, Filter} from 'lucide-react'
import {SiLinear} from 'react-icons/si'

const PRGenerator = () => {
	const {issues, isLoading, error} = useLinearClient()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

	const handleGeneratePR = () => {
		if (!selectedIssueId) return
		// PR generation logic will go here
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 px-1">
				<Filter className="h-3.5 w-3.5 text-neutral-400" />
				<p className="text-sm text-neutral-500 dark:text-neutral-400">
					Filtered to show in-progress issues assigned to you
				</p>
			</div>

			<div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
				<div className="p-5">
					<div className="space-y-1.5">
						<div className="flex items-center gap-1.5 mb-2">
							<SiLinear className="h-3 w-3" />
							<label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
								Linear Issue
							</label>
						</div>
						<IssueSelect
							issues={issues}
							isLoading={isLoading}
							error={error}
							onSelect={setSelectedIssueId}
						/>
					</div>
				</div>
				<div className="border-t border-neutral-200 dark:border-neutral-800">
					<div className="p-4 flex items-center justify-between">
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							{selectedIssueId
								? 'Ready to generate PR description'
								: 'Select an in-progress issue to continue'}
						</p>
						<Button
							className="bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 dark:text-neutral-900"
							disabled={!selectedIssueId || isLoading}
							onClick={handleGeneratePR}
						>
							<GitPullRequest className="mr-2 h-4 w-4" />
							Generate Description
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

export default PRGenerator
