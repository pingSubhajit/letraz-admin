import {NextRequest, NextResponse} from 'next/server'
import {clerkClient} from '@clerk/nextjs/server'

export const POST = async (request: NextRequest) => {
	try {
		// Extract admin API key from headers
		const adminApiKey = request.headers.get('x-admin-api-key')

		// Verify admin API key
		const expectedApiKey = process.env.CONSUMER_API_KEY
		if (!expectedApiKey) {
			return NextResponse.json(
				{error: 'Server configuration error: CONSUMER_API_KEY not set'},
				{status: 500}
			)
		}

		if (!adminApiKey || adminApiKey !== expectedApiKey) {
			return NextResponse.json(
				{error: 'Unauthorized: Invalid admin API key'},
				{status: 401}
			)
		}

		// Extract email from request body
		const body = await request.json().catch(() => null)
		if (!body || !body.email) {
			return NextResponse.json(
				{error: 'Missing required parameter: email'},
				{status: 400}
			)
		}

		const email = body.email.trim()

		// Validate email format
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
		if (!emailRegex.test(email)) {
			return NextResponse.json(
				{error: 'Invalid email format'},
				{status: 400}
			)
		}

		try {
			// Add email to Clerk's allowlist
			const clerk = await clerkClient()
			await clerk.allowlistIdentifiers.createAllowlistIdentifier({
				identifier: email,
				notify: false // Don't send notification emails
			})

			return NextResponse.json({
				success: true,
				message: `Email ${email} has been added to the allowlist`,
				email: email
			})

		} catch (clerkError: any) {
			/*
			 * Handle Clerk API errors
			 * If the email is already in the allowlist, Clerk might return an error
			 */
			if (clerkError?.status === 422 || clerkError?.message?.includes('already exists')) {
				return NextResponse.json({
					success: false,
					error: 'Email is already in the allowlist',
					email: email
				}, {status: 409}) // 409 Conflict
			}

			throw clerkError
		}

	} catch (error: any) {
		return NextResponse.json(
			{
				error: 'Internal server error while adding email to allowlist',
				details: process.env.NODE_ENV === 'development' ? error.message : undefined
			},
			{status: 500}
		)
	}
}

