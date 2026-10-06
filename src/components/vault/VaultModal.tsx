'use client'

import { useEffect, useState } from 'react'
import { LockKeyhole, X } from 'lucide-react'
import { createVaultMaterial, unlockVaultKey } from '@/lib/vault-crypto'

type VaultMetadata = { id: string; name: string; vaultSalt: string; vaultCheck: string }

type VaultModalProps = {
    open: boolean
    onClose: () => void
    onUnlock: (folderId: string, key: CryptoKey) => void
}

export function VaultModal({ open, onClose, onUnlock }: VaultModalProps) {
    const [vault, setVault] = useState<VaultMetadata | null>(null)
    const [pin, setPin] = useState('')
    const [confirmation, setConfirmation] = useState('')
    const [error, setError] = useState('')
    const [isBusy, setIsBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        setError('')
        fetch('/api/vault', { cache: 'no-store' })
            .then(async (response) => {
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? 'Unable to load Vault.')
                setVault(data.vault)
            })
            .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load Vault.'))
    }, [open])

    if (!open) return null

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        setIsBusy(true)
        setError('')
        try {
            if (vault) {
                const key = await unlockVaultKey(pin, vault.vaultSalt, vault.vaultCheck)
                onUnlock(vault.id, key)
            } else {
                if (pin !== confirmation) throw new Error('The PIN entries do not match.')
                const material = await createVaultMaterial(pin)
                const response = await fetch('/api/vault', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ salt: material.salt, check: material.check }),
                })
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? 'Unable to create Vault.')
                onUnlock(data.folder.id, material.key)
            }
            setPin('')
            setConfirmation('')
            onClose()
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to unlock Vault.')
        } finally {
            setIsBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
            <section role="dialog" aria-modal="true" aria-labelledby="vault-title" className="w-full max-w-md rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#131922] animate-in zoom-in-95 duration-150">
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><LockKeyhole className="h-4 w-4" /></span>
                        <div><h2 id="vault-title" className="text-base font-semibold text-slate-900 dark:text-white">Encrypted Vault</h2><p className="mt-0.5 text-xs text-slate-500">Your PIN never leaves this browser.</p></div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Close Vault" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"><X className="h-4 w-4" /></button>
                </header>
                <form onSubmit={submit} className="space-y-4 p-5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{vault ? 'PIN or password' : 'Create PIN or password'}
                        <input type="password" autoComplete={vault ? 'current-password' : 'new-password'} minLength={8} required value={pin} onChange={(event) => setPin(event.target.value)} className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>
                    {!vault && <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">Confirm PIN or password
                        <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                    </label>}
                    {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
                    <button type="submit" disabled={isBusy} className="w-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{isBusy ? 'Working...' : vault ? 'Unlock Vault' : 'Create and unlock'}</button>
                    {!vault && <p className="text-xs leading-5 text-slate-500">If you forget this PIN or password, encrypted files cannot be recovered.</p>}
                </form>
            </section>
        </div>
    )
}