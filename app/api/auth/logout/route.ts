import { NextResponse } from 'next/server'
import { TOKEN_COOKIE } from '@/lib/auth'

export async function POST(): Promise<NextResponse<{ success: true }>> {
  const response = NextResponse.json<{ success: true }>({ success: true })
  response.cookies.set(TOKEN_COOKIE, '', {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: 0,
  })
  return response
}
