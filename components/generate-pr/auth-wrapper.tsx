'use client'

import LinearConnect from '@/components/LinearConnect'
import useLinearAuth from '@/hooks/useLinearAuth'

type AuthWrapperProps = {
  children: React.ReactNode
}

const AuthWrapper = ({children}: AuthWrapperProps) => {
	const {isAuthenticated, isLoading} = useLinearAuth()

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-gray-500">Loading...</div>
			</div>
		)
	}

	if (!isAuthenticated) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="w-full max-w-md p-8 space-y-6">
					<div className="text-center space-y-2">
						<h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
							Connect to Linear
						</h1>
						<p className="text-gray-500 dark:text-gray-400">
							Link your Linear account to start generating PRs automatically
						</p>
					</div>
					<LinearConnect />
				</div>
			</div>
		)
	}

	return children
}

export default AuthWrapper
