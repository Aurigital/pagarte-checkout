import { NextRequest, NextResponse } from 'next/server'
import {
  verifyPagarteWebhook,
  type PagarteWebhookEvent,
} from '@/lib/pagarte-webhook'
import {
  getPurchase,
  updatePurchase,
  hasProcessedEvent,
  markEventProcessed,
  type PurchaseStatus,
} from '@/lib/purchases'
import { pagarteConfig } from '@/lib/config'

// node:crypto is required for Ed25519, so this cannot run on Edge.
export const runtime = 'nodejs'
// Never cache or statically optimize a webhook receiver.
export const dynamic = 'force-dynamic'

const STATUS_BY_EVENT: Record<string, PurchaseStatus> = {
  'checkout.payment.confirmed': 'CONFIRMED',
  'checkout.cancelled': 'CANCELLED',
  'checkout.expired': 'EXPIRED',
}

export async function POST(request: NextRequest) {
  // 1. Read the RAW body. The signature covers these exact bytes, so parsing
  //    first and re-serializing would break verification.
  const rawBody = Buffer.from(await request.arrayBuffer())
  const signature = request.headers.get('Pagarte-Signature')

  // 2. Verify the signature before trusting anything in the body.
  const valid = await verifyPagarteWebhook(rawBody, signature)
  if (!valid) {
    console.error('[pagarte/webhook] invalid signature')
    return new NextResponse('Invalid signature', { status: 400 })
  }

  let event: PagarteWebhookEvent
  try {
    event = JSON.parse(rawBody.toString('utf8')) as PagarteWebhookEvent
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 })
  }

  // A valid signature proves the event came from PagArte — not that it belongs
  // to one of our purchases. Everything below is that second check.

  // 3. Environment must match our key's mode, or a sandbox event could
  //    complete a real purchase.
  const expected = pagarteConfig.isLiveMode ? 'LIVE' : 'TEST'
  if (event.environment !== expected) {
    console.error(
      '[pagarte/webhook] environment mismatch:',
      event.environment,
      '(expected', expected + ')'
    )
    // 2xx so PagArte stops retrying: this is not a transient failure.
    return NextResponse.json({ ignored: 'environment mismatch' }, { status: 200 })
  }

  // 4. Process each eventId exactly once — PagArte resends events.
  if (hasProcessedEvent(event.eventId)) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
  }

  const purchase = getPurchase(event.data.merchantOrderId)
  if (!purchase) {
    console.error('[pagarte/webhook] unknown purchase:', event.data.merchantOrderId)
    return NextResponse.json({ ignored: 'unknown purchase' }, { status: 200 })
  }

  // 5. The amount must match what we charged, so a session for a different
  //    amount can never mark this purchase paid.
  const amount = event.data.amount
  if (amount && amount.amountMinor !== purchase.amountMinor) {
    console.error(
      '[pagarte/webhook] amount mismatch for', purchase.id,
      '- event:', amount.amountMinor, 'expected:', purchase.amountMinor
    )
    return NextResponse.json({ ignored: 'amount mismatch' }, { status: 200 })
  }

  const nextStatus = STATUS_BY_EVENT[event.type]
  if (!nextStatus) {
    console.warn('[pagarte/webhook] unhandled event type:', event.type)
    return NextResponse.json({ ignored: 'unhandled type' }, { status: 200 })
  }

  // Never walk back a confirmed purchase: a late cancel/expire event must not
  // undo a payment that already arrived.
  if (purchase.status === 'CONFIRMED' && nextStatus !== 'CONFIRMED') {
    markEventProcessed(event.eventId)
    return NextResponse.json({ ok: true, ignored: 'already confirmed' }, { status: 200 })
  }

  updatePurchase(purchase.id, { status: nextStatus, sessionId: event.data.sessionId })
  markEventProcessed(event.eventId)

  console.log('[pagarte/webhook]', event.type, purchase.id, '→', nextStatus)

  // 6. Answer 2xx so PagArte stops retrying.
  return NextResponse.json({ ok: true }, { status: 200 })
}
