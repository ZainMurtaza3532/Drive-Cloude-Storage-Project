'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, CreditCard, Sparkles, X } from 'lucide-react'

type BillingAction = 'checkout' | 'portal' | null

export function UpgradeModal({
  open,
  onClose,
  isPro,
  hasBillingCustomer,
}: {
  open: boolean
  onClose: () => void
  isPro: boolean
  hasBillingCustomer: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [action, setAction] = useState<BillingAction>(null)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [isLoadingStorage, setIsLoadingStorage] = useState(false)
  const [liveStorage, setLiveStorage] = useState<{
    storageLimit: number
    isPro: boolean
    hasBillingCustomer: boolean
  } | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    async function refreshStorage() {
      setIsLoadingStorage(true)
      setStorageError('')
      try {
        const response = await fetch('/api/user/storage', { cache: 'no-store' })
        if (!response.ok) throw new Error('Unable to refresh your current storage plan.')
        const data = await response.json()
        if (!cancelled) setLiveStorage(data)
      } catch {
        if (!cancelled) setStorageError('Showing the last available plan status.')
      } finally {
        if (!cancelled) setIsLoadingStorage(false)
      }
    }

    void refreshStorage()
    return () => {
      cancelled = true
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open || !mounted) return null

  const hasProStorage = liveStorage
    ? liveStorage.isPro || liveStorage.storageLimit >= 100 * 1024 ** 3
    : isPro
  const canManageBilling = liveStorage?.hasBillingCustomer ?? hasBillingCustomer

  async function continueTo(endpoint: '/api/stripe/checkout' | '/api/stripe/portal', nextAction: Exclude<BillingAction, null>) {
    setAction(nextAction)
    setError('')
    try {
      const response = await fetch(endpoint, { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Unable to continue to Stripe.')
      if (typeof data?.url !== 'string') throw new Error('Stripe did not return a destination URL.')
      window.location.assign(data.url)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to continue to Stripe.')
      setAction(null)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !action) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        aria-describedby="upgrade-features"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f15a24]/10 text-[#f15a24]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-[#f15a24]">Drive Storage Pro</p>
              <h2 id="upgrade-title" className="break-words text-lg font-semibold text-zinc-900 dark:text-white">
                More room for your files
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(action)}
            aria-label="Close upgrade dialog"
            className="shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="mt-6">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">100 GB storage</p>
                <p className="mt-1 text-3xl font-bold text-zinc-950 dark:text-white">
                  $9.99<span className="ml-1 text-sm font-medium text-zinc-500">/mo</span>
                </p>
              </div>
              {hasProStorage && (
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  Current plan
                </span>
              )}
            </div>
          </div>

          <ul id="upgrade-features" className="mt-5 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />100 GB Storage</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Priority Support</li>
            <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Unlimited File Sharing</li>
          </ul>

          {isLoadingStorage && <p role="status" className="mt-4 text-sm text-zinc-500">Refreshing plan status...</p>}
          {storageError && <p className="mt-3 break-words text-xs text-amber-700 dark:text-amber-300">{storageError}</p>}
          {error && <p role="alert" className="mt-4 break-words rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

          <div className="mt-6 space-y-2">
            {hasProStorage ? (
              <button
                type="button"
                onClick={() => void continueTo('/api/stripe/portal', 'portal')}
                disabled={Boolean(action) || isLoadingStorage}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f15a24] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94e1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                <span className="break-words">{action === 'portal' ? 'Opening Billing...' : 'Manage Subscription'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void continueTo('/api/stripe/checkout', 'checkout')}
                disabled={Boolean(action) || isLoadingStorage}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f15a24] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#d94e1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="break-words">{action === 'checkout' ? 'Opening Checkout...' : 'Upgrade Now'}</span>
              </button>
            )}
            {!hasProStorage && canManageBilling && (
              <button
                type="button"
                onClick={() => void continueTo('/api/stripe/portal', 'portal')}
                disabled={Boolean(action) || isLoadingStorage}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] disabled:cursor-wait disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                <span className="break-words">{action === 'portal' ? 'Opening Billing Portal...' : 'Billing Portal'}</span>
              </button>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Secure recurring billing. Cancel anytime in the Stripe Billing Portal.
          </p>
        </div>
      </section>
    </div>,
    document.body,
  )
}