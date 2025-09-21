import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

type ErrorResponse = {
  error: string
}

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieStore = await cookies()

  if (!code) {
    return NextResponse.json<ErrorResponse>(
      { error: 'No code provided' },
      { status: 400 }
    )
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        redirect_uri: process.env.NEXT_PUBLIC_APP_URL + '/api/github/callback',
      })
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || tokenData.error) {
      throw new Error(tokenData.error || 'Failed to exchange code for token')
    }

    if (!tokenData.access_token) {
      throw new Error('No access token received')
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Letraz-Admin/1.0'
      }
    })

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info from GitHub')
    }

    const userData = await userResponse.json()

    // Store GitHub token and user info in cookies
    const response = NextResponse.redirect(
      new URL('/settings', request.url)
    )

    // Store GitHub access token (in production, encrypt this)
    cookieStore.set('github_access_token', tokenData.access_token, {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    // Store GitHub user info
    cookieStore.set('github_user', JSON.stringify({
      id: userData.id,
      login: userData.login,
      name: userData.name,
      email: userData.email,
      avatar_url: userData.avatar_url,
    }), {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return response
  } catch (error) {
    console.error('GitHub OAuth error:', error)
    return NextResponse.redirect(
      new URL('/settings?error=github_oauth_failed', request.url)
    )
  }
}
