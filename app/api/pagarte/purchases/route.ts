import { NextRequest, NextResponse } from 'next/server'
import { createPurchase, listPurchases } from '@/lib/purchases'
import { appConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreatePurchaseBody {
  /** Monto en colones, decimal (ej. 1500.50) */
  amount: number
  description?: string
}

function validateBody(raw: unknown): CreatePurchaseBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Request body must be a JSON object')
  }

  const body = raw as Record<string, unknown>

  if (typeof body.amount !== 'number' || !isFinite(body.amount) || body.amount <= 0) {
    throw new Error('amount must be a positive number')
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    throw new Error('description must be a string')
  }

  return {
    amount: body.amount,
    description:
      typeof body.description === 'string' ? body.description.trim() || undefined : undefined,
  }
}

/** Crea un cobro y devuelve el link a nuestra propia página de pago. */
export async function POST(request: NextRequest) {
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  let body: CreatePurchaseBody
  try {
    body = validateBody(rawBody)
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 400 }
    )
  }

  // CRC tiene 2 decimales: ₡1500.50 → "150050"
  const amountMinor = String(Math.round(body.amount * 100))

  const purchase = createPurchase({ amountMinor, description: body.description })

  return NextResponse.json(
    {
      success: true,
      purchaseId: purchase.id,
      payUrl: `${appConfig.baseUrl}/pay/${purchase.id}`,
    },
    { status: 201 }
  )
}

/** Lista los cobros para el panel. */
export async function GET() {
  const purchases = listPurchases().map((p) => ({
    id: p.id,
    amountMinor: p.amountMinor,
    currency: p.currency,
    description: p.description,
    status: p.status,
    createdAt: p.createdAt,
    payUrl: `${appConfig.baseUrl}/pay/${p.id}`,
  }))

  return NextResponse.json({ success: true, purchases })
}
