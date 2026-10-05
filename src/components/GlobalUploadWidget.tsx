'use client'

import { Check, ChevronDown, ChevronUp, CircleAlert, Clock3, LoaderCircle, Pause, Play, UploadCloud, X } from 'lucide-react'
import { formatBytes } from '@/lib/quota'
import { useUpload } from '@/context/UploadContext'

const activeStatuses = new Set(['PREPARING', 'UPLOADING'])

export function GlobalUploadWidget() {
    const { uploads, cancelUpload, pauseUpload, resumeUpload, toggleWidget, isWidgetMinimized } = useUpload()
    if (uploads.length === 0) return null

    const activeCount = uploads.filter((upload) => activeStatuses.has(upload.status)).length
    const queuedCount = uploads.filter((upload) => upload.status === 'QUEUED').length
    const completedCount = uploads.filter((upload) => upload.status === 'COMPLETED').length
    const allCompleted = activeCount === 0 && completedCount === uploads.length
    const totalSize = uploads.reduce((total, upload) => total + upload.fileSize, 0)
    const transferred = uploads.reduce((total, upload) => total + upload.fileSize * upload.progress / 100, 0)
    const overallProgress = totalSize > 0
        ? Math.round((transferred / totalSize) * 100)
        : allCompleted ? 100 : 0
    const totalSpeed = uploads.reduce((total, upload) => total + upload.speed, 0)

    if (isWidgetMinimized) {
        return (
            <button
                type="button"
                onClick={toggleWidget}
                className="fixed bottom-4 right-4 z-50 flex w-[min(19rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl dark:border-slate-700 dark:bg-[#131922]"
                aria-label={`Expand upload activity, ${overallProgress}% complete`}
            >
                <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: `conic-gradient(#f15a24 ${overallProgress}%, #e2e8f0 ${overallProgress}%)` }}
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-700 dark:bg-[#131922] dark:text-slate-100">
                        {allCompleted ? <Check className="h-4 w-4 text-emerald-500" /> : `${overallProgress}%`}
                    </span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {activeCount ? `Uploading ${activeCount} item${activeCount === 1 ? '' : 's'}` : 'Upload activity'}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {activeCount ? `${formatBytes(totalSpeed)}/s${queuedCount ? ` · ${queuedCount} queued` : ''}` : `${queuedCount} queued · ${completedCount} completed`}
                    </span>
                </span>
                <ChevronUp className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
        )
    }

    return (
        <aside className="fixed bottom-4 right-4 z-50 w-[min(25rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#131922]">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex min-w-0 items-center gap-2.5">
                    {allCompleted
                        ? <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                        : <UploadCloud className="h-4 w-4 shrink-0 text-[#f15a24]" />}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {activeCount
                                ? `Uploading ${activeCount} item${activeCount === 1 ? '' : 's'}...`
                                : allCompleted ? 'All uploads completed' : 'Upload activity'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            {completedCount} completed{activeCount ? ` · ${activeCount} active · ${formatBytes(totalSpeed)}/s` : ''}{queuedCount ? ` · ${queuedCount} queued` : ''}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={toggleWidget}
                    className="ml-2 rounded-md p-1.5 text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
                    aria-label="Minimize upload activity"
                    title="Minimize"
                >
                    <ChevronDown className="h-4 w-4" />
                </button>
            </header>

            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {uploads.map((upload) => {
                    const isActive = activeStatuses.has(upload.status)
                    const label = upload.status === 'QUEUED'
                        ? 'Queued'
                        : upload.status === 'UPLOADING'
                        ? `${upload.progress}% · ${formatBytes(upload.speed)}/s`
                        : upload.status === 'PREPARING'
                            ? upload.progress === 100 ? 'Saving file details...' : 'Preparing upload...'
                            : upload.status === 'PAUSED'
                                ? 'Paused'
                                : upload.status === 'COMPLETED'
                                    ? 'Complete'
                                    : upload.status === 'CANCELLED' ? 'Canceled' : upload.error ?? 'Upload failed.'

                    return (
                        <li key={upload.id} className="px-4 py-3">
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 shrink-0">
                                    {upload.status === 'COMPLETED'
                                        ? <Check className="h-4 w-4 text-emerald-500" />
                                        : upload.status === 'QUEUED'
                                            ? <Clock3 className="h-4 w-4 text-slate-400" />
                                        : isActive
                                            ? <LoaderCircle className="h-4 w-4 animate-spin text-[#f15a24]" />
                                            : upload.status === 'ERROR'
                                                ? <CircleAlert className="h-4 w-4 text-rose-500" />
                                                : <X className="h-4 w-4 text-slate-400" />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={upload.fileName}>
                                            {upload.fileName}
                                        </p>
                                        {upload.status === 'UPLOADING' && (
                                            <button
                                                type="button"
                                                onClick={() => pauseUpload(upload.id)}
                                                className="-mr-1 rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-400"
                                                aria-label={`Pause upload of ${upload.fileName}`}
                                                title="Pause upload"
                                            >
                                                <Pause className="h-4 w-4" />
                                            </button>
                                        )}
                                        {(upload.status === 'PAUSED' || upload.status === 'ERROR') && (
                                            <button
                                                type="button"
                                                onClick={() => resumeUpload(upload.id)}
                                                className="-mr-1 rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                                                aria-label={`Resume upload of ${upload.fileName}`}
                                                title="Resume upload"
                                            >
                                                <Play className="h-4 w-4" />
                                            </button>
                                        )}
                                        {(isActive || upload.status === 'QUEUED' || upload.status === 'PAUSED' || upload.status === 'ERROR') && (
                                            <button
                                                type="button"
                                                onClick={() => cancelUpload(upload.id)}
                                                className="-mr-1 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                                                aria-label={`Cancel upload of ${upload.fileName}`}
                                                title="Cancel upload"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                                        <span>{formatBytes(upload.fileSize)}</span>
                                        <span className={`truncate text-right ${upload.status === 'ERROR' ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                                            {label}
                                        </span>
                                    </div>
                                    {isActive && (
                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className="h-full rounded-full bg-[#f15a24] transition-[width] duration-200"
                                                style={{ width: `${upload.status === 'PREPARING' && upload.progress === 100 ? 100 : upload.progress}%` }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </li>
                    )
                })}
            </ul>
        </aside>
    )
}