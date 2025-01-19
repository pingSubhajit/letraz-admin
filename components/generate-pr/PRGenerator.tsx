'use client'

import useLinearClient from '@/hooks/useLinearClient'
import IssueSelect from '@/components/generate-pr/IssueSelect'
import {Button} from '@/components/ui/button'
import {useState} from 'react'

const PRGenerator = () => {
	const {issues, isLoading, error} = useLinearClient()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)

	const handleGeneratePR = () => {
		if (!selectedIssueId) return
		// PR generation logic will go here
	}

	return (
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
	)
}

export default PRGenerator
