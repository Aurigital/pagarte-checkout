'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CheckoutHandle, PagArteSdk, SessionToken } from '@/types/pagarte-checkout'

const CHECKOUT_ORIGIN =
  process.env.NEXT_PUBLIC_PAGARTE_CHECKOUT_ORIGIN ??
  'https://checkout.pagarte.artemis.money'

const SDK_URL = `${CHECKOUT_ORIGIN}/sdk/v1/checkout.js`

/** If the embed never reports a status, assume the provider is blocking it. */
const EMBED_TIMEOUT_MS = 8000

const STATUS_MESSAGE: Record<string, string> = {
  CREATED: 'Elegí cómo querés pagar.',
  PREPARING: 'Preparando las instrucciones de pago…',
  AWAITING_PAYMENT: 'Escaneá el código con la wallet para pagar.',
  CONFIRMING: 'Recibimos un pago parcial. Esperando el resto…',
  CONFIRMED: 'Pago confirmado.',
}

export interface PagArteCheckoutProps {
  purchaseId: string
  /** PagArte confirmed the payment. A UI hint — the webhook is the source of truth. */
  onPaid?: () => void
  /** The checkout ended: paid, cancelled, expired or failed. */
  onClosed?: (status: string) => void
}

export function PagArteCheckout({ purchaseId, onPaid, onClosed }: PagArteCheckoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const checkoutRef = useRef<CheckoutHandle | null>(null)
  const embeddedRef = useRef(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)

  const fetchSession = useCallback(async (): Promise<SessionToken> => {
    const response = await fetch(`/api/pagarte/purchases/${purchaseId}/checkout`, {
      method: 'POST',
    })

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new Error(data?.error ?? 'No pudimos iniciar el pago')
    }

    return response.json()
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

          onPaymentConfirmed: () => onPaid?.(),

          onClose: async ({ status, cancellationPending }) => {
            if (cancellationPending) {
              await fetch(`/api/pagarte/purchases/${purchaseId}/checkout/cancel`, {
                method: 'POST',
              }).catch(() => {
                // Best effort: the session expires on its own anyway.
              })
            }
            if (status === 'EXPIRED') {
              setError('Se acabó el tiempo para pagar. Generá el cobro de nuevo.')
            } else if (status === 'CANCELLED' || status === 'FAILED') {
              setError('El pago no se completó.')
            }
            onClosed?.(status)
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

        // A blocked iframe is in the DOM but never reports a status.
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
      // destroy(), never close(): leaving must NOT cancel the payment.
      checkoutRef.current?.destroy()
      checkoutRef.current = null
    }
  }, [fetchSession, purchaseId, onPaid, onClosed])

  return (
    <div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center" role="alert">
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      ) : null}

      {loading && !error ? (
        <div className="flex items-center justify-center gap-3 py-12 text-gray-500">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
          </svg>
          <span className="text-sm">Cargando el checkout…</span>
        </div>
      ) : null}

      {blocked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
          <p className="text-sm font-medium text-amber-900">
            El checkout no se pudo mostrar
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-amber-800">
            La pasarela no está permitiendo cargarlo. Es un problema del proveedor.
          </p>
        </div>
      ) : null}

      {/* The SDK injects its iframe here. Must be empty per attempt. */}
      <div className={blocked ? 'hidden' : ''} ref={containerRef} />

      {message && !blocked ? (
        <p aria-live="polite" className="mt-3 text-center text-sm text-gray-600">
          {message}
        </p>
      ) : null}
    </div>
  )
}
