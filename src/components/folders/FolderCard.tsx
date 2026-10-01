'use client'

import { Folder, LockKeyhole, MoreHorizontal, PencilLine, Share2, Star, Trash2, ArrowDownLeft, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface FolderItem {
  id: string
  name: string
  parentId: string | null
  isStarred: boolean
  isTrash: boolean
  updatedAt: string
  canManage?: boolean
  isVault?: boolean
}

interface FolderCardProps {
  folder: FolderItem
  onOpen: (folderId: string, folderName: string) => void
  onRename: (folderId: string, name: string) => Promise<void> | void
  onToggleStar: (folderId: string) => Promise<void> | void
  onMove: (folderId: string) => Promise<void> | void
  onDelete: (folderId: string) => Promise<void> | void
  onShare?: (folder: FolderItem) => void
  onManageAccess?: (folder: FolderItem) => void
  selectedForDownload?: boolean
  onSelectForDownload?: (selected: boolean) => void
}

export function FolderCard({
  folder,
  onOpen,
  onRename,
  onToggleStar,
  onMove,
  onDelete,
  onShare,
  onManageAccess,
  selectedForDownload = false,
  onSelectForDownload,
}: FolderCardProps) {
  const [contextOpen, setContextOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setContextOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    setContextOpen(true)
  }

  return (
    <div className="relative group select-none" ref={menuRef}>
      <div
        onDoubleClick={() => onOpen(folder.id, folder.name)}
        onContextMenu={(event) => {
          if (folder.canManage !== false) handleContextMenu(event)
        }}
        className="flex cursor-pointer flex-col rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] p-4 shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#f15a24]/40 hover:shadow-md hover:shadow-[#f15a24]/5"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          {/* Folder Icon */}
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 group-hover:scale-105 transition-transform duration-200">
            {folder.isVault ? <LockKeyhole className="h-5 w-5 stroke-[2]" /> : <Folder className="h-5 w-5 fill-amber-500/20 stroke-[2]" />}
          </div>

          <div className="flex items-center gap-1">
            {onSelectForDownload && (
              <input
                type="checkbox"
                checked={selectedForDownload}
                onChange={(event) => onSelectForDownload(event.target.checked)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${folder.name} for ZIP download`}
                title="Select for ZIP download"
                className="h-4 w-4 accent-[#f15a24]"
              />
            )}
            {folder.isStarred && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" />
            )}
            {folder.canManage !== false && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setContextOpen((state) => !state)
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer opacity-70 group-hover:opacity-100"
                aria-label={`Open folder actions for ${folder.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#f15a24] dark:group-hover:text-[#ff7847] transition-colors" title={folder.name}>
            {folder.name}
          </h3>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Updated {new Date(folder.updatedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {contextOpen && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 p-1">
          {folder.canManage !== false && <>
            <button
              type="button"
              onClick={async () => {
                const nextName = window.prompt('Rename folder', folder.name)
                if (nextName && nextName.trim()) {
                  await onRename(folder.id, nextName.trim())
                }
                setContextOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <PencilLine className="h-4 w-4 text-slate-400" />
              Rename
            </button>

            <button
              type="button"
              onClick={async () => {
                const nextParentId = window.prompt(
                  'Move folder into parent folder id (leave blank for root):',
                  ''
                )
                if (nextParentId !== null) {
                  await onMove(nextParentId.trim() || '')
                }
                setContextOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="h-4 w-4 text-slate-400" />
              Move
            </button>

            <button
              type="button"
              onClick={async () => {
                await onToggleStar(folder.id)
                setContextOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
            >
              <Star
                className={`h-4 w-4 ${folder.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                  }`}
              />
              {folder.isStarred ? 'Unstar' : 'Star'}
            </button>

            {onShare && (
              <button
                type="button"
                onClick={() => {
                  onShare(folder)
                  setContextOpen(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <Share2 className="h-4 w-4 text-slate-400" />
                Share
              </button>
            )}

            {onManageAccess && (
              <button
                type="button"
                onClick={() => {
                  onManageAccess(folder)
                  setContextOpen(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
              >
                <UsersRound className="h-4 w-4 text-slate-400" />
                Manage access
              </button>
            )}

            <div className="my-1 border-t border-slate-100 dark:border-slate-700/80" />

            <button
              type="button"
              onClick={async () => {
                await onDelete(folder.id)
                setContextOpen(false)
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs sm:text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Move to Trash
            </button>
          </>}
        </div>
      )}
    </div>
  )
}
