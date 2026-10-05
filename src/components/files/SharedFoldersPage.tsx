'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Folder, FolderPlus, FolderUp, Upload } from 'lucide-react'
import { FileExplorer, type DriveFile } from '@/components/files/FileExplorer'
import { FilePreviewModal } from '@/components/files/FilePreviewModal'
import { VersionHistoryModal } from '@/components/files/VersionHistoryModal'
import { UploadDropzone } from '@/components/uploads/UploadDropzone'

type SharedFolder = {
    id: string
    name: string
    parentId: string | null
    updatedAt?: string
    owner: string
    role: 'OWNER' | 'EDITOR' | 'VIEWER'
}

type SharedFolderResponse = {
    folder?: SharedFolder
    folders?: SharedFolder[]
    files?: DriveFile[]
    error?: string
}

export function SharedFoldersPage() {
    const [folderStack, setFolderStack] = useState<SharedFolder[]>([])
    const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([])
    const [childFolders, setChildFolders] = useState<SharedFolder[]>([])
    const [files, setFiles] = useState<DriveFile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [reloadToken, setReloadToken] = useState(0)
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)
    const [versionHistoryFile, setVersionHistoryFile] = useState<DriveFile | null>(null)
    const currentFolder = folderStack.at(-1) ?? null
    const canEdit = currentFolder?.role === 'OWNER' || currentFolder?.role === 'EDITOR'

    useEffect(() => {
        const controller = new AbortController()
        setIsLoading(true)
        setError('')
        const query = currentFolder ? `?folderId=${encodeURIComponent(currentFolder.id)}` : ''

        fetch(`/api/shared${query}`, { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json() as SharedFolderResponse
                if (!response.ok) throw new Error(data.error ?? 'Unable to load shared folders.')
                if (currentFolder) {
                    if (!data.folder) throw new Error('This shared folder is no longer available.')
                    setFolderStack((current) => current.map((item) => item.id === data.folder?.id ? data.folder : item))
                    setChildFolders(data.folders ?? [])
                    setFiles(data.files ?? [])
                } else {
                    setSharedFolders(data.folders ?? [])
                    setChildFolders([])
                    setFiles([])
                }
            })
            .catch((loadError) => {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return
                setError(loadError instanceof Error ? loadError.message : 'Unable to load shared folders.')
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false)
            })

        return () => controller.abort()
    }, [currentFolder?.id, reloadToken])

    useEffect(() => {
        function handleFileUploaded(event: Event) {
            const file = (event as CustomEvent<DriveFile>).detail
            if (file?.folderId === currentFolder?.id) {
                setFiles((current) => [file, ...current.filter((item) => item.id !== file.id)])
            }
        }
        window.addEventListener('drivea:file-uploaded', handleFileUploaded)
        return () => window.removeEventListener('drivea:file-uploaded', handleFileUploaded)
    }, [currentFolder?.id])

    useEffect(() => {
        function handleFoldersCreated(event: Event) {
            const parentId = (event as CustomEvent<{ parentId: string | null }>).detail?.parentId ?? null
            if (parentId === currentFolder?.id) setReloadToken((current) => current + 1)
        }
        window.addEventListener('drivea:folders-created', handleFoldersCreated)
        return () => window.removeEventListener('drivea:folders-created', handleFoldersCreated)
    }, [currentFolder?.id])

    function openFolder(folder: SharedFolder) {
        setFolderStack((current) => [...current, folder])
    }

    async function moveFileToTrash(fileId: string) {
        const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'trash' }),
        })
        const data = await response.json()
        if (!response.ok) {
            setError(data.error ?? 'Unable to move this file to Trash.')
            return
        }
        setFiles((current) => current.filter((file) => file.id !== fileId))
    }

    async function createSubfolder() {
        if (!currentFolder) return
        const name = window.prompt('New folder name')?.trim()
        if (!name) return

        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parentId: currentFolder.id }),
        })
        const data = await response.json()
        if (!response.ok) {
            setError(data.error ?? 'Unable to create this folder.')
            return
        }
        setReloadToken((current) => current + 1)
    }

    function renderContent(openFileDialog: () => void, openFolderDialog: () => void) {
        return (
            <div className="space-y-6">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#f15a24]">Drive Storage workspace</p>
                        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {currentFolder?.name ?? 'Shared with me'}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            {currentFolder ? `Shared by ${currentFolder.owner}` : 'Folders other people have shared with you.'}
                        </p>
                    </div>
                    {currentFolder && (
                        <div className="flex items-center gap-2">
                            {canEdit && (
                                <>
                                    <button type="button" onClick={openFileDialog} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#f15a24] hover:text-[#f15a24] dark:border-slate-700 dark:bg-[#131922] dark:text-slate-200">
                                        <Upload className="h-4 w-4" /> Upload files
                                    </button>
                                    <button type="button" onClick={openFolderDialog} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#f15a24] hover:text-[#f15a24] dark:border-slate-700 dark:bg-[#131922] dark:text-slate-200">
                                        <FolderUp className="h-4 w-4" /> Upload folder
                                    </button>
                                    <button type="button" onClick={() => void createSubfolder()} className="inline-flex items-center gap-2 rounded-md bg-[#f15a24] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d94e1b]">
                                        <FolderPlus className="h-4 w-4" /> New folder
                                    </button>
                                </>
                            )}
                            <span className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${canEdit ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                {currentFolder.role === 'OWNER' ? 'Owner' : currentFolder.role === 'EDITOR' ? 'Editor' : 'Viewer'}
                            </span>
                        </div>
                    )}
                </header>

                {currentFolder && (
                    <button
                        type="button"
                        onClick={() => setFolderStack((current) => current.slice(0, -1))}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#f15a24] dark:text-slate-300"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        {folderStack.length > 1 ? folderStack[folderStack.length - 2].name : 'Shared with me'}
                    </button>
                )}

                {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

                {isLoading ? (
                    <p className="py-12 text-center text-sm text-slate-500">Loading shared items...</p>
                ) : currentFolder ? (
                    <>
                        {childFolders.length > 0 && (
                            <section aria-label="Shared subfolders" className="space-y-3">
                                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Folders</h2>
                                <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#131922]">
                                    {childFolders.map((folder) => (
                                        <li key={folder.id}>
                                            <button type="button" onClick={() => openFolder(folder)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <Folder className="h-5 w-5 shrink-0 fill-amber-500/15 text-amber-500" />
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{folder.name}</span>
                                                <span className="text-xs text-slate-500">{folder.owner}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                        <FileExplorer
                            files={files}
                            onOpen={setSelectedFile}
                            onTrash={canEdit ? moveFileToTrash : undefined}
                            onVersionHistory={setVersionHistoryFile}
                        />
                    </>
                ) : sharedFolders.length ? (
                    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-[#131922]">
                        {sharedFolders.map((folder) => (
                            <li key={folder.id}>
                                <button type="button" onClick={() => openFolder(folder)} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <Folder className="h-5 w-5 shrink-0 fill-amber-500/15 text-amber-500" />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{folder.name}</span>
                                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">Shared by {folder.owner}</span>
                                    </span>
                                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{folder.role === 'EDITOR' ? 'Editor' : 'Viewer'}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="border-y border-slate-200 py-16 text-center dark:border-slate-800">
                        <Folder className="mx-auto h-8 w-8 text-slate-400" />
                        <h2 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">No folders shared with you</h2>
                    </div>
                )}

                <FilePreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} />
                <VersionHistoryModal
                    file={versionHistoryFile}
                    canRestore={canEdit}
                    onClose={() => setVersionHistoryFile(null)}
                    onRestored={(file) => {
                        setFiles((current) => current.map((item) => item.id === file.id ? { ...item, ...file } : item))
                        setSelectedFile((current) => current?.id === file.id ? { ...current, ...file } : current)
                    }}
                />
            </div>
        )
    }

    if (currentFolder && canEdit) {
        return <UploadDropzone folderId={currentFolder.id}>{renderContent}</UploadDropzone>
    }
    return renderContent(() => undefined, () => undefined)
}