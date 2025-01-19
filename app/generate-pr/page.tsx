import {Metadata} from 'next'
import AuthWrapper from '@/components/generate-pr/auth-wrapper'
import PRGenerator from '@/components/generate-pr/PRGenerator'

export const metadata: Metadata = {
	title: 'Generate PR | Letraz Admin',
	description: 'Generate pull request descriptions from Linear issues',
	openGraph: {
		title: 'Generate PR | Letraz Admin',
		description: 'Generate pull request descriptions from Linear issues',
		type: 'website'
	}
}

const GeneratePRPage = () => (
	<div className="container mx-auto py-8 px-4 max-w-2xl">
		<AuthWrapper>
			<div className="space-y-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-2">Generate PR Description</h1>
					<p className="text-gray-500 dark:text-gray-400">
						Select a Linear issue to generate a PR description
					</p>
				</div>
				<PRGenerator />
			</div>
		</AuthWrapper>
	</div>
)

export default GeneratePRPage
