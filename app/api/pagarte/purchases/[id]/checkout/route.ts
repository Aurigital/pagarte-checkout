import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession, PagarteError } from '@/lib/pagarte'
import { getPurchase, updatePurchase } from '@/lib/purchases'

export const runtime = 'nodejs'

/**
 * The SDK's `fetchSession` calls this. It returns ONLY the three fields the
 * browser is allowed to see — never the secret key or the raw API response.
 *
 * Public on purpose: the buyer opening a pay link is not logged in. In a real
 * store this is where you would check the user may pay this purchase.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const purchase = getPurchase(params.id)

  if (!purchase) {
    return NextResponse.json(
      { success: false, error: 'Purchase not found' },
      { status: 404 }
    )
  }

  if (purchase.status === 'CONFIRMED') {
    return NextResponse.json(
      { success: false, error: 'This purchase was already paid' },
      { status: 409 }
    )
  }

  try {
    const session = await createCheckoutSession({
      merchantOrderId: purchase.id,
      amountMinor: purchase.amountMinor,
      // Reusing the active attempt's key returns the SAME session, which is
      // what lets the buyer reload the page and carry on paying.
      idempotencyKey: purchase.idempotencyKey,
    })

    updatePurchase(purchase.id, { sessionId: session.sessionId })

    return NextResponse.json(session)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[pagarte/checkout]', purchase.id, message)

    const status = err instanceof PagarteError && err.statusCode ? 502 : 500
    return NextResponse.json({ success: false, error: message }, { status })
  }
}
