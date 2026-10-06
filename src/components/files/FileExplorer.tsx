'use client'

import { useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  Archive,
  AudioLines,
  Code2,
  Download,
  File,
  FileText,
  Grid2X2,
  History,
  Image,
  List,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  Video,
  Upload,
} from 'lucide-react'

export type DriveFile = {
  id: string
  name: string
  size: number
  mimeType: string
  isEncrypted?: boolean
  originalMimeType?: string | null
  originalSize?: number | null
  encryptionChunkSize?: number | null
  folderId: string | null
  owner: string
  updatedAt: string
  isStarred: boolean
  isTrash: boolean
  trashedAt: string | null
  versionCount?: number
  currentVersionNumber?: number
}

export type FileItem = DriveFile

type FileExplorerProps = {
  files: DriveFile[]
  groups?: Array<{ label: string; files: DriveFile[] }>
  onOpen: (file: DriveFile) => void
  onToggleStar?: (fileId: string) => Promise<void> | void
  onTrash?: (fileId: string) => Promise<void> | void
  onRestore?: (fileId: string) => Promise<void> | void
  onDeletePermanently?: (fileId: string) => Promise<void> | void
  onBulkTrash?: (fileIds: string[]) => Promise<void> | void
  onBulkRestore?: (fileIds: string[]) => Promise<void> | void
  onBulkDeletePermanently?: (fileIds: string[]) => Promise<void> | void
  onBulkDownload?: (fileIds: string[]) => Promise<void> | void
  onCopySelected?: (fileIds: string[]) => void
  onPasteFiles?: () => Promise<void> | void
  onShare?: (file: DriveFile) => void
  onVersionHistory?: (file: DriveFile) => void
  trashView?: boolean
}

const codeExtensions = new Set([
  'c', 'cc', 'cpp', 'cs', 'css', 'go', 'h', 'html', 'java', 'js', 'jsx', 'json', 'md', 'php', 'py', 'rb', 'rs', 'sh', 'sql', 'ts', 'tsx', 'xml', 'yml', 'yaml',
])
const archiveExtensions = new Set(['7z', 'bz2', 'gz', 'rar', 'tar', 'zip'])
const documentExtensions = new Set([
  'doc', 'docx', 'odt', 'pages', 'ppt', 'pptx', 'rtf', 'xls', 'xlsx',
])

function fileKind(file: DriveFile) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.mimeType.startsWith('image/')) return 'image'
  if (file.mimeType.startsWith('video/')) return 'video'
  if (file.mimeType.startsWith('audio/')) return 'audio'
  if (
    file.mimeType === 'application/pdf' ||
    extension === 'pdf' ||
    documentExtensions.has(extension)
  )
    return 'document'
  if (archiveExtensions.has(extension)) return 'archive'
  if (codeExtensions.has(extension)) return 'code'
  return 'file'
}

function canShowImageThumbnail(file: DriveFile) {
  return /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mimeType.toLowerCase())
}

function FileTypeIcon({
  file,
  className = 'h-5 w-5',
}: {
  file: DriveFile
  className?: string
}) {
  const kind = fileKind(file)
  const classNames = {
    image: 'text-emerald-500 dark:text-emerald-400',
    video: 'text-rose-500 dark:text-rose-400',
    audio: 'text-violet-500 dark:text-violet-400',
    document: 'text-[#f15a24] dark:text-[#ff7847]',
    archive: 'text-amber-500 dark:text-amber-400',
    code: 'text-cyan-600 dark:text-cyan-400',
    file: 'text-slate-400 dark:text-slate-500',
  }
  const iconClass = `${className} shrink-0 ${classNames[kind]}`

  if (kind === 'image') return <Image className={iconClass} />
  if (kind === 'video') return <Video className={iconClass} />
  if (kind === 'audio') return <AudioLines className={iconClass} />
  if (kind === 'document') return <FileText className={iconClass} />
  if (kind === 'archive') return <Archive className={iconClass} />
  if (kind === 'code') return <Code2 className={iconClass} />
  return <File className={iconClass} />
}

