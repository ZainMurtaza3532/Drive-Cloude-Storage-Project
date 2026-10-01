'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateStoragePercentage, formatBytes } from '@/lib/quota'
import { Check, HardDrive, Sparkles } from 'lucide-react'
import { UpgradeModal } from '@/components/billing/UpgradeModal'

interface StorageMeterProps {
  storageUsed: number | bigint
  storageLimit: number | bigint
  isPro?: boolean
  hasBillingCustomer?: boolean
}

export const StorageMeter: React.FC<StorageMeterProps> = ({
  storageUsed,
  storageLimit,
  isPro = false,
  hasBillingCustomer = false,
}) => {
  const router = useRouter()
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [liveStorage, setLiveStorage] = useState({
    storageUsed,
    storageLimit,
    isPro,
    hasBillingCustomer,
  })

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let refreshInterval: ReturnType<typeof setInterval> | undefined
    let attempt = 0
    const params = new URLSearchParams(window.location.search)
    const returnedFromCheckout = params.get('success') === 'true' || params.get('billing') === 'success'
    if (returnedFromCheckout) router.refresh()

    function retryAfterDelay() {
      if (returnedFromCheckout && attempt < 20) {
        attempt += 1
        retryTimer = setTimeout(refreshStorage, 1500)
      }
    }

    async function refreshStorage() {
      try {
        const response = await fetch('/api/user/storage', { cache: 'no-store' })
        if (!response.ok) {
          retryAfterDelay()
          return
        }

        const data = await response.json()
        if (cancelled) return
        setLiveStorage(data)

        if (returnedFromCheckout && !data.isPro && Number(data.storageLimit) < 100 * 1024 ** 3) {
          retryAfterDelay()
        } else if (returnedFromCheckout) {
          router.refresh()
        }
      } catch {
        retryAfterDelay()
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') void refreshStorage()
    }

    void refreshStorage()
    refreshInterval = setInterval(refreshWhenVisible, 30_000)
    window.addEventListener('focus', refreshWhenVisible)
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (refreshInterval) clearInterval(refreshInterval)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [router])

  const usedBytes = liveStorage.storageUsed
  const limitBytes = liveStorage.storageLimit
  const hasProStorage = liveStorage.isPro || Number(limitBytes) >= 100 * 1024 ** 3
  const displayLimitBytes = hasProStorage ? 100 * 1024 ** 3 : limitBytes
  const limitFormatted = formatBytes(displayLimitBytes)
  const percentage = calculateStoragePercentage(usedBytes, displayLimitBytes)
  const percentageLabel = percentage > 0 && percentage < 0.01 ? '<0.01' : String(Number(percentage.toFixed(2)))

  let progressColor = 'from-[#f15a24] to-[#f97316]'
  let badgeColor = 'text-[#f15a24] bg-[#f15a24]/10 dark:bg-[#f15a24]/20'
  if (percentage > 90) {
    progressColor = 'from-red-500 to-rose-600'
    badgeColor = 'text-red-600 bg-red-500/10'
  } else if (percentage > 75) {
    progressColor = 'from-amber-500 to-orange-500'
    badgeColor = 'text-amber-600 bg-amber-500/10'
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-slate-200">
          <HardDrive className="h-4 w-4 shrink-0 text-[#f15a24]" />
          <span className="truncate text-xs font-semibold uppercase tracking-wider">
            {hasProStorage ? 'Drivea Pro Plan (100 GB)' : 'Free Plan (5 GB)'}
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${badgeColor}`}>
          {percentageLabel}%
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/80"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r ${progressColor} transition-[width] duration-500 ease-out`}
          style={{ width: `${Math.min(Math.max(Number(usedBytes) > 0 ? Math.max(percentage, 1.5) : 0, 0), 100)}%` }}
        />
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        <span className="truncate">{formatBytes(usedBytes)} used</span>
        <span>{limitFormatted}</span>
      </div>

      {hasProStorage ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words text-[11px] font-semibold leading-4">Drivea Pro Active (100 GB)</span>
          </div>
          <button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Manage Subscription
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setUpgradeOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f15a24] px-3 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#f15a24]/20 transition-colors hover:bg-[#d94e1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Upgrade Storage</span>
        </button>
      )}
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        isPro={hasProStorage}
        hasBillingCustomer={liveStorage.hasBillingCustomer}
      />
    </div>
  )
}
