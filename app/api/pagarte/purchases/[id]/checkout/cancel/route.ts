import { NextRequest, NextResponse } from 'next/server'
import { cancelCheckoutSession, PagarteError } from '@/lib/pagarte'
import { getPurchase, updatePurchase } from '@/lib/purchases'

export const runtime = 'nodejs'

/** Called by the SDK's onClose when it could not cancel by itself. */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const purchase = getPurchase(params.id)

  if (!purchase) {
    return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 })
  }
  if (!purchase.sessionId) {
    return NextResponse.json({ success: false, error: 'No active session' }, { status: 409 })
  }

  try {
    const session = await cancelCheckoutSession(
      purchase.sessionId,
      `${purchase.idempotencyKey}-cancel`
    )

    updatePurchase(purchase.id, { status: 'CANCELLED' })

    return NextResponse.json({ success: true, status: session.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[pagarte/cancel]', purchase.id, message)

    // A payment already in progress cannot be cancelled — that is not our bug.
    if (err instanceof PagarteError && err.code === 'CHECKOUT_PAYMENT_IN_PROGRESS') {
      return NextResponse.json({ success: false, error: message }, { status: 409 })
    }

    const status = err instanceof PagarteError && err.statusCode ? 502 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
