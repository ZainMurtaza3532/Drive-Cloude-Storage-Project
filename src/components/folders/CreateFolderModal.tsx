'use client'

import { FolderPlus, X, Loader2 } from 'lucide-react'
import { FormEvent, useEffect, useState } from 'react'

interface CreateFolderModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (name: string) => Promise<void> | void
}

export function CreateFolderModal({ open, onClose, onSubmit }: CreateFolderModalProps) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) {
      setName('')
      setLoading(false)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    try {
      await onSubmit(trimmed)
      setName('')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-[#131922] p-6 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
              <FolderPlus className="h-5 w-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                New folder
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Create a folder to organize your content
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close folder modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Folder name <span className="text-[#f15a24]">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Design Assets, Project Docs"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-all focus:border-[#f15a24] focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-[#f15a24]/10"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#f15a24] hover:bg-[#d94e1b] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-[#f15a24]/20 transition-all disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer active:scale-[0.98]"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Creating…' : 'Create folder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
