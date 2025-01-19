'use server'

import {cookies} from 'next/headers'

export const checkLinearAuth = async () => {
	const cookieStore = cookies()
	const token = cookieStore.get('linear_access_token')

	return {
		isAuthenticated: Boolean(token),
		token: token?.value
	}
}
