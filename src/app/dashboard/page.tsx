'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, FolderPlus, FolderUp, LockKeyhole, Plus, Upload, AlertCircle, RefreshCw, X } from 'lucide-react'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { CreateFolderModal } from '@/components/folders/CreateFolderModal'
import { ManageAccessModal } from '@/components/folders/ManageAccessModal'
import { FolderCard, FolderItem } from '@/components/folders/FolderCard'
import { FileExplorer, DriveFile } from '@/components/files/FileExplorer'
import { FilePreviewModal } from '@/components/files/FilePreviewModal'
import { ShareModal } from '@/components/files/ShareModal'
import { VersionHistoryModal } from '@/components/files/VersionHistoryModal'
import { UploadDropzone } from '@/components/uploads/UploadDropzone'
import { VaultModal } from '@/components/vault/VaultModal'
import { useUpload } from '@/context/UploadContext'

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-sm text-slate-400">
          Loading drive...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const { unlockVault, lockVault, vaultFolderId } = useUpload()
  const router = useRouter()
  const searchParams = useSearchParams()
  const folderId = searchParams.get('folderId')

  const [folders, setFolders] = useState<FolderItem[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<DriveFile[]>([])
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(() => new Set())
  const [clipboardFileIds, setClipboardFileIds] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)
  const [versionHistoryFile, setVersionHistoryFile] = useState<DriveFile | null>(null)
  const [shareResource, setShareResource] = useState<{ id: string; name: string; type: 'file' | 'folder' } | null>(null)
  const [accessFolder, setAccessFolder] = useState<{ id: string; name: string } | null>(null)
  const [isCreateModalOpen, setCreateModalOpen] = useState(false)
  const [isVaultModalOpen, setVaultModalOpen] = useState(false)
  const [folderPermission, setFolderPermission] = useState<'OWNER' | 'EDITOR' | 'VIEWER'>('OWNER')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ label: string; href: string }>>([
    { label: 'My Drive', href: '/dashboard' },
  ])

  useEffect(() => {
    setSelectedFolderIds(new Set())
    async function loadFolders() {
      setIsLoading(true)
      setError('')
      setFolderPermission(folderId ? 'VIEWER' : 'OWNER')

      try {
        const query = folderId ? `?parentId=${encodeURIComponent(folderId)}` : ''
        const response = await fetch(`/api/folders${query}`)
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error ?? 'Unable to load folders.')
        }

        setFolders(data.folders ?? [])
        setFolderPermission(data.folderPermission ?? 'OWNER')
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load folders.')
      } finally {
        setIsLoading(false)
      }
    }

    loadFolders()
  }, [folderId])

  useEffect(() => {
    async function loadFiles() {
      try {
        const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
        const response = await fetch(`/api/files${query}`)
        const data = await response.json()
        if (!response.ok) {
          setError(data.error ?? 'Unable to load files.')
          setUploadedFiles([])
          return
        }

        setUploadedFiles(data.files ?? [])
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load files.')
        setUploadedFiles([])
      }
    }

    loadFiles()
  }, [folderId])

  useEffect(() => {
    function handleFileUploaded(event: Event) {
      const file = (event as CustomEvent<DriveFile>).detail
      if (!file) return
      setUploadedFiles((current) => [file, ...current.filter((item) => item.id !== file.id)])
    }

    window.addEventListener('drivea:file-uploaded', handleFileUploaded)
    return () => window.removeEventListener('drivea:file-uploaded', handleFileUploaded)
  }, [])

  useEffect(() => {
    function handleFoldersCreated(event: Event) {
      const parentId = (event as CustomEvent<{ parentId: string | null }>).detail?.parentId ?? null
      if (parentId === (folderId || null)) void refreshFolders()
    }
    window.addEventListener('drivea:folders-created', handleFoldersCreated)
    return () => window.removeEventListener('drivea:folders-created', handleFoldersCreated)
  }, [folderId])

  async function refreshFolders() {
    const query = folderId ? `?parentId=${encodeURIComponent(folderId)}` : ''
    const response = await fetch(`/api/folders${query}`)
    if (!response.ok) return

    const data = await response.json()
    setFolders(data.folders ?? [])
  }

  async function refreshFiles() {
    const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''
    const response = await fetch(`/api/files${query}`)
    if (!response.ok) return

    const data = await response.json()
    setUploadedFiles(data.files ?? [])
  }

  async function handleToggleFileStar(fileId: string) {
    const file = uploadedFiles.find((item) => item.id === fileId)
    if (!file) return

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isStarred: !file.isStarred }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to update file.')

      setUploadedFiles((current) =>
        current.map((item) =>
          item.id === fileId ? { ...item, isStarred: data.file.isStarred } : item
        )
      )
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update file.')
    }
  }

  async function handleTrashFile(fileId: string) {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trash' }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to move file to Trash.')

      setUploadedFiles((current) => current.filter((item) => item.id !== fileId))
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to move file to Trash.')
    }
  }

  async function handleBulkFileAction(action: 'trash' | 'restore', fileIds: string[]) {
    try {
      const response = await fetch('/api/files/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, fileIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to update selected files.')
      await refreshFiles()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to update selected files.')
    }
  }

  async function handlePasteFiles() {
    if (!clipboardFileIds.length || folderPermission === 'VIEWER') return

    try {
      const response = await fetch('/api/files/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          fileIds: clipboardFileIds,
          destinationFolderId: folderId,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to paste these files here.')
      setClipboardFileIds([])
      await refreshFiles()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Unable to paste these files here.')
    }
  }

  async function handleBulkDownload(fileIds: string[]) {
    if (!fileIds.length && !selectedFolderIds.size) return
    const query = new URLSearchParams()
    if (fileIds.length) query.set('fileIds', fileIds.join(','))
    if (selectedFolderIds.size) query.set('folderIds', [...selectedFolderIds].join(','))
    window.location.assign(`/api/files/download-zip?${query}`)
    setSelectedFolderIds(new Set())
  }

  async function handleCreateFolder(name: string) {
    const response = await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        parentId: folderId,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Unable to create folder.')
    }

    await refreshFolders()
  }

  async function handleRename(folderIdValue: string, name: string) {
    const response = await fetch(`/api/folders/${folderIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Unable to rename folder.')
    }

    await refreshFolders()
  }

  async function handleToggleStar(folderIdValue: string) {
    const folder = folders.find((item) => item.id === folderIdValue)
    if (!folder) return

    const response = await fetch(`/api/folders/${folderIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStarred: !folder.isStarred }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Unable to update folder.')
    }

    await refreshFolders()
  }

  async function handleMove(folderIdValue: string, newParentId?: string) {
    const response = await fetch(`/api/folders/${folderIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentId: newParentId ?? null }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Unable to move folder.')
    }

    await refreshFolders()
  }

  async function handleDelete(folderIdValue: string) {
    const response = await fetch(`/api/folders/${folderIdValue}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Unable to delete folder.')
    }

    await refreshFolders()
  }

  function handleOpenFolder(nextFolderId: string, nextFolderName: string, afterUnlock = false) {
    const destination = folders.find((folder) => folder.id === nextFolderId)
    if (destination?.isVault && vaultFolderId !== nextFolderId && !afterUnlock) {
      setVaultModalOpen(true)
      return
    }
    setBreadcrumbs((current) => {
      const targetHref = `/dashboard?folderId=${encodeURIComponent(nextFolderId)}`
      if (current.some((item) => item.href === targetHref)) {
        return current
      }
      return [...current, { label: nextFolderName, href: targetHref }]
    })

    router.push(`/dashboard?folderId=${encodeURIComponent(nextFolderId)}`)
  }

  function handleBack() {
    if (!folderId) return
    setBreadcrumbs((current) => (current.length > 1 ? current.slice(0, -1) : current))
    router.push('/dashboard')
  }

  const displayFiles = uploadedFiles.filter((file) => file.folderId === (folderId || null))
  const closePreview = useCallback(() => setSelectedFile(null), [])

  return (
    <UploadDropzone
      folderId={folderId}
      disabled={folderPermission === 'VIEWER'}
    >
      {(openFileDialog, openFolderDialog) => (
        <div className="flex h-full flex-col">
          {/* Top Bar Actions & Breadcrumb Row */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {folderId && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-[#131922] px-3 py-2 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-[#f15a24] hover:text-[#f15a24] dark:hover:text-[#ff7847] transition-all cursor-pointer shadow-2xs"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
              )}
              <Breadcrumbs items={breadcrumbs} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2.5">
              {folderPermission !== 'VIEWER' && <button
                id="trigger-upload-files"
                type="button"
                onClick={openFileDialog}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131922] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-[#f15a24] hover:text-[#f15a24] dark:hover:border-[#f15a24] dark:hover:text-[#ff7847] transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
              >
                <Upload className="h-4 w-4 text-[#f15a24]" />
                <span>Upload files</span>
              </button>}

              {folderPermission !== 'VIEWER' && <button
                id="trigger-upload-folder"
                type="button"
                onClick={openFolderDialog}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#131922] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-[#f15a24] hover:text-[#f15a24] dark:hover:border-[#f15a24] dark:hover:text-[#ff7847] transition-all cursor-pointer shadow-2xs active:scale-[0.98]"
              >
                <FolderUp className="h-4 w-4 text-[#f15a24]" />
                <span>Upload folder</span>
              </button>}

              {vaultFolderId ? (
                <button type="button" onClick={() => { lockVault(); router.push('/dashboard') }} className="inline-flex items-center gap-2 border border-emerald-700/30 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <LockKeyhole className="h-4 w-4" /> Lock Vault
                </button>
              ) : (
                <button type="button" onClick={() => setVaultModalOpen(true)} className="inline-flex items-center gap-2 border border-emerald-700/30 bg-white px-3 py-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 dark:bg-[#131922] dark:text-emerald-300 dark:hover:bg-emerald-500/10">
                  <LockKeyhole className="h-4 w-4" /> Vault
                </button>
              )}

              {folderPermission !== 'VIEWER' && <button
                id="trigger-new-folder"
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#f15a24] hover:bg-[#d94e1b] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-md shadow-[#f15a24]/20 hover:shadow-lg hover:shadow-[#f15a24]/30 transition-all cursor-pointer active:scale-[0.98]"
              >
                <Plus className="h-4 w-4 stroke-[2.5]" />
                <span>New folder</span>
              </button>}
            </div>
          </div>

          <CreateFolderModal
            open={isCreateModalOpen}
            onClose={() => setCreateModalOpen(false)}
            onSubmit={handleCreateFolder}
          />
          <VaultModal
            open={isVaultModalOpen}
            onClose={() => setVaultModalOpen(false)}
            onUnlock={(vaultId, key) => {
              unlockVault(vaultId, key)
              handleOpenFolder(vaultId, 'Vault', true)
            }}
          />

          {/* Dismissable Error Alert Banner */}
          {error && (
            <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/90 dark:bg-rose-950/30 p-4 text-xs sm:text-sm text-rose-700 dark:text-rose-300 shadow-2xs animate-in fade-in duration-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{error}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    refreshFolders()
                    refreshFiles()
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/50 hover:bg-rose-200 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry</span>
                </button>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="p-1 rounded-lg text-rose-400 hover:text-rose-600 transition-colors cursor-pointer"
                  aria-label="Dismiss error"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Folders Section */}
          <div className="mb-10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Folders
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {folders.length}
                </span>
              </div>
              {folders.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkDownload([])}
                  disabled={selectedFolderIds.size === 0}
                  className="text-xs sm:text-sm font-semibold text-[#f15a24] hover:text-[#d94e1b] transition-colors cursor-pointer"
                >
                  Download selected as ZIP{selectedFolderIds.size ? ` (${selectedFolderIds.size})` : ''}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="h-28 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-800/40 animate-pulse p-4"
                  />
                ))}
              </div>
            ) : folders.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {folders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    selectedForDownload={selectedFolderIds.has(folder.id)}
                    onSelectForDownload={(selected) => setSelectedFolderIds((current) => {
                      const next = new Set(current)
                      if (selected) next.add(folder.id)
                      else next.delete(folder.id)
                      return next
                    })}
                    onOpen={(nextFolderId, nextFolderName) =>
                      handleOpenFolder(nextFolderId, nextFolderName)
                    }
                    onRename={handleRename}
                    onToggleStar={async (folderIdValue) => {
                      await handleToggleStar(folderIdValue)
                    }}
                    onMove={async (folderIdValue) => {
                      const nextParentId = window.prompt(
                        'Move to parent folder ID (leave blank to move to root):',
                        ''
                      )
                      await handleMove(folderIdValue, nextParentId?.trim() || undefined)
                    }}
                    onDelete={handleDelete}
                    onShare={(folder) => setShareResource({ id: folder.id, name: folder.name, type: 'folder' })}
                    onManageAccess={(folder) => setAccessFolder({ id: folder.id, name: folder.name })}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/30 px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/15">
                  <FolderPlus className="h-6 w-6 stroke-[2]" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">
                  No folders in this section yet
                </h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Create a folder to start organizing your files.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-[#f15a24]/10 text-[#f15a24] hover:bg-[#f15a24] hover:text-white transition-all cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Folder</span>
                </button>
              </div>
            )}
          </div>

          {/* Files Explorer Section */}
          <FileExplorer
            files={displayFiles}
            onOpen={setSelectedFile}
            onToggleStar={folderPermission === 'VIEWER' ? undefined : handleToggleFileStar}
            onTrash={folderPermission === 'VIEWER' ? undefined : handleTrashFile}
            onBulkTrash={folderPermission === 'VIEWER' ? undefined : (fileIds) => handleBulkFileAction('trash', fileIds)}
            onBulkDownload={handleBulkDownload}
            onCopySelected={setClipboardFileIds}
            onPasteFiles={clipboardFileIds.length && folderPermission !== 'VIEWER' ? handlePasteFiles : undefined}
            onShare={folderPermission === 'OWNER' ? (file) => setShareResource({ id: file.id, name: file.name, type: 'file' }) : undefined}
            onVersionHistory={folderPermission === 'VIEWER' ? undefined : setVersionHistoryFile}
          />

          <FilePreviewModal
            file={selectedFile}
            files={displayFiles}
            onNavigate={setSelectedFile}
            onShare={(file) => setShareResource({ id: file.id, name: file.name, type: 'file' })}
            onClose={closePreview}
          />
          <ShareModal resource={shareResource} onClose={() => setShareResource(null)} />
          <ManageAccessModal folder={accessFolder} onClose={() => setAccessFolder(null)} />
          <VersionHistoryModal
            file={versionHistoryFile}
            onClose={() => setVersionHistoryFile(null)}
            onRestored={(file) => {
              setUploadedFiles((current) => current.map((item) => (item.id === file.id ? { ...item, ...file } : item)))
              setSelectedFile((current) => (current?.id === file.id ? { ...current, ...file } : current))
            }}
          />
        </div>
      )}
    </UploadDropzone>
  )
}
