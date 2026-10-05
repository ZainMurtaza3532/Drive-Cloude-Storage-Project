'use client'

import { useMemo } from 'react'
import { formatBytes } from '@/lib/quota'
import { Archive, Copy, Image, Music2, FileText, Video } from 'lucide-react'

export type StorageBreakdownItem = { category: string; bytes: number }
export type CleanupSuggestion = {
  id: string
  name: string
  size: number
  reason: string
  updatedAt?: string
}

type StorageSuggestions = {
  largeFiles: CleanupSuggestion[]
  duplicates: CleanupSuggestion[]
  oldFiles: CleanupSuggestion[]
  duplicateScanTruncated: boolean
}

const categoryStyles: Record<string, { color: string; icon: typeof Image }> = {
  Images: { color: '#8b5cf6', icon: Image },
  Videos: { color: '#ef4444', icon: Video },
  Audio: { color: '#06b6d4', icon: Music2 },
  Documents: { color: '#f59e0b', icon: FileText },
  Other: { color: '#64748b', icon: Archive },
}

export function StorageInsights({
  breakdown,
  suggestions,
  onTrash,
}: {
  breakdown: StorageBreakdownItem[]
  suggestions: StorageSuggestions
  onTrash: (fileId: string) => void
}) {
  const totalBytes = breakdown.reduce((total, item) => total + item.bytes, 0)
  const { gradient, segments } = useMemo(() => {
    let end = 0
    const segments = breakdown.map((item) => {
      const start = end
      end += totalBytes > 0 ? item.bytes / totalBytes * 100 : 0
      return { ...item, start, end, percentage: totalBytes > 0 ? item.bytes / totalBytes * 100 : 0 }
    })
    const gradient = segments.length
      ? `conic-gradient(${segments.map((item) => `${categoryStyles[item.category]?.color ?? categoryStyles.Other.color} ${item.start}% ${item.end}%`).join(', ')})`
      : 'conic-gradient(#e2e8f0 0% 100%)'
    return { gradient, segments }
  }, [breakdown, totalBytes])

  const suggestionGroups = [
    { title: 'Large files', files: suggestions.largeFiles, reason: 'Over 50 MB' },
    { title: 'Duplicate candidates', files: suggestions.duplicates, reason: 'Review before deleting' },
    { title: 'Older files', files: suggestions.oldFiles, reason: 'Not modified in over a year' },
  ]
  const hasSuggestions = suggestionGroups.some(({ files }) => files.length > 0)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131922]">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Storage breakdown</h2>
        {totalBytes > 0 ? (
          <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
            <div
              className="relative h-40 w-40 shrink-0 rounded-full"
              role="img"
              aria-label={`Storage by file type. ${segments.map(({ category, percentage }) => `${category}: ${percentage.toFixed(1)} percent`).join(', ')}`}
              style={{ background: gradient }}
            >
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#131922]">
                <span className="text-xs text-slate-500 dark:text-slate-400">In use</span>
                <span className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatBytes(totalBytes)}</span>
              </div>
            </div>
            <ul className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {segments.map((item) => {
                const Icon = categoryStyles[item.category]?.icon ?? Archive
                return (
                  <li key={item.category} className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: categoryStyles[item.category]?.color ?? categoryStyles.Other.color }} />
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{item.category}</span>
                    <span className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">{formatBytes(item.bytes)} · {item.percentage.toFixed(1)}%</span>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No file storage usage to break down yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-[#131922]">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Cleanup suggestions</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Review these files and move any you no longer need to Trash.</p>
        </div>
        {suggestions.duplicateScanTruncated && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Duplicate candidates are based on the most recently updated 2,000 files. Upload checksums are not available for every existing file.</p>
        )}
        {!hasSuggestions ? (
          <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">No cleanup suggestions right now.</p>
        ) : (
          <div className="mt-4 space-y-5">
            {suggestionGroups.map(({ title, files, reason }) => files.length > 0 && (
              <div key={title}>
                <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {files.map((file) => (
                    <li key={`${title}:${file.id}`} className="flex min-w-0 items-center gap-3 py-2.5">
                      {title === 'Duplicate candidates' ? <Copy className="h-4 w-4 shrink-0 text-violet-500" /> : <Archive className="h-4 w-4 shrink-0 text-slate-400" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{file.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{file.reason || reason} · {formatBytes(file.size)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onTrash(file.id)}
                        className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-200 dark:hover:border-rose-800 dark:hover:text-rose-300"
                      >
                        Move to Trash
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
