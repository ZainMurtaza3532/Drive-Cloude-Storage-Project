'use client'

import { useEffect, useState } from 'react'
import { LoaderCircle, Trash2, UserPlus, X } from 'lucide-react'

type FolderMember = {
    id: string
    role: 'VIEWER' | 'EDITOR'
    createdAt: string
    user: { name: string | null; email: string | null }
}

type ManageAccessModalProps = {
    folder: { id: string; name: string } | null
    onClose: () => void
}

export function ManageAccessModal({ folder, onClose }: ManageAccessModalProps) {
    const [members, setMembers] = useState<FolderMember[]>([])
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<'VIEWER' | 'EDITOR'>('VIEWER')
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!folder) return
        const controller = new AbortController()
        setIsLoading(true)
        setError('')

        fetch(`/api/folders/${encodeURIComponent(folder.id)}/access`, { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? 'Unable to load folder access.')
                setMembers(data.members ?? [])
            })
            .catch((loadError) => {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return
                setError(loadError instanceof Error ? loadError.message : 'Unable to load folder access.')
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false)
            })

        return () => controller.abort()
    }, [folder])

    async function addMember(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!folder || !email.trim()) return
        setIsSaving(true)
        setError('')

        try {
            const response = await fetch(`/api/folders/${encodeURIComponent(folder.id)}/access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, role }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to invite this user.')
            setMembers((current) => [data.member, ...current.filter((member) => member.id !== data.member.id)])
            setEmail('')
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to invite this user.')
        } finally {
            setIsSaving(false)
        }
    }

    async function updateMember(member: FolderMember, nextRole: 'VIEWER' | 'EDITOR') {
        if (!folder) return
        setError('')
        try {
            const response = await fetch(`/api/folders/${encodeURIComponent(folder.id)}/access`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessId: member.id, role: nextRole }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to update this member.')
            setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item))
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to update this member.')
        }
    }

    async function removeMember(member: FolderMember) {
        if (!folder) return
        setError('')
        try {
            const response = await fetch(`/api/folders/${encodeURIComponent(folder.id)}/access`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessId: member.id }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to remove this member.')
            setMembers((current) => current.filter((item) => item.id !== member.id))
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to remove this member.')
        }
    }

    if (!folder) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="manage-access-title"
                className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#131922]"
            >
                <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="min-w-0">
                        <h2 id="manage-access-title" className="text-base font-semibold text-slate-900 dark:text-white">Manage access</h2>
                        <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{folder.name}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="space-y-5 p-5">
                    <form onSubmit={addMember} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <label className="sr-only" htmlFor="folder-member-email">Email address</label>
                        <input
                            id="folder-member-email"
                            type="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder="Email address"
                            className="min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#f15a24] focus:ring-2 focus:ring-[#f15a24]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <select
                            aria-label="New member role"
                            value={role}
                            onChange={(event) => setRole(event.target.value as 'VIEWER' | 'EDITOR')}
                            className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <option value="VIEWER">Viewer</option>
                            <option value="EDITOR">Editor</option>
                        </select>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-[#f15a24] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d94e1b] disabled:opacity-60"
                        >
                            {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                            Invite
                        </button>
                    </form>

                    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

                    <div>
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">People with access</h3>
                        {isLoading ? (
                            <p className="py-5 text-center text-sm text-slate-500">Loading members...</p>
                        ) : members.length ? (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {members.map((member) => (
                                    <li key={member.id} className="flex min-w-0 items-center gap-3 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{member.user.name || member.user.email}</p>
                                            {member.user.name && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{member.user.email}</p>}
                                        </div>
                                        <select
                                            aria-label={`Role for ${member.user.email || member.user.name}`}
                                            value={member.role}
                                            onChange={(event) => void updateMember(member, event.target.value as 'VIEWER' | 'EDITOR')}
                                            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                        >
                                            <option value="VIEWER">Viewer</option>
                                            <option value="EDITOR">Editor</option>
                                        </select>
                                        <button
                                            type="button"
                                            onClick={() => void removeMember(member)}
                                            aria-label={`Remove ${member.user.email || member.user.name}`}
                                            title="Remove access"
                                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="py-5 text-center text-sm text-slate-500 dark:text-slate-400">Only you have access to this folder.</p>
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}