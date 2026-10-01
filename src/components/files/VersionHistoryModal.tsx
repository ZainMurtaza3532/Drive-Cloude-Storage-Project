'use client'

import { useEffect, useState } from 'react'
import { Download, History, LoaderCircle, RotateCcw, X } from 'lucide-react'
import type { DriveFile } from '@/components/files/FileExplorer'

type FileVersion = {
  id: string
  versionNumber: number
  size: number
  mimeType: string
  createdAt: string
  isCurrent: boolean
}

type VersionsResponse = { versions?: FileVersion[]; error?: string }
type RestoreResponse = { file?: DriveFile; error?: string }

function formatSize(size: number) {
  if (size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(date: string) {
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return 'Unknown date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate)
}

export function VersionHistoryModal({
  file,
  onClose,
  onRestored,
  canRestore = true,
}: {
  file: DriveFile | null
  onClose: () => void
  onRestored: (file: DriveFile) => void
  canRestore?: boolean
}) {
  const [versions, setVersions] = useState<FileVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file) return

    const controller = new AbortController()
    setVersions([])
    setError('')
    setLoading(true)

    fetch(`/api/files/${encodeURIComponent(file.id)}/versions`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as VersionsResponse | null
        if (!response.ok) throw new Error(data?.error ?? 'Unable to load version history.')
        if (!data) throw new Error('The server returned an invalid version history response.')
        setVersions(data.versions ?? [])
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return
        setError(loadError instanceof Error ? loadError.message : 'Unable to load version history.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [file])

  if (!file) return null

  async function restoreVersion(version: FileVersion) {
    setRestoringId(version.id)
    setError('')
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(file.id)}/versions/${encodeURIComponent(version.id)}/restore`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => null) as RestoreResponse | null
      if (!response.ok) throw new Error(data?.error ?? 'Unable to restore this version.')
      if (!data?.file) throw new Error('The server returned an invalid restore response.')
      onRestored(data.file)
      onClose()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'Unable to restore this version.')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#131922]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f15a24]/10 text-[#f15a24]"><History className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 id="version-history-title" className="text-lg font-semibold text-slate-900 dark:text-white">Version history</h2>
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{file.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close version history" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[min(60vh,32rem)] overflow-y-auto p-5">
          {loading ? (
            <p className="flex items-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading versions...</p>
          ) : error ? (
            <p role="alert" className="py-5 text-sm text-rose-600 dark:text-rose-400">{error}</p>
          ) : versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">No previous versions found.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Version {version.versionNumber}
                      {version.isCurrent && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Current</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(version.createdAt)} · {formatSize(version.size)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/api/files/${encodeURIComponent(file.id)}/versions/${encodeURIComponent(version.id)}/download`}
                      aria-label={`Download version ${version.versionNumber}`}
                      title="Download version"
                      className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                    ><Download className="h-4 w-4" /></a>
                    {canRestore && !version.isCurrent && <button
                      type="button"
                      onClick={() => void restoreVersion(version)}
                      disabled={restoringId !== null}
                      aria-label={`Restore version ${version.versionNumber}`}
                      title="Restore this version"
                      className="rounded-md p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                    >{restoringId === version.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}