function formatFileSize(size: number) {
  if (size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return `${(size / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatModified(date: string) {
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parsedDate)
}

type FileActionHandlers = {
  onToggleStar?: (fileId: string) => Promise<void> | void
  onTrash?: (fileId: string) => Promise<void> | void
  onRestore?: (fileId: string) => Promise<void> | void
  onDeletePermanently?: (fileId: string) => Promise<void> | void
  onShare?: (file: DriveFile) => void
  onVersionHistory?: (file: DriveFile) => void
}

function FileActions({
  file,
  onToggleStar,
  onTrash,
  onRestore,
  onDeletePermanently,
  onShare,
}: FileActionHandlers & { file: DriveFile }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {file.isTrash ? (
        <>
          {onRestore && (
            <button
              type="button"
              onClick={() => void onRestore(file.id)}
              aria-label={`Restore ${file.name}`}
              title="Restore"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          {onDeletePermanently && (
            <button
              type="button"
              onClick={() => void onDeletePermanently(file.id)}
              aria-label={`Delete ${file.name} permanently`}
              title="Delete permanently"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-500/10 dark:hover:text-rose-300 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      ) : (
        <>
          {onShare && (
            <button
              type="button"
              onClick={() => onShare(file)}
              aria-label={`Share ${file.name}`}
              title="Share"
              className="rounded-lg p-1.5 text-slate-400 hover:text-[#f15a24] hover:bg-[#f15a24]/10 transition-colors cursor-pointer"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}
          {onToggleStar && (
            <button
              type="button"
              onClick={() => void onToggleStar(file.id)}
              aria-label={file.isStarred ? `Unstar ${file.name}` : `Star ${file.name}`}
              title={file.isStarred ? 'Unstar' : 'Star'}
              className="rounded-lg p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer"
            >
              <Star
                className={`h-4 w-4 ${file.isStarred ? 'fill-amber-400 text-amber-500' : ''
                  }`}
              />
            </button>
          )}
          {onTrash && (
            <button
              type="button"
              onClick={() => void onTrash(file.id)}
              aria-label={`Move ${file.name} to Trash`}
              title="Move to Trash"
              className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

function FileContextMenu({
  file,
  open,
  trashView,
  actions,
  onClose,
}: {
  file: DriveFile
  open: boolean
  trashView: boolean
  actions: FileActionHandlers
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="absolute right-2 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
      {!trashView && actions.onVersionHistory && (
        <button
          type="button"
          onClick={() => {
            actions.onVersionHistory?.(file)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 sm:text-sm dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          <History className="h-4 w-4 text-slate-400" />
          Version History
        </button>
      )}
      {!trashView && actions.onShare && (
        <button
          type="button"
          onClick={() => {
            actions.onShare?.(file)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 sm:text-sm dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          <Share2 className="h-4 w-4 text-slate-400" />
          Share
        </button>
      )}
      {!trashView && actions.onToggleStar && (
        <button
          type="button"
          onClick={() => {
            void actions.onToggleStar?.(file.id)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 sm:text-sm dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          <Star className={`h-4 w-4 ${file.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
          {file.isStarred ? 'Unstar' : 'Star'}
        </button>
      )}
      {!trashView && actions.onTrash && (
        <button
          type="button"
          onClick={() => {
            void actions.onTrash?.(file.id)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 sm:text-sm dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <Trash2 className="h-4 w-4" />
          Move to Trash
        </button>
      )}
      {trashView && actions.onRestore && (
        <button
          type="button"
          onClick={() => {
            void actions.onRestore?.(file.id)
            onClose()
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 sm:text-sm dark:text-slate-200 dark:hover:bg-slate-700/60"
        >
          <RotateCcw className="h-4 w-4 text-slate-400" />
          Restore
        </button>
      )}
    </div>
  )
}

function FileCard({
  file,
  selected,
  onSelect,
  onOpen,
  actions,
  trashView,
}: {
  file: DriveFile
  selected: boolean
  onSelect: (selected: boolean) => void
  onOpen: () => void
  actions: FileActionHandlers
  trashView: boolean
}) {
  const isImage = canShowImageThumbnail(file)
  const [contextOpen, setContextOpen] = useState(false)
  const menuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <article
      ref={menuRef}
      data-file-id={file.id}
      onContextMenu={(event) => {
        event.preventDefault()
        setContextOpen(true)
      }}
      className={`group relative min-w-0 overflow-visible rounded-2xl border bg-white dark:bg-[#131922] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${selected
        ? 'border-[#f15a24] ring-2 ring-[#f15a24]/20 shadow-xs'
        : 'border-slate-200/90 dark:border-slate-800 hover:border-[#f15a24]/40 hover:shadow-[#f15a24]/5'
        }`}
    >
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-800/50">
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Preview ${file.name}`}
          className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f15a24] cursor-pointer"
        >
          {isImage ? (
            <img
              src={`/api/files/${encodeURIComponent(file.id)}/download`}
              alt={file.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="p-6 rounded-2xl bg-white/60 dark:bg-slate-900/60 shadow-xs group-hover:scale-110 transition-transform duration-200">
              <FileTypeIcon file={file} className="h-10 w-10" />
            </div>
          )}
        </button>

        {/* Selection Checkbox */}
        <label
          className="absolute left-2.5 top-2.5 z-10 rounded-lg bg-white/90 dark:bg-slate-900/90 p-1.5 shadow-xs backdrop-blur-xs cursor-pointer transition-opacity"
          title={`Select ${file.name}`}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={`Select ${file.name}`}
            className="h-4 w-4 accent-[#f15a24] rounded cursor-pointer"
          />
        </label>

        {/* Action icons */}
        <div className="absolute right-2 top-2 z-10 rounded-lg bg-white/90 dark:bg-slate-900/90 shadow-xs backdrop-blur-xs p-0.5">
          <FileActions {...actions} file={file} />
        </div>
      </div>

      <div className="min-w-0 p-3.5">
        <div className="flex min-w-0 items-center gap-2">
          {!isImage && <FileTypeIcon file={file} className="h-4 w-4" />}
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#f15a24] dark:group-hover:text-[#ff7847] transition-colors cursor-pointer"
            title={file.name}
          >
            {file.name}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{formatFileSize(file.size)}</span>
          <span className="truncate max-w-[100px]">{file.owner}</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
          {trashView ? 'Trashed' : 'Modified'}{' '}
          {formatModified(trashView ? file.trashedAt ?? file.updatedAt : file.updatedAt)}
        </p>
      </div>
      <FileContextMenu file={file} open={contextOpen} trashView={trashView} actions={actions} onClose={() => setContextOpen(false)} />
    </article>
  )
}

function FileRow({
  file,
  selected,
  onSelect,
  onOpen,
  actions,
  trashView,
}: {
  file: DriveFile
  selected: boolean
  onSelect: (selected: boolean) => void
  onOpen: () => void
  actions: FileActionHandlers
  trashView: boolean
}) {
  const [contextOpen, setContextOpen] = useState(false)
  const menuRef = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <tr
      ref={menuRef}
      data-file-id={file.id}
      onContextMenu={(event) => {
        event.preventDefault()
        setContextOpen(true)
      }}
      className={`relative border-t border-slate-100 dark:border-slate-800/80 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${selected ? 'bg-[#f15a24]/5 dark:bg-[#f15a24]/10' : ''
        }`}
    >
      <td className="max-w-0 px-4 py-3">
        <div className="flex max-w-full items-center gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={`Select ${file.name}`}
            className="h-4 w-4 shrink-0 accent-[#f15a24] rounded cursor-pointer"
          />
          <FileTypeIcon file={file} />
          <button
            type="button"
            onClick={onOpen}
            className="truncate text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:text-[#f15a24] dark:hover:text-[#ff7847] transition-colors cursor-pointer"
            title={file.name}
          >
            {file.name}
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
        {formatFileSize(file.size)}
      </td>
      <td
        className="max-w-40 truncate px-4 py-3 text-sm text-slate-600 dark:text-slate-300"
        title={file.owner}
      >
        {file.owner}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-400 dark:text-slate-500">
        {formatModified(trashView ? file.trashedAt ?? file.updatedAt : file.updatedAt)}
      </td>
      <td className="relative px-3 py-2 text-right">
        <FileActions {...actions} file={file} />
        <FileContextMenu file={file} open={contextOpen} trashView={trashView} actions={actions} onClose={() => setContextOpen(false)} />
      </td>
    </tr>
  )
}

export function FileExplorer({
  files,
  groups,
  onOpen,
  onToggleStar,
  onTrash,
  onRestore,
  onDeletePermanently,
  onBulkTrash,
  onBulkRestore,
  onBulkDeletePermanently,
  onBulkDownload,
  onCopySelected,
  onPasteFiles,
  onShare,
  onVersionHistory,
  trashView = false,
}: FileExplorerProps) {
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionBox, setSelectionBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const selectionStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const selectionSurfaceRef = useRef<HTMLDivElement | null>(null)
  const selectedCount = selectedIds.size
  const fileIds = files.map(({ id }) => id)
  const actions = { onToggleStar, onTrash, onRestore, onDeletePermanently, onShare, onVersionHistory }

  useEffect(() => {
    const availableIds = new Set(fileIds)
    setSelectedIds((current) => {
      const retainedIds = [...current].filter((id) => availableIds.has(id))
      return retainedIds.length === current.size ? current : new Set(retainedIds)
    })
  }, [files])

  useEffect(() => {
    let active = true
    fetch('/api/user/settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && (data?.defaultView === 'GRID' || data?.defaultView === 'LIST')) {
          setView(data.defaultView.toLowerCase())
        }
      })
      .catch(() => undefined)

    function handleViewPreference(event: Event) {
      const preference = (event as CustomEvent<string>).detail
      if (preference === 'grid' || preference === 'list') setView(preference)
    }

    window.addEventListener('drivea:view-preference', handleViewPreference)
    return () => {
      active = false
      window.removeEventListener('drivea:view-preference', handleViewPreference)
    }
  }, [])

  function selectFile(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectView(nextView: 'grid' | 'list') {
    setView(nextView)
    window.dispatchEvent(new CustomEvent('drivea:view-preference', { detail: nextView }))
    void fetch('/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultView: nextView.toUpperCase() }),
    })
  }

  async function runBulkAction(action?: (ids: string[]) => Promise<void> | void) {
    if (!action || selectedCount === 0) return
    await action([...selectedIds])
    setSelectedIds(new Set())
  }

  useHotkeys('mod+a', (event) => {
    if (!fileIds.length) return
    event.preventDefault()
    setSelectedIds(new Set(fileIds))
  }, { enableOnFormTags: false }, [fileIds])

  useHotkeys('mod+c', (event) => {
    if (!selectedCount || !onCopySelected) return
    event.preventDefault()
    onCopySelected([...selectedIds])
  }, { enableOnFormTags: false, enabled: Boolean(onCopySelected) }, [selectedIds, onCopySelected])

  useHotkeys('mod+v', (event) => {
    if (!onPasteFiles) return
    event.preventDefault()
    void onPasteFiles()
  }, { enableOnFormTags: false, enabled: Boolean(onPasteFiles) }, [onPasteFiles])

  useHotkeys(['delete', 'backspace'], (event) => {
    if (trashView || !selectedCount || !onBulkTrash) return
    event.preventDefault()
    void runBulkAction(onBulkTrash)
  }, { enableOnFormTags: false, enabled: Boolean(onBulkTrash) && !trashView }, [selectedIds, onBulkTrash, trashView])

  function beginLasso(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target
    if (
      event.button !== 0 ||
      event.pointerType !== 'mouse' ||
      (target instanceof Element && target.closest('button, input, a, select, [role="button"]'))
    ) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    selectionStart.current = { x, y, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function updateLasso(event: React.PointerEvent<HTMLDivElement>) {
    const start = selectionStart.current
    if (!start || start.pointerId !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const currentX = event.clientX - bounds.left
    const currentY = event.clientY - bounds.top
    if (Math.abs(currentX - start.x) < 3 && Math.abs(currentY - start.y) < 3) return
    setSelectionBox({
      left: Math.min(start.x, currentX),
      top: Math.min(start.y, currentY),
      width: Math.abs(currentX - start.x),
      height: Math.abs(currentY - start.y),
    })
  }

  function endLasso(event: React.PointerEvent<HTMLDivElement>) {
    const start = selectionStart.current
    if (!start || start.pointerId !== event.pointerId) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const currentX = event.clientX - bounds.left
    const currentY = event.clientY - bounds.top
    const left = Math.min(start.x, currentX) + bounds.left
    const right = Math.max(start.x, currentX) + bounds.left
    const top = Math.min(start.y, currentY) + bounds.top
    const bottom = Math.max(start.y, currentY) + bounds.top

    if (Math.abs(currentX - start.x) > 3 || Math.abs(currentY - start.y) > 3) {
      const nextSelectedIds = event.shiftKey ? new Set(selectedIds) : new Set<string>()
      event.currentTarget.querySelectorAll<HTMLElement>('[data-file-id]').forEach((element) => {
        const item = element.getBoundingClientRect()
        if (item.left < right && item.right > left && item.top < bottom && item.bottom > top) {
          const id = element.dataset.fileId
          if (id) nextSelectedIds.add(id)
        }
      })
      setSelectedIds(nextSelectedIds)
    }

    selectionStart.current = null
    setSelectionBox(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function renderGrid(items: DriveFile[]) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
        {items.map((file) => (
          <FileCard
            key={file.id}
            file={file}
            selected={selectedIds.has(file.id)}
            onSelect={(selected) => selectFile(file.id, selected)}
            onOpen={() => onOpen(file)}
            actions={actions}
            trashView={trashView}
          />
        ))}
      </div>
    )
  }

  function renderList(items: DriveFile[]) {
    return (
      <div className="overflow-x-auto scrollbar-none rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] shadow-2xs">
        <table className="w-full min-w-[32rem] sm:min-w-[40rem] table-fixed text-left">
          <thead className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
            <tr className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="w-[44%] px-3 sm:px-4 py-3 sm:py-3.5">Name</th>
              <th className="w-[14%] px-3 sm:px-4 py-3 sm:py-3.5">Size</th>
              <th className="w-[16%] px-3 sm:px-4 py-3 sm:py-3.5">Owner</th>
              <th className="w-[20%] px-3 sm:px-4 py-3 sm:py-3.5">Modified</th>
              <th className="w-16 sm:w-20 px-2 sm:px-3 py-3 sm:py-3.5 text-right" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                selected={selectedIds.has(file.id)}
                onSelect={(selected) => selectFile(file.id, selected)}
                onOpen={() => onOpen(file)}
                actions={actions}
                trashView={trashView}
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section aria-label="Files" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Files</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {files.length}
          </span>
        </div>

        {/* View toggle (Grid / List) */}
        <div
          role="group"
          aria-label="File view"
          className="inline-flex items-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#131922] p-1 shadow-2xs"
        >
          <button
            type="button"
            onClick={() => selectView('grid')}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
            title="Grid view"
            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${view === 'grid'
              ? 'bg-slate-100 dark:bg-slate-800 text-[#f15a24] dark:text-[#ff7847] shadow-2xs font-medium'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => selectView('list')}
            aria-label="List view"
            aria-pressed={view === 'list'}
            title="List view"
            className={`rounded-lg p-1.5 transition-colors cursor-pointer ${view === 'list'
              ? 'bg-slate-100 dark:bg-slate-800 text-[#f15a24] dark:text-[#ff7847] shadow-2xs font-medium'
              : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
              }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk action toolbar */}
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#f15a24]/20 bg-[#f15a24]/5 dark:bg-[#f15a24]/10 p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="mr-auto text-xs sm:text-sm font-semibold text-[#f15a24] dark:text-[#ff7847]">
            {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
          </span>
          {!trashView && onBulkDownload && (
            <button
              type="button"
              disabled={selectedCount > 20}
              onClick={() => void runBulkAction(onBulkDownload)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" /> Download ZIP
            </button>
          )}
          {trashView ? (
            <>
              {onBulkRestore && (
                <button
                  type="button"
                  disabled={selectedCount > 100}
                  onClick={() => void runBulkAction(onBulkRestore)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" /> Restore
                </button>
              )}
              {onBulkDeletePermanently && (
                <button
                  type="button"
                  disabled={selectedCount > 100}
                  onClick={() => void runBulkAction(onBulkDeletePermanently)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs sm:text-sm font-medium text-white disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" /> Delete permanently
                </button>
              )}
            </>
          ) : onBulkTrash ? (
            <button
              type="button"
              disabled={selectedCount > 100}
              onClick={() => void runBulkAction(onBulkTrash)}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-xs sm:text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" /> Move to Trash
            </button>
          ) : null}
        </div>
      )}

      {/* Files Content */}
      <div
        ref={selectionSurfaceRef}
        onPointerDown={beginLasso}
        onPointerMove={updateLasso}
        onPointerUp={endLasso}
        onPointerCancel={endLasso}
        className={`relative min-h-4 ${selectionBox ? 'select-none' : ''}`}
      >
        {selectionBox && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 border border-[#f15a24] bg-[#f15a24]/10"
            style={selectionBox}
          />
        )}
        {files.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/30 px-6 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f15a24]/10 text-[#f15a24] dark:bg-[#f15a24]/15">
              <Upload className="h-6 w-6 stroke-[2]" />
            </div>
            <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">No files in this folder yet</h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Drag and drop files here, or use the Upload files button above.
            </p>
          </div>
        ) : groups?.length ? (
          <div className="space-y-8">
            {groups.filter((group) => group.files.length > 0).map((group) => (
              <section key={group.label} aria-label={group.label} className="space-y-3">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{group.label}</h3>
                {view === 'grid' ? renderGrid(group.files) : renderList(group.files)}
              </section>
            ))}
          </div>
        ) : view === 'grid' ? renderGrid(files) : renderList(files)}
      </div>
    </section>
  )
}