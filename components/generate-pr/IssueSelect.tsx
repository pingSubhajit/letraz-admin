'use client'

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {Button} from '@/components/ui/button'
import {ChevronDown} from 'lucide-react'
import {useState} from 'react'
import {Issue} from '@linear/sdk'

type IssueSelectProps = {
	issues: Issue[]
	isLoading: boolean
	error: string | null
	onSelect: (issueId: string) => void
}

const IssueSelect = ({issues, isLoading, error, onSelect}: IssueSelectProps) => {
	const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)

	if (error) {
		return (
			<div className="p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg">
				{error}
			</div>
		)
	}

	const handleSelect = (issue: Issue) => {
		setSelectedIssue(issue)
		onSelect(issue.id)
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					className="w-full justify-between"
					disabled={isLoading}
				>
					<span className="truncate">
						{isLoading
							? 'Loading issues...'
							: selectedIssue
								? `${selectedIssue.identifier}: ${selectedIssue.title}`
								: 'Select an issue'}
					</span>
					<ChevronDown className="ml-2 h-4 w-4 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-full min-w-[300px] max-h-[300px] overflow-auto">
				{issues.length === 0 ? (
					<DropdownMenuItem disabled>
						No in-progress issues found
					</DropdownMenuItem>
				) : (
					issues.map(issue => (
						<DropdownMenuItem
							key={issue.id}
							onSelect={() => handleSelect(issue)}
							className="flex items-center justify-between"
						>
							<span className="truncate">
								{issue.identifier}: {issue.title}
							</span>
						</DropdownMenuItem>
					))
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export default IssueSelect
