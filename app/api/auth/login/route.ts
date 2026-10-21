import { NextRequest, NextResponse } from 'next/server'
import { generateToken, hashPassword, safeEqual, TOKEN_COOKIE } from '@/lib/auth'

type SuccessResponse = { success: true }
type ErrorResponse = { success: false; error: string }

export async function POST(
  request: NextRequest
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { password } = (body ?? {}) as { password?: unknown }

  if (!password || typeof password !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Password is required' },
      { status: 400 }
    )
  }

  const envPassword = process.env.AUTH_PASSWORD
  if (!envPassword) {
    console.error('[auth/login] AUTH_PASSWORD is not configured')
    return NextResponse.json(
      { success: false, error: 'Server misconfiguration' },
      { status: 500 }
    )
  }

  // Compare SHA-256(submitted) === SHA-256(env password)
  const submittedHash = await hashPassword(password)
  const expectedHash = await hashPassword(envPassword)

  if (!safeEqual(submittedHash, expectedHash)) {
    return NextResponse.json(
      { success: false, error: 'Contraseña incorrecta' },
      { status: 401 }
    )
  }

  // Token = SHA-256(password) — deterministic, no storage needed
  const token = await generateToken(envPassword)

  const response = NextResponse.json<SuccessResponse>({ success: true })
  response.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
