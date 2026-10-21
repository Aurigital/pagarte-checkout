'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { CheckoutHandle, PagArteSdk, SessionToken } from '@/types/pagarte-checkout'

const CHECKOUT_ORIGIN =
  process.env.NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN ??
  'https://checkout.pagarte.artemis.money'

const SDK_URL = `${CHECKOUT_ORIGIN}/sdk/v1/checkout.js`

/**
 * PagArte currently serves the checkout page with `frame-ancestors 'none'` and
 * `X-Frame-Options: DENY`, so the browser refuses to embed it and the SDK's
 * iframe renders blank.
 *
 * There is NO way to pay around it: opening /checkout/{sessionId} directly
 * shows "este pago ya no está disponible", because the clientSecret only
 * reaches the checkout by postMessage from this page after a challenge
 * handshake. The iframe is the only payment path, and it is blocked.
 *
 * So all we can do is detect the blocked embed and say so plainly, instead of
 * leaving a broken grey box on screen. See docs/PAGARTE_IFRAME_ISSUE.md.
 * Once PagArte fixes the header, the embed works and this notice stops showing.
 */
const EMBED_TIMEOUT_MS = 6000

const STATUS_MESSAGE: Record<string, string> = {
  CREATED: 'Elegí cómo querés pagar.',
  PREPARING: 'Preparando las instrucciones de pago…',
  AWAITING_PAYMENT: 'Seguí las instrucciones para completar el pago.',
  CONFIRMING: 'Recibimos un pago parcial. Esperando el resto…',
  CONFIRMED: 'Pago confirmado.',
}

export default function PayPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const router = useRouter()

  const containerRef = useRef<HTMLDivElement>(null)
  const checkoutRef = useRef<CheckoutHandle | null>(null)
  const embeddedRef = useRef(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** Session id kept so the fallback can link straight to the hosted checkout. */
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

  const fetchSession = useCallback(async (): Promise<SessionToken> => {
    const response = await fetch(`/api/pagarte/purchases/${purchaseId}/checkout`, {
      method: 'POST',
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? 'No pudimos iniciar el pago')
    }

    const session: SessionToken = await response.json()
    setSessionId(session.sessionId)
    return session
  }, [purchaseId])

  useEffect(() => {
    let destroyed = false
    let timer: ReturnType<typeof setTimeout>

    async function start() {
      try {
        // webpackIgnore keeps Next from trying to bundle a remote module.
        const sdk: PagArteSdk = await import(/* webpackIgnore: true */ SDK_URL)

        if (destroyed || !containerRef.current) return

        checkoutRef.current = sdk.mount({
          container: containerRef.current,
          fetchSession,

          onStatus: ({ status }) => {
            // Any status means the iframe is alive and talking to us.
            embeddedRef.current = true
            setBlocked(false)
            setMessage(STATUS_MESSAGE[status] ?? '')
          },

          // A UI hint only — the purchase is completed by the webhook.
          onPaymentConfirmed: () => {
            router.push(`/pay/${purchaseId}/processing`)
          },

          onClose: async ({ status, cancellationPending }) => {
            if (cancellationPending) {
              await fetch(`/api/pagarte/purchases/${purchaseId}/checkout/cancel`, {
                method: 'POST',
              }).catch(() => {
                // Best effort: the session expires on its own anyway.
              })
            }

            if (status === 'EXPIRED') {
              setError('Se acabó el tiempo para pagar. Podés intentarlo de nuevo.')
            } else if (status === 'CANCELLED' || status === 'FAILED') {
              setError('El pago no se completó.')
            }
          },

          onError: ({ code, retryable }) => {
            if (retryable) {
              setMessage('Reconectando…')
              return
            }
            setMessage('')
            setError(`No pudimos iniciar el pago (${code}).`)
          },
        })

        await checkoutRef.current.ready
        if (destroyed) return
        setLoading(false)

        // The iframe is in the DOM, but a blocked one never reports a status.
        timer = setTimeout(() => {
          if (!destroyed && !embeddedRef.current) setBlocked(true)
        }, EMBED_TIMEOUT_MS)
      } catch (err) {
        if (destroyed) return
        setError(err instanceof Error ? err.message : 'No pudimos cargar el checkout')
        setLoading(false)
      }
    }

    void start()

    return () => {
      destroyed = true
      clearTimeout(timer)
      // destroy(), never close(): leaving the page must NOT cancel the payment.
      checkoutRef.current?.destroy()
      checkoutRef.current = null
    }
  }, [fetchSession, purchaseId, router])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Completá tu pago</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pagá con cripto, SINPE Móvil o Artemis App.
          </p>
        </header>

        {error ? (
          <div
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-center"
            role="alert"
          >
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              className="mt-3 text-sm font-medium text-red-700 underline"
              onClick={() => window.location.reload()}
              type="button"
            >
              Intentar de nuevo
            </button>
          </div>
        ) : null}

        {loading && !error ? (
          <div className="flex items-center justify-center gap-3 py-12 text-gray-500">
            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                fill="currentColor"
              />
            </svg>
            <span className="text-sm">Cargando el checkout…</span>
          </div>
        ) : null}

        {/* The embed is blocked by PagArte; say so instead of showing a broken frame */}
        {blocked ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
            <h2 className="text-base font-semibold text-amber-900">
              El pago no está disponible en este momento
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-amber-800">
              La pasarela de pago no está permitiendo cargar el checkout. Es un
              problema del proveedor, no de tu compra.
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs text-amber-700">
              Escribinos para coordinar el pago por otro medio, o intentá más tarde.
            </p>
            {sessionId ? (
              <p className="mt-4 border-t border-amber-200 pt-3 font-mono text-[11px] text-amber-600">
                ref: {sessionId.slice(0, 8)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* The SDK injects its iframe here. Hidden while blocked so the broken
            frame does not show. */}
        <div
          className={blocked ? 'hidden' : 'rounded-xl bg-white shadow-sm'}
          ref={containerRef}
        />

        {message && !blocked ? (
          <p aria-live="polite" className="mt-4 text-center text-sm text-gray-600">
            {message}
          </p>
        ) : null}

        <p className="mt-6 text-center text-xs text-gray-400">
          Pago procesado por PagArte
        </p>
      </div>
    </main>
  )
}
