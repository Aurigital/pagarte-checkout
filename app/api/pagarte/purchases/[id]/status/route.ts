import { NextRequest, NextResponse } from 'next/server'
import { getPurchase, updatePurchase } from '@/lib/purchases'
import { getCheckoutSession } from '@/lib/pagarte'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Status for the confirmation page.
 *
 * Reads our own record first. If it is still pending but a session exists, it
 * reconciles against PagArte — useful when the buyer gets back before the
 * webhook lands, or when the webhook never arrived (e.g. no public URL in dev).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const purchase = getPurchase(params.id)

  if (!purchase) {
    return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 })
  }

  if (purchase.status === 'PENDING' && purchase.sessionId) {
    try {
      const session = await getCheckoutSession(purchase.sessionId)

      if (session.status === 'CONFIRMED') {
        updatePurchase(purchase.id, { status: 'CONFIRMED' })
      } else if (session.status === 'CANCELLED') {
        updatePurchase(purchase.id, { status: 'CANCELLED' })
      } else if (session.status === 'EXPIRED') {
        updatePurchase(purchase.id, { status: 'EXPIRED' })
      } else if (session.status === 'FAILED') {
        updatePurchase(purchase.id, { status: 'FAILED' })
      }
    } catch (err) {
      // Reconciliation is best-effort: report what we have.
      console.error('[pagarte/status]', purchase.id, (err as Error).message)
    }
  }

  const current = getPurchase(params.id)!

  return NextResponse.json({
    success: true,
    purchaseId: current.id,
    status: current.status,
    amountMinor: current.amountMinor,
    currency: current.currency,
    description: current.description,
  })
}
