'use client'

import {useCallback, useEffect, useState} from 'react'
import {getCookie, deleteCookie} from 'cookies-next'

type LinearAuthHook = {
	isAuthenticated: boolean
	isLoading: boolean
	logout: () => void
}

const useLinearAuth = (): LinearAuthHook => {
	const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		const token = getCookie('linear_access_token')
		setIsAuthenticated(!!token)
		setIsLoading(false)
	}, [])

	const logout = useCallback(() => {
		deleteCookie('linear_access_token')
		setIsAuthenticated(false)
	}, [])

	return {
		isAuthenticated,
		isLoading,
		logout
	}
}

export default useLinearAuth
