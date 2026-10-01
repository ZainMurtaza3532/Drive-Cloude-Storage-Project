'use client'

import { useEffect, useState } from 'react'
import { ArrowDownToLine, File as FileIcon, Folder, LockKeyhole, ShieldCheck } from 'lucide-react'

type SharedFile = { id: string; name: string; size: number; mimeType: string }
type SharedItem = { type: 'file' | 'folder'; name: string; file?: SharedFile; files?: SharedFile[] }

function formatSize(size: number) {
    if (!size) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
    return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function PublicShare({ token }: { token: string }) {
    const [item, setItem] = useState<SharedItem | null>(null)
    const [password, setPassword] = useState('')
    const [passwordRequired, setPasswordRequired] = useState(false)
    const [previewUrl, setPreviewUrl] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [pendingFile, setPendingFile] = useState('')

    async function loadShare(nextPassword = '') {
        setLoading(true)
        setError('')
        try {
            const response = await fetch(`/api/public/share/${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: nextPassword }),
            })
            const data = await response.json()
            if (!response.ok) {
                if (data.requiresPassword) setPasswordRequired(true)
                throw new Error(data.error ?? 'This share link is unavailable.')
            }
            setItem(data)
            setPasswordRequired(false)
            setPassword('')
            if (data.type === 'file') await openFile(data.file, nextPassword)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unable to open this shared item.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void loadShare() }, [token])

    async function getFileUrl(file: SharedFile, mode: 'view' | 'download', secret = password) {
        const response = await fetch(`/api/public/share/${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: secret, fileId: file.id, mode }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Unable to access this file.')
        return data.url as string
    }

    async function openFile(file: SharedFile, secret = password) {
        setPendingFile(file.id)
        setError('')
        try {
            setPreviewUrl(await getFileUrl(file, 'view', secret))
        } catch (openError) {
            setError(openError instanceof Error ? openError.message : 'Unable to preview this file.')
        } finally {
            setPendingFile('')
        }
    }

    async function downloadFile(file: SharedFile) {
        setPendingFile(file.id)
        setError('')
        try {
            const url = await getFileUrl(file, 'download')
            window.location.assign(url)
        } catch (downloadError) {
            setError(downloadError instanceof Error ? downloadError.message : 'Unable to download this file.')
        } finally {
            setPendingFile('')
        }
    }

    const files = item?.type === 'folder' ? item.files ?? [] : item?.file ? [item.file] : []
    const previewFile = item?.type === 'file' ? item.file : files.find(({ id }) => id === pendingFile)

    return (
        <main className="min-h-screen bg-[#f4f6f8] px-4 py-10 text-slate-900 dark:bg-[#0d1219] dark:text-slate-100 sm:py-16">
            <div className="mx-auto max-w-3xl">
                <header className="mb-8 flex items-center gap-2 text-sm font-semibold tracking-wide text-[#f15a24]"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f15a24] text-white"><ShieldCheck className="h-4 w-4" /></span> DRIVEA <span className="font-normal text-slate-400">/ Shared item</span></header>
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#131922]">
                    <div className="border-b border-slate-200 px-5 py-5 sm:px-7 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#f15a24]/10 text-[#f15a24]">{item?.type === 'folder' ? <Folder className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}</span>
                            <div className="min-w-0"><p className="text-xs font-medium uppercase text-slate-500">Shared {item?.type ?? 'file'}</p><h1 className="truncate text-xl font-semibold sm:text-2xl">{item?.name ?? 'Shared item'}</h1></div>
                        </div>
                    </div>

                    {passwordRequired && !item ? (
                        <form onSubmit={(event) => { event.preventDefault(); void loadShare(password) }} className="mx-auto max-w-sm px-5 py-10 text-center">
                            <LockKeyhole className="mx-auto h-7 w-7 text-[#f15a24]" /><h2 className="mt-3 text-base font-semibold">Password required</h2><p className="mt-1 text-sm text-slate-500">Enter the password provided by the owner.</p>
                            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" aria-label="Share password" />
                            <button type="submit" disabled={loading || !password} className="mt-3 w-full rounded-md bg-[#f15a24] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#d94e1b] disabled:opacity-50">{loading ? 'Checking...' : 'Open shared item'}</button>
                        </form>
                    ) : loading && !item ? <p className="px-6 py-12 text-center text-sm text-slate-500">Opening shared item...</p> : item ? (
                        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_260px]">
                            <div className="min-h-64 bg-slate-50 p-4 dark:bg-slate-900/50 sm:p-6">
                                {previewUrl && previewFile?.mimeType.startsWith('image/') ? <img src={previewUrl} alt={previewFile.name} className="mx-auto max-h-[62vh] max-w-full object-contain" />
                                    : previewUrl && previewFile?.mimeType === 'application/pdf' ? <iframe title={previewFile.name} src={previewUrl} className="h-[62vh] w-full border-0" />
                                        : previewUrl && previewFile?.mimeType.startsWith('video/') ? <video src={previewUrl} controls className="mx-auto max-h-[62vh] max-w-full" />
                                            : previewUrl && previewFile?.mimeType.startsWith('audio/') ? <audio src={previewUrl} controls className="mt-12 w-full" />
                                                : <div className="flex h-56 flex-col items-center justify-center text-center"><FileIcon className="h-10 w-10 text-slate-400" /><p className="mt-3 max-w-full truncate text-sm font-medium">{previewFile?.name ?? item.name}</p><p className="mt-1 text-xs text-slate-500">Preview isn&apos;t available for this file type.</p></div>}
                            </div>
                            <aside className="border-t border-slate-200 p-4 dark:border-slate-800 md:border-l md:border-t-0">
                                <h2 className="mb-3 text-xs font-semibold uppercase text-slate-500">{item.type === 'folder' ? `Files (${files.length})` : 'File details'}</h2>
                                <ul className="space-y-1">
                                    {files.map((file) => <li key={file.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                                        <button type="button" onClick={() => void openFile(file)} disabled={pendingFile === file.id} title="Preview file" className="min-w-0 flex-1 text-left disabled:opacity-50"><span className="block truncate text-sm font-medium">{file.name}</span><span className="text-xs text-slate-500">{formatSize(file.size)}</span></button>
                                        <button type="button" onClick={() => void downloadFile(file)} disabled={pendingFile === file.id} aria-label={`Download ${file.name}`} title="Download" className="rounded-md p-2 text-slate-500 hover:bg-[#f15a24]/10 hover:text-[#f15a24] disabled:opacity-50"><ArrowDownToLine className="h-4 w-4" /></button>
                                    </li>)}
                                </ul>
                                {item.type === 'file' && item.file && <p className="mt-3 text-xs text-slate-500">{formatSize(item.file.size)} · {item.file.mimeType}</p>}
                            </aside>
                        </div>
                    ) : null}
                    {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
                </section>
                <p className="mt-5 text-center text-xs text-slate-400">Shared securely with Drivea</p>
            </div>
        </main>
    )
}