'use client'

import useLinearClient from '@/hooks/useLinearClient'
import IssueSelect from '@/components/generate-pr/IssueSelect'
import {Button} from '@/components/ui/button'
import {useState} from 'react'

const Content = () => {
	const {issues, isLoading, error} = useLinearClient()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

	const handleGeneratePR = () => {
		if (!selectedIssueId) return
		// PR generation logic will go here
	}

	return (
		<div className="container mx-auto py-8 px-4 max-w-2xl">
			<div className="space-y-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-2">Generate PR Description</h1>
					<p className="text-gray-500 dark:text-gray-400">
						Select a Linear issue to generate a PR description
					</p>
				</div>

				<div className="space-y-4">
					<IssueSelect
						issues={issues}
						isLoading={isLoading}
						error={error}
						onSelect={setSelectedIssueId}
					/>

					<Button
						className="w-full"
						size="lg"
						disabled={!selectedIssueId || isLoading}
						onClick={handleGeneratePR}
					>
						Generate PR Description
					</Button>
				</div>
			</div>
		</div>
	)
}

export default Content 