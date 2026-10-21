'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'

interface Toast {
  id: number
  type: 'success' | 'error'
  message: string
}

interface GeneratedCharge {
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
  const [charge, setCharge] = useState<GeneratedCharge | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    // Random suffix: two toasts in the same millisecond would collide on Date.now() alone.
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000)
  }, [])

  // Draw the QR once the modal (and its canvas) is on screen.
  useEffect(() => {
    if (!charge || !canvasRef.current) return

    QRCode.toCanvas(canvasRef.current, charge.payUrl, {
      width: 220,
      margin: 1,
      color: { dark: '#1f2937', light: '#ffffff' },
    }).catch(() => {
      addToast({ type: 'error', message: 'No se pudo generar el QR' })
    })
  }, [charge, addToast])

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

  const handleCopy = () => {
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
      addToast({ type: 'success', message: 'Link copiado' })
    } catch {
      addToast({ type: 'error', message: 'No se pudo copiar' })
    } finally {
      document.body.removeChild(textarea)
    }
  }

  const handleShare = async () => {
    if (!charge) return

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Link de pago', url: charge.payUrl })
      } catch {
        // The user dismissed the share sheet.
      }
    } else {
      window.open(charge.payUrl, '_blank')
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const reset = () => {
    setCharge(null)
    setAmount('')
    setDescription('')
  }

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

        <form
          className="space-y-5 rounded-xl bg-white p-6 shadow-sm"
          onSubmit={handleSubmit}
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="amount">
              Monto
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">₡</span>
              <input
                className="w-full rounded-lg border border-gray-200 py-3 pl-9 pr-4 text-lg focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:opacity-50"
                disabled={loading}
                id="amount"
                inputMode="decimal"
                onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                type="number"
                step="0.01"
                value={amount}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              PagArte cobra en colones. El cliente paga el equivalente en cripto.
            </p>
          </div>

          <div>
            <label
              className="mb-1.5 block text-sm font-medium text-gray-700"
              htmlFor="description"
            >
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
            <p className="mt-1 text-right text-xs text-gray-400">{description.length}/200</p>
          </div>

          <button
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <>
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
                Generando…
              </>
            ) : (
              'Generar cobro'
            )}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link className="text-sm text-primary-600 hover:underline" href="/cobros">
            Ver cobros generados →
          </Link>
        </div>
      </div>

      {/* Charge modal with the QR */}
      {charge ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={reset}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Cobro generado</h2>
                <p className="text-2xl font-bold text-primary-600">
                  {formatCRC(charge.amount)}
                </p>
                {charge.description ? (
                  <p className="mt-0.5 text-sm text-gray-500">{charge.description}</p>
                ) : null}
              </div>
              <button
                aria-label="Cerrar"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
                onClick={reset}
                type="button"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div className="mb-4 flex flex-col items-center rounded-xl border border-gray-100 bg-gray-50 p-4">
              <canvas className="rounded-lg bg-white" ref={canvasRef} />
              <p className="mt-3 text-center text-xs text-gray-500">
                Escaneá el código con el teléfono para abrir el pago
              </p>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <p className="break-all font-mono text-xs text-gray-600">{charge.payUrl}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
                onClick={handleCopy}
                type="button"
              >
                Copiar link
              </button>
              <button
                className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
                onClick={handleShare}
                type="button"
              >
                Compartir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Toasts */}
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
    </main>
  )
}
