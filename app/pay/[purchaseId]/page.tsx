'use client'

import { useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PagArteCheckout } from '@/components/PagArteCheckout'

/** Buyer-facing page: opened from a shared link, so no login required. */
export default function PayPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const router = useRouter()

  const onPaid = useCallback(() => {
    router.push(`/pay/${purchaseId}/processing`)
  }, [purchaseId, router])

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Completá tu pago</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pagá con cripto, SINPE Móvil o Artemis App.
          </p>
        </header>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <PagArteCheckout onPaid={onPaid} purchaseId={purchaseId} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Pago procesado por PagArte
        </p>
      </div>
    </main>
  )
}
