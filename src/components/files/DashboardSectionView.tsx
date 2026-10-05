'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Folder, RotateCcw, Star, Trash2 } from 'lucide-react'
import { FileExplorer, type DriveFile } from '@/components/files/FileExplorer'
import { FilePreviewModal } from '@/components/files/FilePreviewModal'
import { ShareModal } from '@/components/files/ShareModal'
import { VersionHistoryModal } from '@/components/files/VersionHistoryModal'
import { StorageMeter } from '@/components/StorageMeter'
import { StorageInsights, type CleanupSuggestion, type StorageBreakdownItem } from '@/components/StorageInsights'
import { formatBytes } from '@/lib/quota'

export type DashboardSection = 'recent' | 'starred' | 'trash' | 'storage'

type SectionFolder = {
    id: string
    name: string
    updatedAt: string
    trashedAt: string | null
    isStarred: boolean
    isTrash: boolean
}

type StorageSummary = {
    storageUsed: number
    storageLimit: number
    fileCount: number
    isPro: boolean
    hasBillingCustomer: boolean
    breakdown: StorageBreakdownItem[]
    suggestions: {
        largeFiles: CleanupSuggestion[]
        duplicates: CleanupSuggestion[]
        oldFiles: CleanupSuggestion[]
        duplicateScanTruncated: boolean
        checksumColumnAvailable?: boolean
    }
}

const sectionDetails: Record<DashboardSection, { title: string; description: string }> = {
    recent: { title: 'Recent', description: 'Files you have worked with recently.' },
    starred: { title: 'Starred', description: 'Your starred files and folders.' },
    trash: { title: 'Trash', description: 'Items you have moved to trash.' },
    storage: { title: 'Storage', description: 'Your storage usage and account capacity.' },
}

function groupRecentFiles(files: DriveFile[]) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7))
    const groups = new Map<string, DriveFile[]>([
        ['Today', []],
        ['Yesterday', []],
        ['Earlier this week', []],
        ['Earlier', []],
    ])

    for (const file of files) {
        const modified = new Date(file.updatedAt)
        modified.setHours(0, 0, 0, 0)
        const label = modified.getTime() === today.getTime()
            ? 'Today'
            : modified.getTime() === yesterday.getTime()
                ? 'Yesterday'
                : modified >= startOfWeek
                    ? 'Earlier this week'
                    : 'Earlier'
        groups.get(label)?.push(file)
    }

    return [...groups].map(([label, groupedFiles]) => ({ label, files: groupedFiles }))
}

