'use client'

import { useEffect, useState } from 'react'
import { Download, MapPin, MessageSquare, Send, X } from 'lucide-react'
import type { DriveFile } from './FileExplorer'
import { useUpload } from '@/context/UploadContext'
import { decryptVaultBlob } from '@/lib/vault-crypto'

type FilePreviewModalProps = {
    file: DriveFile | null
    onClose: () => void
}

function previewKind(mimeType: string) {
    const normalizedMimeType = mimeType.toLowerCase()
    if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(normalizedMimeType)) return 'image'
    if (/^video\/(mp4|webm|ogg|quicktime)$/.test(normalizedMimeType)) return 'video'
    if (/^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac)$/.test(normalizedMimeType)) return 'audio'
    if (normalizedMimeType === 'application/pdf') return 'pdf'
    return 'unsupported'
}

type PreviewComment = {
    id: string
    content: string
    positionX: number | null
    positionY: number | null
    pageNumber: number | null
    createdAt: string
    user: { id: string; name: string | null; email: string | null }
    replies?: PreviewComment[]
}

type MentionMember = { id: string; name: string | null; email: string | null }
type PendingPin = { x: number; y: number } | null

export function FilePreviewModal({ file, onClose }: FilePreviewModalProps) {
    const { vaultKey } = useUpload()
    const [comments, setComments] = useState<PreviewComment[]>([])
    const [members, setMembers] = useState<MentionMember[]>([])
    const [draft, setDraft] = useState('')
    const [replyTo, setReplyTo] = useState<string | null>(null)
    const [pendingPin, setPendingPin] = useState<PendingPin>(null)
    const [isPlacingPdfPin, setIsPlacingPdfPin] = useState(false)
    const [pageNumber, setPageNumber] = useState('1')
    const [commentError, setCommentError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null)
    const [previewError, setPreviewError] = useState('')

    const encryptedFileUrl = file ? `/api/files/${encodeURIComponent(file.id)}/download` : ''

    useEffect(() => {
        if (!file) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [file, onClose])

    useEffect(() => {
        if (!file) return
        setComments([])
        setPendingPin(null)
        setReplyTo(null)
        setCommentError('')
        const controller = new AbortController()
        fetch(`/api/files/${encodeURIComponent(file.id)}/comments`, { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json()
                if (!response.ok) throw new Error(data.error ?? 'Unable to load comments.')
                setComments(data.comments ?? [])
                setMembers(data.members ?? [])
            })
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    setCommentError(error instanceof Error ? error.message : 'Unable to load comments.')
                }
            })
        return () => controller.abort()
    }, [file])

    useEffect(() => {
        if (!file?.isEncrypted || !vaultKey) {
            setDecryptedUrl(null)
            setPreviewError('')
            return
        }
        const controller = new AbortController()
        let objectUrl: string | null = null
        setDecryptedUrl(null)
        setPreviewError('')
        fetch(encryptedFileUrl, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error('Unable to load the encrypted file.')
                const blob = await response.blob()
                return decryptVaultBlob(blob, vaultKey, file.originalMimeType ?? 'application/octet-stream', file.originalSize ?? undefined, file.encryptionChunkSize ?? undefined)
            })
            .then((blob) => {
                objectUrl = URL.createObjectURL(blob)
                setDecryptedUrl(objectUrl)
            })
            .catch((error) => {
                if (!(error instanceof DOMException && error.name === 'AbortError')) {
                    setPreviewError(error instanceof Error ? error.message : 'Unable to decrypt this file.')
                }
            })
        return () => {
            controller.abort()
            if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
    }, [file, vaultKey, encryptedFileUrl])

    if (!file) return null

    const kind = previewKind(file.isEncrypted ? file.originalMimeType ?? 'application/octet-stream' : file.mimeType)
    const fileUrl = `/api/files/${encodeURIComponent(file.id)}/download`
    const resolvedFileUrl = file.isEncrypted ? decryptedUrl ?? '' : fileUrl
    const downloadUrl = file.isEncrypted ? decryptedUrl ?? undefined : `${fileUrl}?download=1`
    const canRenderPreview = !file.isEncrypted || Boolean(decryptedUrl)
    const mentionMatch = draft.match(/(?:^|\s)@([\w.-]*)$/)
    const mentionCandidates = mentionMatch
        ? members.filter((member) => `${member.name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 5)
        : []

    async function submitComment(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!draft.trim()) return
        setIsSaving(true)
        setCommentError('')
        try {
            const response = await fetch(`/api/files/${encodeURIComponent(file.id)}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: draft,
                    parentId: replyTo,
                    positionX: replyTo ? null : pendingPin?.x ?? null,
                    positionY: replyTo ? null : pendingPin?.y ?? null,
                    pageNumber: kind === 'pdf' && pendingPin ? Number(pageNumber) : null,
                }),
            })
            const data = await response.json()
            if (!response.ok) throw new Error(data.error ?? 'Unable to save comment.')
            if (replyTo) {
                setComments((current) => current.map((comment) => comment.id === replyTo
                    ? { ...comment, replies: [...(comment.replies ?? []), data.comment] }
                    : comment))
            } else {
                setComments((current) => [...current, { ...data.comment, replies: [] }])
                setPendingPin(null)
            }
            setDraft('')
            setReplyTo(null)
        } catch (error) {
            setCommentError(error instanceof Error ? error.message : 'Unable to save comment.')
        } finally {
            setIsSaving(false)
        }
    }

    function placeImagePin(event: React.MouseEvent<HTMLImageElement>) {
        const bounds = event.currentTarget.getBoundingClientRect()
        setPendingPin({
            x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
            y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
        })
        setReplyTo(null)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="file-preview-title"
                className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-950 shadow-2xl"
            >
                <header className="flex min-w-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                    <div className="min-w-0">
                        <h2 id="file-preview-title" className="truncate text-sm font-semibold text-white" title={file.name}>{file.name}</h2>
                        <p className="mt-0.5 text-xs text-slate-400">{file.owner}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <a
                            href={downloadUrl}
                            download={file.isEncrypted ? file.name : undefined}
                            aria-disabled={file.isEncrypted && !downloadUrl}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download</span>
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close preview"
                            title="Close preview"
                            className="rounded-md p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                    <div className="relative flex min-h-[35vh] min-w-0 flex-1 items-center justify-center overflow-auto bg-black p-3 sm:p-6">
                        {file.isEncrypted && !vaultKey && <p className="max-w-sm text-center text-sm text-emerald-300">Unlock the Vault to view or download this encrypted file.</p>}
                        {file.isEncrypted && vaultKey && !decryptedUrl && !previewError && <p className="text-sm text-slate-300">Decrypting in this browser...</p>}
                        {previewError && <p role="alert" className="max-w-sm text-center text-sm text-rose-400">{previewError}</p>}
                        {canRenderPreview && kind === 'image' && (
                            <div className="relative max-h-full max-w-full">
                                <img src={resolvedFileUrl} alt={file.name} onClick={placeImagePin} className="max-h-[calc(92vh-8rem)] max-w-full cursor-crosshair object-contain" />
                                {comments.filter((comment) => comment.positionX !== null && comment.positionY !== null).map((comment, index) => (
                                    <button key={comment.id} type="button" onClick={() => setReplyTo(comment.id)} title={comment.content}
                                        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#f15a24] text-[10px] font-bold text-white shadow"
                                        style={{ left: `${(comment.positionX ?? 0) * 100}%`, top: `${(comment.positionY ?? 0) * 100}%` }}>
                                        {index + 1}
                                    </button>
                                ))}
                                {pendingPin && <span className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500" style={{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }} />}
                            </div>
                        )}
                        {canRenderPreview && kind === 'video' && (
                            <video src={resolvedFileUrl} controls autoPlay className="max-h-[calc(92vh-8rem)] max-w-full" />
                        )}
                        {canRenderPreview && kind === 'audio' && (
                            <div className="w-full max-w-xl rounded-lg bg-slate-900 p-8 text-center">
                                <p className="mb-6 truncate text-sm font-medium text-white">{file.name}</p>
                                <audio src={resolvedFileUrl} controls autoPlay className="w-full" />
                            </div>
                        )}
                        {canRenderPreview && kind === 'pdf' && (
                            <div className="relative h-[calc(92vh-8rem)] w-full">
                                <iframe src={resolvedFileUrl} title={`Preview of ${file.name}`} className="h-full w-full rounded bg-white" />
                                <button type="button" onClick={() => setIsPlacingPdfPin((current) => !current)} aria-pressed={isPlacingPdfPin} title="Place annotation pin" className="absolute right-2 top-2 z-30 inline-flex items-center gap-1.5 border border-slate-300 bg-white/95 px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow hover:bg-white">
                                    <MapPin className="h-3.5 w-3.5" /> {isPlacingPdfPin ? 'Click page to pin' : 'Add pin'}
                                </button>
                                {isPlacingPdfPin && <button type="button" onClick={(event) => {
                                    const bounds = event.currentTarget.parentElement!.getBoundingClientRect()
                                    setPendingPin({ x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) })
                                    setReplyTo(null)
                                    setIsPlacingPdfPin(false)
                                }} className="absolute inset-0 z-10 cursor-crosshair bg-transparent" aria-label="Click the PDF to place an annotation pin" />}
                                {comments.filter((comment) => comment.positionX !== null && comment.positionY !== null).map((comment, index) => (
                                    <button key={comment.id} type="button" onClick={() => setReplyTo(comment.id)} title={comment.content}
                                        className="absolute z-20 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#f15a24] text-[10px] font-bold text-white shadow"
                                        style={{ left: `${(comment.positionX ?? 0) * 100}%`, top: `${(comment.positionY ?? 0) * 100}%` }}>
                                        {index + 1}
                                    </button>
                                ))}
                                {pendingPin && <span className="absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500" style={{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }} />}
                            </div>
                        )}
                        {canRenderPreview && kind === 'unsupported' && (
                            <div className="max-w-md text-center text-slate-300">
                                <p className="font-medium text-white">Preview is not available for this file type.</p>
                                <p className="mt-2 text-sm">Download the file to open it on your device.</p>
                            </div>
                        )}
                    </div>
                    <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-t border-slate-800 bg-slate-950 text-slate-100 sm:max-h-none sm:w-[min(22rem,42vw)] sm:border-l sm:border-t-0">
                        <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
                            <MessageSquare className="h-4 w-4 text-[#ff7847]" />
                            <h3 className="text-sm font-semibold">Comments</h3>
                            <span className="ml-auto text-xs text-slate-500">{comments.length}</span>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                            {comments.map((comment, index) => (
                                <article key={comment.id} className="rounded-md border border-slate-800 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold">{comment.user.name || comment.user.email || 'User'}</p>
                                        {comment.positionX !== null && <span className="text-[10px] text-[#ff7847]">Pin {index + 1}{comment.pageNumber ? ` · page ${comment.pageNumber}` : ''}</span>}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{comment.content}</p>
                                    {(comment.replies ?? []).map((reply) => (
                                        <div key={reply.id} className="mt-2 border-l border-slate-700 pl-2">
                                            <p className="text-[11px] font-semibold">{reply.user.name || reply.user.email || 'User'}</p>
                                            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-400">{reply.content}</p>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => { setReplyTo(comment.id); setPendingPin(null) }} className="mt-2 text-xs font-medium text-[#ff7847] hover:text-orange-300">Reply</button>
                                </article>
                            ))}
                            {comments.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No comments yet.</p>}
                        </div>
                        <form onSubmit={submitComment} className="space-y-2 border-t border-slate-800 p-3">
                            {(pendingPin || replyTo) && <p className="text-xs text-emerald-400">{replyTo ? 'Replying to thread' : 'Pin selected'} <button type="button" onClick={() => { setPendingPin(null); setReplyTo(null) }} className="ml-1 text-slate-400 underline">Clear</button></p>}
                            {kind === 'pdf' && pendingPin && <label className="flex items-center gap-2 text-xs text-slate-400">Page <input type="number" min="1" value={pageNumber} onChange={(event) => setPageNumber(event.target.value)} className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>}
                            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Write a comment or @mention someone..." className="w-full resize-y rounded border border-slate-700 bg-slate-900 p-2 text-sm text-white placeholder:text-slate-500 focus:border-[#f15a24] focus:outline-none" />
                            {mentionCandidates.length > 0 && <ul className="max-h-32 overflow-y-auto border border-slate-700 bg-slate-900">
                                {mentionCandidates.map((member) => {
                                    const handle = (member.email?.split('@')[0] || member.name || 'user').replace(/\s+/g, '')
                                    return <li key={member.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                                        setDraft((current) => current.replace(/(^|\s)@[\w.-]*$/, (_match, prefix: string) => `${prefix}@${handle} `))
                                    }} className="w-full px-2.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800">{member.name || member.email || handle}</button></li>
                                })}
                            </ul>}
                            {commentError && <p role="alert" className="text-xs text-rose-400">{commentError}</p>}
                            <button disabled={isSaving || !draft.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded bg-[#f15a24] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d94e1b] disabled:opacity-50"><Send className="h-4 w-4" />{isSaving ? 'Sending...' : replyTo ? 'Reply' : 'Comment'}</button>
                        </form>
                    </aside>
                </div>
            </section>
        </div>
    )
}