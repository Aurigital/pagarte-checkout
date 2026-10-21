/**
 * Auth helpers — Edge + Node compatible (uses Web Crypto API).
 *
 * Token strategy: token = SHA-256(AUTH_PASSWORD) as hex.
 * Stateless: no storage needed. Logout just clears the cookie.
 */

export const TOKEN_COOKIE = 'pl_token'

/** Returns the hex SHA-256 digest of a UTF-8 string. */
export async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Constant-time comparison of two hex strings.
 * Prevents timing attacks even though this is a simple internal tool.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Verify a plaintext password against a pre-computed SHA-256 hex hash. */
export async function verifyPassword(
  plaintext: string,
  expectedHash: string
): Promise<boolean> {
  const hash = await hashPassword(plaintext)
  return safeEqual(hash, expectedHash)
}

/**
 * Derives the session token from the password.
 * Token = SHA-256(password) — deterministic, no DB needed.
 */
export async function generateToken(password: string): Promise<string> {
  return hashPassword(password)
}