export function DashboardSectionView({ section }: { section: DashboardSection }) {
    const [files, setFiles] = useState<DriveFile[]>([])
    const [folders, setFolders] = useState<SectionFolder[]>([])
    const [storage, setStorage] = useState<StorageSummary | null>(null)
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)
    const [versionHistoryFile, setVersionHistoryFile] = useState<DriveFile | null>(null)
    const [shareResource, setShareResource] = useState<{ id: string; name: string; type: 'file' } | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [reloadToken, setReloadToken] = useState(0)
    const details = sectionDetails[section]

    useEffect(() => {
        const controller = new AbortController()

        async function loadSection() {
            setIsLoading(true)
            setError('')

            try {
                if (section === 'storage') {
                    const [summaryResponse, insightsResponse] = await Promise.all([
                        fetch('/api/storage', { signal: controller.signal }),
                        fetch('/api/storage/insights', { signal: controller.signal }),
                    ])
                    const [summary, insights] = await Promise.all([
                        summaryResponse.json().catch(() => null),
                        insightsResponse.json().catch(() => null),
                    ])
                    if (!summaryResponse.ok) throw new Error(summary?.error ?? 'Unable to load storage usage.')
                    if (!insightsResponse.ok) throw new Error(insights?.error ?? 'Unable to load storage insights.')
                    if (!summary || !insights) throw new Error('The server returned an invalid storage response.')
                    setStorage({ ...summary, ...insights })
                    return
                }

                const fileResponse = await fetch(`/api/files?view=${section}`, { signal: controller.signal })
                const fileData = await fileResponse.json().catch(() => null)
                if (!fileResponse.ok) throw new Error(fileData?.error ?? 'Unable to load files.')
                if (!fileData) throw new Error('The server returned an invalid files response.')
                setFiles(fileData.files ?? [])

                if (section === 'starred' || section === 'trash') {
                    const folderResponse = await fetch(`/api/folders?view=${section}`, { signal: controller.signal })
                    const folderData = await folderResponse.json().catch(() => null)
                    if (!folderResponse.ok) throw new Error(folderData?.error ?? 'Unable to load folders.')
                    if (!folderData) throw new Error('The server returned an invalid folders response.')
                    setFolders(folderData.folders ?? [])
                } else {
                    setFolders([])
                }
            } catch (loadError) {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return
                setError(loadError instanceof Error ? loadError.message : 'Unable to load this view.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        loadSection()
        return () => controller.abort()
    }, [section, reloadToken])

    async function updateFile(fileId: string, body: { isStarred?: boolean; action?: 'trash' | 'restore' }) {
        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to update file.')
            setReloadToken((current) => current + 1)
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'Unable to update file.')
        }
    }

    async function updateFolder(folderId: string, body: { isStarred?: boolean; isTrash?: boolean }) {
        try {
            const response = await fetch(`/api/folders/${folderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to update folder.')
            setReloadToken((current) => current + 1)
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'Unable to update folder.')
        }
    }

    async function deleteFolderPermanently(folderId: string) {
        if (!window.confirm('Permanently delete this folder and all of its contents?')) return

        try {
            const response = await fetch(`/api/folders/${folderId}?permanent=1`, { method: 'DELETE' })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to permanently delete folder.')
            setReloadToken((current) => current + 1)
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'Unable to permanently delete folder.')
        }
    }

    async function applyBulkFileAction(action: 'trash' | 'restore' | 'delete', fileIds: string[]) {
        if (action === 'delete' && !window.confirm(`Permanently delete ${fileIds.length} selected file(s)?`)) return

        try {
            const response = await fetch('/api/files/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, fileIds }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to update selected files.')
            setReloadToken((current) => current + 1)
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'Unable to update selected files.')
        }
    }

    async function downloadSelectedFiles(fileIds: string[]) {
        if (!fileIds.length) return
        const query = new URLSearchParams({ fileIds: fileIds.join(',') })
        window.location.assign(`/api/files/download-zip?${query}`)
    }

    async function emptyTrash() {
        if (!window.confirm('Permanently delete every item in Trash? This cannot be undone.')) return

        try {
            const response = await fetch('/api/trash', { method: 'DELETE' })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to empty Trash.')
            setReloadToken((current) => current + 1)
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'Unable to empty Trash.')
        }
    }

    function toggleFileStar(fileId: string) {
        const file = files.find((item) => item.id === fileId)
        if (file) return updateFile(fileId, { isStarred: !file.isStarred })
    }

    function toggleFolderStar(folderId: string) {
        const folder = folders.find((item) => item.id === folderId)
        if (folder) return updateFolder(folderId, { isStarred: !folder.isStarred })
    }

    const recentGroups = section === 'recent' ? groupRecentFiles(files) : []
    const renderFileExplorer = (items: DriveFile[], grouped = false) => (
        <FileExplorer
            files={items}
            groups={grouped ? recentGroups : undefined}
            onOpen={setSelectedFile}
            onToggleStar={section === 'trash' ? undefined : toggleFileStar}
            onTrash={section === 'trash' ? undefined : (fileId) => updateFile(fileId, { action: 'trash' })}
            onRestore={section === 'trash' ? (fileId) => updateFile(fileId, { action: 'restore' }) : undefined}
            onDeletePermanently={section === 'trash' ? (fileId) => applyBulkFileAction('delete', [fileId]) : undefined}
            onBulkTrash={section === 'trash' ? undefined : (fileIds) => applyBulkFileAction('trash', fileIds)}
            onBulkRestore={section === 'trash' ? (fileIds) => applyBulkFileAction('restore', fileIds) : undefined}
            onBulkDeletePermanently={section === 'trash' ? (fileIds) => applyBulkFileAction('delete', fileIds) : undefined}
            onBulkDownload={section === 'trash' ? undefined : downloadSelectedFiles}
            onShare={section === 'trash' ? undefined : (file) => setShareResource({ id: file.id, name: file.name, type: 'file' })}
            onVersionHistory={section === 'trash' ? undefined : setVersionHistoryFile}
            trashView={section === 'trash'}
        />
    )

    return (
        <div className="space-y-6">
            <div>
                <Link href="/dashboard" className="text-xs font-semibold uppercase tracking-wider text-[#f15a24] hover:text-[#d94e1b] transition-colors">
                    ← Back to My Drive
                </Link>
                <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{details.title}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{details.description}</p>
            </div>

            {section === 'trash' && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={emptyTrash}
                        disabled={isLoading || (files.length === 0 && folders.length === 0)}
                        className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-rose-700 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-[0.98]"
                    >
                        <Trash2 className="h-4 w-4" /> Empty Trash
                    </button>
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-2xl border border-rose-200/80 bg-rose-50/90 dark:border-rose-900/60 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
                    {error}
                </div>
            )}

            {section === 'storage' ? (
                isLoading ? (
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-sm text-slate-500 dark:text-slate-400">Loading storage usage...</div>
                ) : storage ? (
                    <div className="max-w-3xl space-y-6">
                        <StorageMeter
                            storageUsed={storage.storageUsed}
                            storageLimit={storage.storageLimit}
                            isPro={storage.isPro}
                            hasBillingCustomer={storage.hasBillingCustomer}
                        />
                        <StorageInsights
                            breakdown={storage.breakdown ?? []}
                            suggestions={storage.suggestions ?? { largeFiles: [], duplicates: [], oldFiles: [], duplicateScanTruncated: false, checksumColumnAvailable: true }}
                            onTrash={(fileId) => void updateFile(fileId, { action: 'trash' })}
                        />
                        <dl className="grid grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] p-5 shadow-2xs">
                                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Available</dt>
                                <dd className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                                    {formatBytes(Math.max(storage.storageLimit - storage.storageUsed, 0))}
                                </dd>
                            </div>
                            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] p-5 shadow-2xs">
                                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Files</dt>
                                <dd className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{storage.fileCount}</dd>
                            </div>
                        </dl>
                    </div>
                ) : null
            ) : (
                <>
                    {isLoading ? (
                        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 text-sm text-slate-500 dark:text-slate-400">Loading {details.title.toLowerCase()}...</div>
                    ) : (
                        <>
                            {(section === 'starred' || section === 'trash') && folders.length > 0 && (
                                <section className="space-y-3" aria-label={`${details.title} folders`}>
                                    <h2 className="text-base font-bold text-slate-900 dark:text-white">Folders</h2>
                                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] shadow-2xs overflow-hidden">
                                        {folders.map((folder) => (
                                            <li key={folder.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <Folder className="h-5 w-5 shrink-0 text-amber-500 fill-amber-500/20" />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{folder.name}</span>
                                                <time className="shrink-0 text-xs text-slate-500 dark:text-slate-400" dateTime={section === 'trash' ? folder.trashedAt ?? folder.updatedAt : folder.updatedAt}>
                                                    {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(section === 'trash' ? folder.trashedAt ?? folder.updatedAt : folder.updatedAt))}
                                                </time>
                                                {section === 'starred' ? (
                                                    <button type="button" onClick={() => void toggleFolderStar(folder.id)} aria-label={`Unstar ${folder.name}`} title="Unstar folder" className="rounded p-1.5 text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10">
                                                        <Star className="h-4 w-4 fill-amber-400" />
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <button type="button" onClick={() => void updateFolder(folder.id, { isTrash: false })} aria-label={`Restore ${folder.name}`} title="Restore folder" className="rounded p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10">
                                                            <RotateCcw className="h-4 w-4" />
                                                        </button>
                                                        <button type="button" onClick={() => void deleteFolderPermanently(folder.id)} aria-label={`Delete ${folder.name} permanently`} title="Delete permanently" className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/10">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            )}
                            {section === 'recent' ? (
                                renderFileExplorer(files, true)
                            ) : renderFileExplorer(files)}
                        </>
                    )}
                </>
            )}

            <FilePreviewModal
                file={selectedFile}
                files={files}
                onNavigate={setSelectedFile}
                onShare={section === 'trash' ? undefined : (file) => setShareResource({ id: file.id, name: file.name, type: 'file' })}
                onClose={() => setSelectedFile(null)}
            />
            <ShareModal resource={shareResource} onClose={() => setShareResource(null)} />
            <VersionHistoryModal
                file={versionHistoryFile}
                onClose={() => setVersionHistoryFile(null)}
                onRestored={(file) => {
                    setFiles((current) => current.map((item) => (item.id === file.id ? { ...item, ...file } : item)))
                    setSelectedFile((current) => (current?.id === file.id ? { ...current, ...file } : current))
                }}
            />
        </div>
    )
}