'use client'

import useLinearClient from '@/hooks/useLinearClient'
import IssueSelect from '@/components/generate-pr/IssueSelect'
import {Button} from '@/components/ui/button'
import {useState} from 'react'
import {GitPullRequest, Filter, Copy, Check, ChevronDown, Settings2} from 'lucide-react'
import {SiLinear} from 'react-icons/si'
import {Textarea} from '@/components/ui/textarea'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger
} from '@/components/ui/dialog'
import {cn} from '@/lib/utils'

const CustomInstructionsDialog = ({
	value,
	onChange
}: {
	value: string
	onChange: (value: string) => void
}) => {
	const [localValue, setLocalValue] = useState(value)
	const [open, setOpen] = useState(false)

	const handleSave = () => {
		onChange(localValue)
		setOpen(false)
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 hover:bg-transparent transition-colors group flex items-center gap-1.5"
				>
					<Settings2 className="h-3 w-3 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" />
					<span className="text-xs text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors">
						Custom Instructions
					</span>
					{value && (
						<div className="relative flex h-1.5 w-1.5">
							<div className="absolute h-1.5 w-1.5 rounded-full bg-green-400 dark:bg-green-500 animate-pulse blur-[1px]" />
							<div className="absolute h-1.5 w-1.5 rounded-full bg-green-400/30 dark:bg-green-500/30 blur-[3px]" />
							<div className="h-1.5 w-1.5 rounded-full bg-green-400 dark:bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.5)] dark:shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
						</div>
					)}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[600px] bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl backdrop-saturate-150 border-neutral-200/80 dark:border-neutral-800/80">
				<DialogHeader>
					<DialogTitle className="text-xl font-medium">Custom Instructions</DialogTitle>
					<p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1.5">
						Customize how your PR descriptions are generated
					</p>
				</DialogHeader>
				<div className="space-y-4 pt-3">
					<div className="space-y-3">
						<div className="flex flex-col space-y-1.5">
							<label
								htmlFor="instructions"
								className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
							>
								Instructions
							</label>
							<p className="text-xs text-neutral-500 dark:text-neutral-400">
								Add specific requirements or focus areas for the PR description
							</p>
						</div>
						<Textarea
							id="instructions"
							placeholder="E.g., Focus on security implications, Include performance considerations, Highlight API changes..."
							value={localValue}
							onChange={e => setLocalValue(e.target.value)}
							className="min-h-[180px] resize-none bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600"
						/>
					</div>
					<div className="rounded-lg border border-neutral-200/80 dark:border-neutral-800/80 bg-neutral-50/50 dark:bg-neutral-950/50 p-3">
						<h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							Example Instructions
						</h4>
						<ul className="space-y-1">
							{[
								'Focus on security implications and potential vulnerabilities',
								'Include performance impact and optimization details',
								'Highlight breaking changes and migration steps',
								'Emphasize testing requirements and coverage'
							].map(example => (
								<li
									key={example}
									className="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5"
								>
									<span className="block h-1 w-1 rounded-full bg-neutral-300 dark:bg-neutral-700" />
									{example}
								</li>
							))}
						</ul>
					</div>
					<div className="flex items-center justify-end gap-3 pt-2">
						<Button
							variant="ghost"
							onClick={() => setOpen(false)}
							className="text-neutral-600 dark:text-neutral-400"
						>
							Cancel
						</Button>
						<Button variant={'secondary'} onClick={handleSave}>Save Instructions</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}

const PRGenerator = () => {
	const {issues, isLoading, error: linearError} = useLinearClient()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)
	const [isGenerating, setIsGenerating] = useState(false)
	const [completion, setCompletion] = useState<string | null>(null)
	const [generationError, setGenerationError] = useState<string | null>(null)
	const [customInstructions, setCustomInstructions] = useState('')
	const [isCustomInstructionsOpen, setIsCustomInstructionsOpen] = useState(false)

	const selectedIssue = issues.find(issue => issue.id === selectedIssueId)

	const handleGeneratePR = async () => {
		if (!selectedIssue) return
		setIsGenerating(true)
		setGenerationError(null)
		try {
			const response = await fetch('/api/generate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					issue: selectedIssue,
					customInstructions: customInstructions.trim()
				})
			})

			const data = await response.json()

			if (!response.ok) {
				throw new Error(data.error || 'Failed to generate PR description')
			}

			setCompletion(data.text)
		} catch (err) {
			setGenerationError(err instanceof Error ? err.message : 'Something went wrong')
		} finally {
			setIsGenerating(false)
		}
	}

	const copyToClipboard = () => {
		if (!completion) return
		navigator.clipboard.writeText(completion)
		setCopied(true)
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2 px-1">
				<Filter className="h-3.5 w-3.5 text-neutral-400" />
				<p className="text-sm text-neutral-500 dark:text-neutral-400">
					Filtered to show in-progress issues assigned to you
				</p>
			</div>

			<div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
				<div className="p-5">
					<div className="space-y-1.5">
						<div className="flex items-center justify-between mb-2">
							<div className="flex items-center gap-1.5">
								<SiLinear className="h-3 w-3" />
								<label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
									Linear Issue
								</label>
							</div>
							<CustomInstructionsDialog
								value={customInstructions}
								onChange={setCustomInstructions}
							/>
						</div>
						<IssueSelect
							issues={issues}
							isLoading={isLoading}
							error={linearError}
							onSelect={setSelectedIssueId}
						/>
					</div>
				</div>

				{isGenerating && (
					<div className="border-t border-neutral-200 dark:border-neutral-800">
						<div className="p-5">
							<div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-8">
								<div className="flex flex-col items-center justify-center gap-3">
									<div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-800 border-t-transparent dark:border-neutral-200 dark:border-t-transparent" />
									<p className="text-sm text-neutral-600 dark:text-neutral-400">
										Generating PR description...
									</p>
								</div>
							</div>
						</div>
					</div>
				)}

				{completion && !isGenerating && (
					<div className="border-t border-neutral-200 dark:border-neutral-800">
						<div className="p-5">
							<div className="relative">
								<div className="absolute right-4 top-4">
									<Button
										variant="outline"
										size="icon"
										onClick={copyToClipboard}
										className="h-8 w-8"
									>
										{copied ? (
											<Check className="h-4 w-4 text-green-500" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
								<div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-4">
									<pre className="text-sm whitespace-pre-wrap font-mono text-neutral-900 dark:text-neutral-100">
										{completion}
									</pre>
								</div>
							</div>
						</div>
					</div>
				)}

				{generationError && (
					<div className="border-t border-neutral-200 dark:border-neutral-800">
						<div className="p-5">
							<div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3">
								<p className="text-sm text-red-600 dark:text-red-400">
									{generationError}
								</p>
							</div>
						</div>
					</div>
				)}

				<div className="border-t border-neutral-200 dark:border-neutral-800">
					<div className="p-4 flex items-center justify-between">
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							{completion
								? 'PR description generated successfully'
								: selectedIssueId
									? 'Ready to generate PR description'
									: 'Select an in-progress issue to continue'}
						</p>
						<Button
							disabled={!selectedIssueId || isGenerating}
							onClick={handleGeneratePR}
							variant="secondary"
							size="sm"
							className="h-8 px-3 text-xs font-medium"
						>
							<GitPullRequest className="h-3.5 w-3.5" />
							{isGenerating ? 'Generating...' : 'Generate Description'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}

export default PRGenerator
