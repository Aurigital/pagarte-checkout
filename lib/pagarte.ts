/**
 * PagArte (Artemis Money) API client.
 *
 * Unlike TiloPay/ONVO, PagArte has NO hosted payment page and returns NO link.
 * The flow is:
 *   1. This server creates a session with the secret key.
 *   2. Only { sessionId, clientSecret, expiresAt } reach the browser.
 *   3. The browser SDK mounts the checkout in an iframe inside OUR page,
 *      which must be an authorized origin in the Artemis dashboard.
 *   4. The real confirmation arrives via a signed webhook — see pagarte-webhook.ts.
 *      SDK callbacks are UI hints only, never fulfillment authorization.
 *
 * Amounts are in CRC only, as minor units in a string ("1000" = ₡10.00).
 */

import { pagarteConfig } from './config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** PagArte only settles in colones; other currencies return 422. */
export type PagarteCurrency = 'CRC'

export type PagarteSessionStatus =
  | 'CREATED'
  | 'PREPARING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'

export interface CreateCheckoutSessionParams {
  /** Your stable reference for the purchase. Letters, digits and . _ : - */
  merchantOrderId: string
  /** Minor units as a string, e.g. "1000" for ₡10.00 */
  amountMinor: string
  /** One per payment attempt; repeating it returns the same session. */
  idempotencyKey: string
}

/** The only three fields that may be handed to the browser. */
export interface CheckoutSession {
  sessionId: string
  clientSecret: string
  expiresAt: string
}

/** Full session state from GET /v1/checkout/sessions/{id}. */
export interface PagarteSessionDetail {
  sessionId: string
  status: PagarteSessionStatus
  amount: { currency: string; amountMinor: string }
  expiresAt: string
  settlement?: {
    status: string
    currency: string | null
    netAmountMinor: string | null
    decimals: number | null
  } | null
}

interface PagarteApiError {
  code?: string
  message?: string
  retryable?: boolean
  requestId?: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class PagarteError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string,
    public readonly retryable: boolean = false,
    public readonly requestId?: string
  ) {
    super(message)
    this.name = 'PagarteError'
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** The dashboard accepts letters, digits and . _ : - for merchantOrderId. */
const MERCHANT_ORDER_ID = /^[A-Za-z0-9._:-]{1,128}$/
/** Idempotency-Key is restricted to A-Z a-z 0-9 _ - */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,255}$/

function validateMerchantOrderId(value: string): void {
  if (!MERCHANT_ORDER_ID.test(value)) {
    throw new PagarteError(
      `merchantOrderId must match ${MERCHANT_ORDER_ID} (received "${value}")`
    )
  }
}

function validateIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_KEY.test(value)) {
    throw new PagarteError(
      `idempotencyKey must match ${IDEMPOTENCY_KEY} (received "${value}")`
    )
  }
}

function validateAmountMinor(value: string): void {
  if (!/^[0-9]+$/.test(value) || value === '0' || /^0[0-9]/.test(value)) {
    throw new PagarteError(
      `amountMinor must be a positive integer string in minor units (received "${value}"). ` +
        'Example: ₡10.00 → "1000"'
    )
  }
}

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
  method: 'GET' | 'POST'
  idempotencyKey?: string
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  if (!pagarteConfig.secretKey) {
    throw new PagarteError(
      'PAGARTE_SECRET_KEY is not configured. See .env.example.'
    )
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${pagarteConfig.secretKey}`,
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const url = `${pagarteConfig.apiUrl.replace(/\/+$/, '')}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      // Never cache: sessions and their state are per-request.
      cache: 'no-store',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error'
    console.error('[pagarte]', `${options.method} ${path}`, message)
    // Network failures are worth retrying with the SAME idempotency key.
    throw new PagarteError(`Could not reach PagArte: ${message}`, undefined, undefined, true)
  }

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      // Fall through: a non-JSON body is reported with the status below.
    }
  }

  if (!response.ok) {
    const apiError = (parsed as { error?: PagarteApiError } | null)?.error ?? {}
    const code = apiError.code ?? 'UNKNOWN'
    const message = apiError.message ?? `PagArte returned ${response.status}`

    console.error(
      '[pagarte]',
      `${options.method} ${path}`,
      `${response.status} ${code}`,
      apiError.requestId ? `requestId=${apiError.requestId}` : ''
    )

    throw new PagarteError(
      message,
      response.status,
      code,
      apiError.retryable ?? false,
      apiError.requestId
    )
  }

  return parsed as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a checkout session.
 *
 * Returns 201 for a new session, or 200 with the SAME session when the
 * Idempotency-Key is repeated with an identical body. Reusing the key while an
 * attempt is alive is what lets a buyer reload the page and continue paying.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<CheckoutSession> {
  validateMerchantOrderId(params.merchantOrderId)
  validateAmountMinor(params.amountMinor)
  validateIdempotencyKey(params.idempotencyKey)

  if (!pagarteConfig.widgetId) {
    throw new PagarteError('PAGARTE_WIDGET_ID is not configured.')
  }
  if (!pagarteConfig.storeOrigin) {
    throw new PagarteError('STORE_ORIGIN is not configured.')
  }

  const body = await request<CheckoutSession & { status?: string }>(
    '/v1/checkout/sessions',
    {
      method: 'POST',
      idempotencyKey: params.idempotencyKey,
      body: {
        widgetId: pagarteConfig.widgetId,
        merchantOrderId: params.merchantOrderId,
        amount: { currency: 'CRC', amountMinor: params.amountMinor },
        embeddingOrigin: pagarteConfig.storeOrigin,
      },
    }
  )

  // Hand the browser only these three fields, never the raw response.
  return {
    sessionId: body.sessionId,
    clientSecret: body.clientSecret,
    expiresAt: body.expiresAt,
  }
}

/** Reads a session's current state. Use it to reconcile without a webhook. */
export async function getCheckoutSession(
  sessionId: string
): Promise<PagarteSessionDetail> {
  const body = await request<{ session: PagarteSessionDetail }>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' }
  )
  return body.session
}

/** Cancels a session, e.g. when the buyer abandons the payment. */
export async function cancelCheckoutSession(
  sessionId: string,
  idempotencyKey: string
): Promise<PagarteSessionDetail> {
  validateIdempotencyKey(idempotencyKey)

  const body = await request<{ session: PagarteSessionDetail }>(
    `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/cancel`,
    { method: 'POST', idempotencyKey, body: {} }
  )
  return body.session
}
