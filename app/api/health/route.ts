import { NextResponse } from 'next/server'
import { isPersistent, redisSource } from '@/lib/purchases'
import { pagarteConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public health check. Reports configuration state only — never secrets.
 *
 * `persistent: false` means purchases live in memory and will be lost on a
 * cold start, which also makes webhooks unreliable. See docs/PERSISTENCIA.md.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    persistent: isPersistent,
    storage: redisSource ?? 'in-memory (se pierde al reiniciar)',
    mode: pagarteConfig.isLiveMode
      ? 'LIVE'
      : pagarteConfig.isTestMode
        ? 'SANDBOX'
        : 'NOT_CONFIGURED',
    storeOrigin: pagarteConfig.storeOrigin,
    widgetConfigured: Boolean(pagarteConfig.widgetId),
  })
}
