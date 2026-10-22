import { NextRequest, NextResponse } from 'next/server'
import { TOKEN_COOKIE, hashPassword, safeEqual } from '@/lib/auth'

// Rutas que no requieren autenticación
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
])

/**
 * El comprador que abre un link de pago NO está autenticado, así que la página
 * de pago y los endpoints que su SDK llama deben ser públicos. El webhook
 * también: PagArte se autentica con una firma Ed25519, no con nuestra cookie.
 */
function isPublicPagartePath(pathname: string): boolean {
  if (pathname === '/api/pagarte/webhook') return true
  if (pathname === '/api/health') return true
  // /pay/<id> y /pay/<id>/processing
  if (/^\/pay\/[^/]+(\/processing)?$/.test(pathname)) return true
  // /api/pagarte/purchases/<id>/(checkout|checkout/cancel|status)
  if (/^\/api\/pagarte\/purchases\/[^/]+\/(checkout(\/cancel)?|status)$/.test(pathname)) {
    return true
  }
  return false
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (isPublicPagartePath(pathname)) return true
  if (pathname.startsWith('/_next/')) return true
  if (pathname.startsWith('/api/auth/')) return true
  if (
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname.startsWith('/icon-')
  ) return true
  return false
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value

  if (!token) {
    return redirectToLogin(request)
  }

  const envPassword = process.env.AUTH_PASSWORD
  if (!envPassword) {
    // Mal configurado — dejamos pasar para no bloquear el acceso, pero lo avisamos
    console.error('[middleware] AUTH_PASSWORD is not set')
    return NextResponse.next()
  }

  const expectedToken = await hashPassword(envPassword)

  if (!safeEqual(token, expectedToken)) {
    return redirectToLogin(request)
  }

  return NextResponse.next()
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?|ttf)).*)'],
}
