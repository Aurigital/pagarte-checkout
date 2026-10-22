'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PagArteCheckout } from '@/components/PagArteCheckout'

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface Charge {
  purchaseId: string
  payUrl: string
  amount: number
  description?: string
}

function formatCRC(value: number): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 2,
  }).format(value)
}

export default function HomePage() {
  const router = useRouter()

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [charge, setCharge] = useState<Charge | null>(null)
  const [paid, setPaid] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    // Random suffix: two toasts in the same millisecond would collide.
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const numericAmount = parseFloat(amount)
    if (!numericAmount || numericAmount <= 0) {
      addToast({ type: 'error', message: 'Ingresá un monto válido mayor a 0' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/pagarte/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: numericAmount,
          description: description.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'No se pudo crear el cobro')
      }

      // Straight to the checkout: it already shows the wallet QR.
      setPaid(false)
      setCharge({
        purchaseId: data.purchaseId,
        payUrl: data.payUrl,
        amount: numericAmount,
        description: description.trim() || undefined,
      })
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error inesperado',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (!charge) return

    // execCommand is deprecated but still the reliable path on iOS Safari,
    // where navigator.clipboard needs a secure context and a user gesture.
    const textarea = document.createElement('textarea')
    textarea.value = charge.payUrl
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()

    try {
      document.execCommand('copy')
      addToast({ type: 'success', message: 'Link copiado para enviar' })
    } catch {
      addToast({ type: 'error', message: 'No se pudo copiar' })
    } finally {
      document.body.removeChild(textarea)
    }
  }

  const handleShareLink = async () => {
    if (!charge) return
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Link de pago', url: charge.payUrl })
      } catch {
        // The user dismissed the share sheet.
      }
    } else {
      handleCopyLink()
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const reset = () => {
    setCharge(null)
    setPaid(false)
    setAmount('')
    setDescription('')
  }

  // ---- Charging: the checkout is on screen ----
  if (charge) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-md">
          <header className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Cobrando</p>
              <p className="text-3xl font-bold text-gray-900">
                {formatCRC(charge.amount)}
              </p>
              {charge.description ? (
                <p className="mt-0.5 text-sm text-gray-500">{charge.description}</p>
              ) : null}
            </div>
            <button
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
              onClick={reset}
              type="button"
            >
              Cancelar
            </button>
          </header>

          {paid ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="font-semibold text-green-900">Pago recibido</p>
              <p className="mt-1 text-sm text-green-800">
                {formatCRC(charge.amount)} · confirmado por PagArte
              </p>
              <button
                className="mt-4 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
                onClick={reset}
                type="button"
              >
                Nuevo cobro
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm">
              <PagArteCheckout
                onPaid={() => setPaid(true)}
                purchaseId={charge.purchaseId}
              />
            </div>
          )}

          {!paid ? (
            <div className="mt-5 border-t border-gray-200 pt-4">
              <p className="mb-2 text-center text-xs text-gray-500">
                ¿El cliente no está presente?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  onClick={handleCopyLink}
                  type="button"
                >
                  Copiar link
                </button>
                <button
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  onClick={handleShareLink}
                  type="button"
                >
                  Enviar link
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <Toasts toasts={toasts} />
      </main>
    )
  }

  // ---- Idle: the amount form ----
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cobros en cripto</h1>
            <p className="text-sm text-gray-500">PagArte · Artemis Money</p>
          </div>
          <button
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100"
            onClick={handleLogout}
            type="button"
          >
            Salir
          </button>
        </header>

        <form className="space-y-5 rounded-xl bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="amount">
              Monto
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">₡</span>
              <input
                autoFocus
                className="w-full rounded-lg border border-gray-200 py-3 pl-9 pr-4 text-lg focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
                disabled={loading}
                id="amount"
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                step="0.01"
                type="number"
                value={amount}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              El cliente paga el equivalente en cripto.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="description">
              Descripción <span className="text-gray-400">(opcional)</span>
            </label>
            <textarea
              className="w-full resize-none rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
              disabled={loading}
              id="description"
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pedido #1234"
              rows={2}
              value={description}
            />
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <>
                <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
                </svg>
                Generando…
              </>
            ) : (
              'Cobrar'
            )}
          </button>
        </form>
      </div>

      <Toasts toasts={toasts} />
    </main>
  )
}

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          className={[
            'pointer-events-auto rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg',
            t.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white',
          ].join(' ')}
          key={t.id}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
