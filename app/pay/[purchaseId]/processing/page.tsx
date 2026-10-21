'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

type Status = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'FAILED'

const POLL_MS = 3000
/** Give up after ~2 minutes of polling and let the buyer refresh. */
const MAX_POLLS = 40

function formatCRC(amountMinor: string): string {
  const value = Number(amountMinor) / 100
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
  }).format(value)
}

export default function ProcessingPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()

  const [status, setStatus] = useState<Status>('PENDING')
  const [amountMinor, setAmountMinor] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    let polls = 0
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      if (cancelled) return

      try {
        const response = await fetch(`/api/pagarte/purchases/${purchaseId}/status`, {
          cache: 'no-store',
        })
        const data = await response.json()

        if (cancelled) return

        if (data.success) {
          setStatus(data.status)
          setAmountMinor(data.amountMinor)

          // Terminal state: stop polling.
          if (data.status !== 'PENDING') return
        }
      } catch {
        // Network blip: keep polling.
      }

      polls += 1
      if (polls >= MAX_POLLS) {
        if (!cancelled) setTimedOut(true)
        return
      }

      timer = setTimeout(poll, POLL_MS)
    }

    void poll()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [purchaseId])

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        {status === 'CONFIRMED' ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-7 w-7 text-green-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">¡Pago confirmado!</h1>
            {amountMinor ? (
              <p className="mt-2 text-sm text-gray-500">
                Recibimos {formatCRC(amountMinor)}.
              </p>
            ) : null}
          </>
        ) : null}

        {status === 'PENDING' && !timedOut ? (
          <>
            <svg
              className="mx-auto mb-4 h-10 w-10 animate-spin text-primary-600"
              fill="none"
              viewBox="0 0 24 24"
            >
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
            <h1 className="text-xl font-bold text-gray-900">Procesando tu pago…</h1>
            <p className="mt-2 text-sm text-gray-500">
              Estamos confirmando la transacción. No cierres esta página.
            </p>
          </>
        ) : null}

        {status === 'PENDING' && timedOut ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">Seguimos esperando</h1>
            <p className="mt-2 text-sm text-gray-500">
              La confirmación está tardando más de lo normal. Podés recargar la página
              para ver el estado actualizado.
            </p>
            <button
              className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white"
              onClick={() => window.location.reload()}
              type="button"
            >
              Recargar
            </button>
          </>
        ) : null}

        {status === 'EXPIRED' || status === 'CANCELLED' || status === 'FAILED' ? (
          <>
            <h1 className="text-xl font-bold text-gray-900">
              {status === 'EXPIRED' ? 'El tiempo se agotó' : 'El pago no se completó'}
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Podés volver a intentarlo desde el link de pago.
            </p>
          </>
        ) : null}

        <p className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
          Pago procesado por PagArte
        </p>
      </div>
    </main>
  )
}
