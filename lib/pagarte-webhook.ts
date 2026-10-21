/**
 * PagArte webhook signature verification (Ed25519).
 *
 * The webhook is the ONLY trustworthy confirmation that a payment happened.
 * Browser SDK callbacks are UI hints and must never complete a purchase.
 *
 * Header: `Pagarte-Signature: t=<unix>,kid=<id>,ed25519=<base64url>`
 * The signature covers the bytes of `<t>.<raw body>`, so the body must be
 * verified EXACTLY as received — never re-serialized from parsed JSON.
 *
 * Node runtime only (uses node:crypto); not Edge-compatible.
 */

import { createPublicKey, verify, type KeyObject } from 'node:crypto'
import { pagarteConfig } from './config'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNATURE =
  /^t=([0-9]{1,12}),kid=([A-Za-z0-9_-]{8,128}),ed25519=([A-Za-z0-9_-]{86})$/

/** Reject signatures older/newer than this, to blunt replay attacks. */
const TOLERANCE_SECONDS = 300

/** Floor between key refreshes, so an unknown kid cannot be used to hammer the API. */
const MIN_REFRESH_MS = 60_000

// ---------------------------------------------------------------------------
// Key cache
// ---------------------------------------------------------------------------

interface WebhookKeyResponse {
  keys: { kid: string; algorithm: string; publicKey: string }[]
}

/** Public keys from GET /v1/checkout/webhook-keys, cached by `kid`. */
export class PagarteWebhookKeys {
  private keys = new Map<string, KeyObject>()
  private lastRefresh = 0

  constructor(private readonly apiUrl: string) {}

  async get(kid: string): Promise<KeyObject | null> {
    // An unknown kid means PagArte rotated its key: fetch again (rate limited).
    if (!this.keys.has(kid) && Date.now() - this.lastRefresh > MIN_REFRESH_MS) {
      await this.refresh()
    }
    return this.keys.get(kid) ?? null
  }

  private async refresh(): Promise<void> {
    this.lastRefresh = Date.now()

    try {
      const response = await fetch(
        `${this.apiUrl.replace(/\/+$/, '')}/v1/checkout/webhook-keys`,
        { cache: 'no-store' }
      )
      if (!response.ok) {
        console.error('[pagarte-webhook] key refresh failed:', response.status)
        return
      }

      const { keys } = (await response.json()) as WebhookKeyResponse
      for (const key of keys) {
        if (key.algorithm !== 'Ed25519') continue
        try {
          this.keys.set(key.kid, createPublicKey(key.publicKey))
        } catch (err) {
          console.error('[pagarte-webhook] unusable key', key.kid, err)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error'
      console.error('[pagarte-webhook] key refresh error:', message)
    }
  }
}

/** Module-level cache so keys survive between requests in a warm instance. */
export const webhookKeys = new PagarteWebhookKeys(pagarteConfig.apiUrl)

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** True only when `rawBody` was signed by PagArte within the tolerance window. */
export async function verifyPagarteWebhook(
  rawBody: Buffer,
  signatureHeader: string | undefined | null,
  keys: Pick<PagarteWebhookKeys, 'get'> = webhookKeys,
  now: number = Date.now()
): Promise<boolean> {
  const match = SIGNATURE.exec(signatureHeader ?? '')
  if (!match) return false

  const [, timestamp, kid, signature] = match

  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false
  }

  const key = await keys.get(kid)
  if (!key) return false

  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]),
      key,
      Buffer.from(signature, 'base64url')
    )
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Event shape
// ---------------------------------------------------------------------------

export type PagarteEventType =
  | 'checkout.payment.confirmed'
  | 'checkout.cancelled'
  | 'checkout.expired'

export interface PagarteWebhookEvent {
  eventId: string
  type: PagarteEventType
  apiVersion: string
  environment: 'TEST' | 'LIVE'
  merchantId?: string
  createdAt?: string
  data: {
    sessionId: string
    merchantOrderId: string
    status?: string
    amount?: { currency: string; amountMinor: string }
    settlement?: unknown
  }
}
