/**
 * Purchase store.
 *
 * Deliberately small and swappable: the whole surface is the exported
 * functions below, so moving to a real database means reimplementing them
 * without touching routes or pages.
 *
 * NOTE: this in-memory implementation is for the demo. On serverless
 * (Vercel) each instance has its own Map and it resets on cold start, so a
 * purchase created by one instance may be invisible to another. For
 * production, back these functions with a database (Postgres, Vercel KV…).
 * The webhook handler already reconciles against PagArte's API, which keeps
 * the demo usable despite this.
 */

import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PurchaseStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED'

export interface Purchase {
  /** Also used as merchantOrderId at PagArte. */
  id: string
  /** Minor units as a string, e.g. "1000" = ₡10.00 */
  amountMinor: string
  currency: 'CRC'
  description?: string
  /** Idempotency key of the ACTIVE attempt. */
  idempotencyKey: string
  sessionId?: string
  status: PurchaseStatus
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Survives hot reloads in dev: Next re-evaluates modules on every change,
 * which would otherwise wipe the Map mid-test.
 */
const globalStore = globalThis as unknown as {
  __pagartePurchases?: Map<string, Purchase>
  __pagarteEvents?: Set<string>
}

const purchases: Map<string, Purchase> =
  globalStore.__pagartePurchases ?? (globalStore.__pagartePurchases = new Map())

const processedEvents: Set<string> =
  globalStore.__pagarteEvents ?? (globalStore.__pagarteEvents = new Set())

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/** Timestamp + random suffix: readable in the dashboard, unique per company. */
function newPurchaseId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `ord-${stamp}-${randomUUID().slice(0, 8)}`
}

export function createPurchase(input: {
  amountMinor: string
  description?: string
}): Purchase {
  const now = new Date().toISOString()
  const id = newPurchaseId()

  const purchase: Purchase = {
    id,
    amountMinor: input.amountMinor,
    currency: 'CRC',
    description: input.description,
    // First attempt. A new key is minted only after this one is dead.
    idempotencyKey: `${id}-1`,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  }

  purchases.set(id, purchase)
  return purchase
}

export function getPurchase(id: string): Purchase | undefined {
  return purchases.get(id)
}

/** Todos los cobros, del más reciente al más viejo. */
export function listPurchases(): Purchase[] {
  return Array.from(purchases.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
}

export function updatePurchase(
  id: string,
  patch: Partial<Omit<Purchase, 'id' | 'createdAt'>>
): Purchase | undefined {
  const existing = purchases.get(id)
  if (!existing) return undefined

  const updated: Purchase = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  purchases.set(id, updated)
  return updated
}

/**
 * Mints a fresh attempt key. Call this only once the previous session is
 * cancelled or expired — reusing a dead key would return the dead session.
 */
export function startNewAttempt(id: string): Purchase | undefined {
  const existing = purchases.get(id)
  if (!existing) return undefined

  const attempt = Number(existing.idempotencyKey.split('-').pop() ?? '1') + 1
  return updatePurchase(id, {
    idempotencyKey: `${id}-${attempt}`,
    sessionId: undefined,
    status: 'PENDING',
  })
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

/** True when this eventId was already handled: PagArte may resend events. */
export function hasProcessedEvent(eventId: string): boolean {
  return processedEvents.has(eventId)
}

export function markEventProcessed(eventId: string): void {
  processedEvents.add(eventId)
}
