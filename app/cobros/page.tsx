'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type Status = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'FAILED'

interface Charge {
  id: string
  amountMinor: string
  currency: string
  description?: string
  status: Status
  createdAt: string
  payUrl: string
}

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  CONFIRMED: { label: 'Pagado', className: 'bg-green-50 text-green-700 border-green-200' },
  CANCELLED: { label: 'Cancelado', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  EXPIRED: { label: 'Vencido', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  FAILED: { label: 'Falló', className: 'bg-red-50 text-red-700 border-red-200' },
}

function formatCRC(amountMinor: string): string {
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency: 'CRC',
    maximumFractionDigits: 2,
  }).format(Number(amountMinor) / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CobrosPage() {
  const [charges, setCharges] = useState<Charge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pagarte/purchases', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Error al cargar')
      setCharges(data.purchases)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Keep refreshing while something is still pending: the webhook decides the
  // final state, and it can land at any moment.
  useEffect(() => {
    const hasPending = charges.some((c) => c.status === 'PENDING')
    if (!hasPending) return

    const timer = setInterval(() => void load(), 5000)
    return () => clearInterval(timer)
  }, [charges, load])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Cobros generados</h1>
            <p className="text-sm text-gray-500">
              El estado se actualiza cuando PagArte confirma el pago
            </p>
          </div>
          <Link
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            href="/"
          >
            Nuevo cobro
          </Link>
        </header>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Cargando…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : charges.length === 0 ? (
          <div className="rounded-xl bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-gray-500">Todavía no generaste ningún cobro.</p>
            <Link
              className="mt-3 inline-block text-sm font-medium text-primary-600 hover:underline"
              href="/"
            >
              Generar el primero →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {charges.map((charge) => {
              const style = STATUS_STYLE[charge.status]
              return (
                <li
                  className="rounded-xl bg-white p-4 shadow-sm"
                  key={charge.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-bold text-gray-900">
                        {formatCRC(charge.amountMinor)}
                      </p>
                      {charge.description ? (
                        <p className="truncate text-sm text-gray-600">{charge.description}</p>
                      ) : null}
                      <p className="mt-1 font-mono text-xs text-gray-400">{charge.id}</p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={[
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          style.className,
                        ].join(' ')}
                      >
                        {style.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(charge.createdAt)}
                      </span>
                    </div>
                  </div>

                  {charge.status === 'PENDING' ? (
                    <a
                      className="mt-3 inline-block text-xs font-medium text-primary-600 hover:underline"
                      href={charge.payUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Abrir link de pago →
                    </a>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
