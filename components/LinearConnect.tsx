'use client'

import {Button} from '@/components/ui/button'
import {SiLinear} from 'react-icons/si'
import {useState} from 'react'
import {cn} from '@/lib/utils'
import useLinearAuth from '@/hooks/useLinearAuth'
import {useSearchParams} from 'next/navigation'

const LinearConnect = () => {
	const [isConnecting, setIsConnecting] = useState(false)
	const {isAuthenticated, logout, isLoading} = useLinearAuth()
	const searchParams = useSearchParams()
	const error = searchParams.get('error')

	const handleConnect = async () => {
		setIsConnecting(true)
		try {
			const params = new URLSearchParams({
				client_id: process.env.NEXT_PUBLIC_LINEAR_CLIENT_ID!,
				redirect_uri: 'http://localhost:3000/api/linear/callback',
				response_type: 'code',
				state: crypto.randomUUID(),
				scope: 'read'
			})

			window.location.href = `https://linear.app/oauth/authorize?${params.toString()}`
		} catch (error) {
			setIsConnecting(false)
		}
	}

	if (isLoading) {
		return <div>Loading...</div>
	}


	return (
		<div className="space-y-4">
			<div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
				{error && (
					<div className="mb-4 p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg">
						{error}
					</div>
				)}

				{isAuthenticated ? (
					<Button
						onClick={logout}
						className={cn(
							'w-full relative',
							'hover:bg-red-50 dark:hover:bg-red-900/10',
							'transition-all duration-200 ease-in-out'
						)}
						variant="outline"
						size="lg"
					>
						<SiLinear className="mr-2 h-5 w-5" />
						<span>Disconnect Linear Account</span>
					</Button>
				) : (
					<Button
						onClick={handleConnect}
						disabled={isConnecting}
						className={cn(
							'w-full relative',
							'hover:bg-gray-100 dark:hover:bg-gray-700',
							'transition-all duration-200 ease-in-out'
						)}
						variant="outline"
						size="lg"
					>
						<SiLinear className="mr-2 h-5 w-5" />
						<span>{isConnecting ? 'Connecting...' : 'Connect Linear Account'}</span>
					</Button>
				)}

				<p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
					{isAuthenticated
						? 'Your Linear account is connected'
						: 'By connecting, you will be able to access your Linear issues and create PRs automatically'}
				</p>
			</div>

			<div className="text-xs text-center text-gray-400">
				Your data is secure and we only request necessary permissions
			</div>
		</div>
	)
}

export default LinearConnect
