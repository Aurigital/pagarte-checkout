/**
 * Purchase store.
 *
 * Backed by Redis (Vercel KV / Upstash) when configured, falling back to an
 * in-memory Map for local development.
 *
 * The fallback is NOT safe on serverless: every instance keeps its own Map and
 * loses it on cold start, so a webhook can land on an instance that never saw
 * the purchase and silently drop a confirmed payment. That is exactly what
 * happened before Redis was added, so in production the env vars below must be
 * set.
 *
 * Every function is async so the backend can be swapped without touching
 * callers.
 */

import { randomUUID } from 'node:crypto'
import { Redis } from '@upstash/redis'

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
// Backend
// ---------------------------------------------------------------------------

const PURCHASE_KEY = (id: string) => `purchase:${id}`
const INDEX_KEY = 'purchases:index'
const EVENT_KEY = (id: string) => `event:${id}`

/** Processed webhook events expire after 30 days; replays are long dead by then. */
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 30

function redisFromEnv(): Redis | null {
  // The Vercel integration lets you pick the variable prefix when connecting
  // the store, so accept the usual ones rather than depending on that choice:
  // KV_* (Vercel default), UPSTASH_* (Upstash's own), STORAGE_* (the prefix
  // Vercel suggests in the connect dialog).
  const url =
    process.env.KV_REST_API_URL ??
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.STORAGE_REST_API_URL ??
    process.env.STORAGE_KV_REST_API_URL ??
    ''
  const token =
    process.env.KV_REST_API_TOKEN ??
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.STORAGE_REST_API_TOKEN ??
    process.env.STORAGE_KV_REST_API_TOKEN ??
    ''

  if (!url || !token) return null
  return new Redis({ url, token })
}

const redis = redisFromEnv()

/** True when purchases survive restarts. False means the in-memory fallback. */
export const isPersistent = redis !== null

/** Which env prefix the Redis credentials came from, for /api/health. */
export const redisSource: string | null = !redis
  ? null
  : process.env.KV_REST_API_URL
    ? 'KV_*'
    : process.env.UPSTASH_REDIS_REST_URL
      ? 'UPSTASH_*'
      : 'STORAGE_*' 

/** Dev-only fallback. Kept on globalThis so hot reloads do not wipe it. */
const globalStore = globalThis as unknown as {
  __pagartePurchases?: Map<string, Purchase>
  __pagarteEvents?: Set<string>
}

const memory: Map<string, Purchase> =
  globalStore.__pagartePurchases ?? (globalStore.__pagartePurchases = new Map())

const memoryEvents: Set<string> =
  globalStore.__pagarteEvents ?? (globalStore.__pagarteEvents = new Set())

// NEXT_PHASE is set during `next build`, where env vars are absent by design.
if (
  !redis &&
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build'
) {
  console.error(
    '[purchases] No Redis configured in production. Purchases will be LOST on ' +
      'cold starts and webhooks may not find them. Set KV_REST_API_URL and ' +
      'KV_REST_API_TOKEN.'
  )
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

/** Timestamp + random suffix: readable in the dashboard, unique per company. */
function newPurchaseId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `ord-${stamp}-${randomUUID().slice(0, 8)}`
}

export async function createPurchase(input: {
  amountMinor: string
  description?: string
}): Promise<Purchase> {
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

  if (redis) {
    await redis.set(PURCHASE_KEY(id), purchase)
    // Sorted by creation time so the list comes back newest-first.
    await redis.zadd(INDEX_KEY, { score: Date.parse(now), member: id })
  } else {
    memory.set(id, purchase)
  }

  return purchase
}

export async function getPurchase(id: string): Promise<Purchase | undefined> {
  if (!redis) return memory.get(id)
  const stored = await redis.get<Purchase>(PURCHASE_KEY(id))
  return stored ?? undefined
}

/** Most recent first. */
export async function listPurchases(limit = 100): Promise<Purchase[]> {
  if (!redis) {
    return Array.from(memory.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, limit - 1, { rev: true })
  if (!ids.length) return []

  const stored = await redis.mget<(Purchase | null)[]>(
    ...ids.map((id) => PURCHASE_KEY(id))
  )
  return stored.filter((p): p is Purchase => p !== null)
}

export async function updatePurchase(
  id: string,
  patch: Partial<Omit<Purchase, 'id' | 'createdAt'>>
): Promise<Purchase | undefined> {
  const existing = await getPurchase(id)
  if (!existing) return undefined

  const updated: Purchase = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  }

  if (redis) {
    await redis.set(PURCHASE_KEY(id), updated)
  } else {
    memory.set(id, updated)
  }

  return updated
}

/**
 * Mints a fresh attempt key. Call this only once the previous session is
 * cancelled or expired — reusing a dead key would return the dead session.
 */
export async function startNewAttempt(id: string): Promise<Purchase | undefined> {
  const existing = await getPurchase(id)
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
export async function hasProcessedEvent(eventId: string): Promise<boolean> {
  if (!redis) return memoryEvents.has(eventId)
  return (await redis.exists(EVENT_KEY(eventId))) === 1
}

export async function markEventProcessed(eventId: string): Promise<void> {
  if (!redis) {
    memoryEvents.add(eventId)
    return
  }
  await redis.set(EVENT_KEY(eventId), 1, { ex: EVENT_TTL_SECONDS })
}
