'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Link2, LockKeyhole, X } from 'lucide-react'

type ShareResource = { id: string; name: string; type: 'file' | 'folder' }
type ShareSettingsResponse = {
    enabled?: boolean
    token?: string | null
    expiresAt?: string | null
    passwordProtected?: boolean
    error?: string
}

async function readResponse<T extends ShareSettingsResponse>(response: Response): Promise<T> {
    const text = await response.text()
    if (!text.trim()) {
        throw new Error(`The server returned an empty response (${response.status}).`)
    }

    try {
        return JSON.parse(text) as T
    } catch {
        throw new Error(`The server returned an invalid response (${response.status}).`)
    }
}

export function ShareModal({ resource, onClose }: { resource: ShareResource | null; onClose: () => void }) {
    const [enabled, setEnabled] = useState(false)
    const [token, setToken] = useState<string | null>(null)
    const [passwordEnabled, setPasswordEnabled] = useState(false)
    const [password, setPassword] = useState('')
    const [expiresAt, setExpiresAt] = useState('')
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [toast, setToast] = useState('')

    useEffect(() => {
        if (!resource) return
        const controller = new AbortController()
        setEnabled(false)
        setToken(null)
        setPasswordEnabled(false)
        setPassword('')
        setExpiresAt('')
        setError('')
        setToast('')
        setLoading(true)

        fetch(`/api/share?type=${resource.type}&id=${encodeURIComponent(resource.id)}`, { signal: controller.signal })
            .then(async (response) => {
                const data = await readResponse<ShareSettingsResponse>(response)
                if (!response.ok) throw new Error(data.error ?? 'Unable to load sharing settings.')
                setEnabled(Boolean(data.enabled))
                setToken(data.token ?? null)
                setPasswordEnabled(Boolean(data.passwordProtected))
                setExpiresAt(data.expiresAt ? new Date(data.expiresAt).toISOString().slice(0, 16) : '')
            })
            .catch((loadError) => {
                if (loadError instanceof DOMException && loadError.name === 'AbortError') return
                setError(loadError instanceof Error ? loadError.message : 'Unable to load sharing settings.')
            })
            .finally(() => setLoading(false))

        return () => controller.abort()
    }, [resource])

    if (!resource) return null

    const shareUrl = token ? `${typeof window === 'undefined' ? '' : window.location.origin}/share/${token}` : ''

    async function save() {
        setSaving(true)
        setError('')
        try {
            const response = await fetch('/api/share', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: resource.type,
                    id: resource.id,
                    enabled,
                    passwordEnabled,
                    password,
                    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
                }),
            })
            const data = await readResponse<ShareSettingsResponse>(response)
            if (!response.ok) throw new Error(data.error ?? 'Unable to save sharing settings.')
            setEnabled(data.enabled)
            setToken(data.token ?? null)
            setPasswordEnabled(data.passwordProtected ?? false)
            setPassword('')
            setToast(data.enabled ? 'Sharing settings saved.' : 'Link sharing turned off.')
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to save sharing settings.')
        } finally {
            setSaving(false)
        }
    }

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(shareUrl)
            setToast('Link copied to clipboard.')
        } catch {
            setError('Unable to copy the link. Check your browser clipboard permissions.')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
            <section role="dialog" aria-modal="true" aria-labelledby="share-title" className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-[#131922]">
                <header className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f15a24]/10 text-[#f15a24]"><Link2 className="h-5 w-5" /></span>
                        <div className="min-w-0"><h2 id="share-title" className="text-lg font-semibold text-slate-900 dark:text-white">Share {resource.type}</h2><p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{resource.name}</p></div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close sharing settings" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
                </header>

                {loading ? <p className="py-8 text-sm text-slate-500">Loading sharing settings...</p> : <div className="mt-6 space-y-5">
                    <label className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3.5 dark:border-slate-700">
                        <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">Anyone with the link can view</span><span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">Anyone with this link can view or download.</span></span>
                        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} aria-label="Anyone with the link can view" className="h-4 w-4 accent-[#f15a24]" />
                    </label>

                    {enabled && <div className="space-y-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Link expiry <span className="font-normal text-slate-400">(optional)</span>
                            <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} min={new Date().toISOString().slice(0, 16)} className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200"><input type="checkbox" checked={passwordEnabled} onChange={(event) => setPasswordEnabled(event.target.checked)} className="h-4 w-4 accent-[#f15a24]" /><LockKeyhole className="h-4 w-4 text-slate-500" />Password protection</label>
                        {passwordEnabled && <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder={token ? 'Leave blank to keep current password' : 'Set a password (8+ characters)'} className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" />}
                        {shareUrl && <div className="flex min-w-0 items-center gap-2"><input readOnly value={shareUrl} aria-label="Share link" className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300" /><button type="button" onClick={copyLink} aria-label="Copy share link" title="Copy link" className="flex h-9 w-10 shrink-0 items-center justify-center rounded-md bg-[#f15a24] text-white hover:bg-[#d94e1b]"><Copy className="h-4 w-4" /></button></div>}
                    </div>}

                    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                    {toast && <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" />{toast}</p>}
                    <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
                        <button type="button" onClick={() => void save()} disabled={saving} className="rounded-md bg-[#f15a24] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d94e1b] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
                    </footer>
                </div>}
            </section>
        </div>
    )
}