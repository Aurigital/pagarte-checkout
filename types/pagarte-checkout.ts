/**
 * Types for the PagArte browser SDK v1.
 *
 * Mirrors <CHECKOUT_ORIGIN>/sdk/v1/checkout.d.ts, vendored because the SDK is
 * loaded from a remote URL at runtime and cannot be resolved at build time.
 */

export type SessionToken = {
  sessionId: string
  clientSecret: string
  expiresAt: string
}

export type CloseResult = {
  sessionId: string
  status: string
  cancellationPending: boolean
}

export type MountOptions = {
  container: string | HTMLElement
  fetchSession: () => Promise<SessionToken>
  checkoutOrigin?: string
  onPaymentConfirmed?: (value: { sessionId: string }) => void
  onClose?: (value: CloseResult) => void
  onError?: (value: { code: string; retryable: boolean }) => void
  onStatus?: (value: { sessionId: string; status: string }) => void
}

export type CheckoutHandle = {
  ready: Promise<void>
  /** Removes the iframe WITHOUT cancelling the payment. Idempotent. */
  destroy(): void
  close(): Promise<CloseResult>
}

export type PagArteSdk = {
  mount(options: MountOptions): CheckoutHandle
}

/** Session statuses the SDK reports through onStatus. */
export type CheckoutStatus =
  | 'CREATED'
  | 'PREPARING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'
