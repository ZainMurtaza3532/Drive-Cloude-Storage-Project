'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, File as FileIcon, Maximize, MapPin, MessageSquare, Pause, Play, RotateCcw, RotateCw, Send, Share2, Volume2, X, ZoomIn, ZoomOut } from 'lucide-react'
import type { FileItem } from './FileExplorer'
import { useUpload } from '@/context/UploadContext'
import { decryptVaultBlob } from '@/lib/vault-crypto'

export type FilePreviewModalProps = {
    file: FileItem | null
    files?: FileItem[]
    onClose: () => void
    onNavigate?: (file: FileItem) => void
    onShare?: (file: FileItem) => void
}

function previewKind(file: FileItem, mimeType: string) {
    const normalizedMimeType = mimeType.toLowerCase()
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (/^image\/(png|jpeg|gif|webp|svg\+xml|avif|bmp)$/.test(normalizedMimeType) || ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(extension)) return 'image'
    if (/^video\/(mp4|webm|ogg|quicktime)$/.test(normalizedMimeType) || ['mp4', 'webm', 'mov', 'ogg'].includes(extension)) return 'video'
    if (/^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac)$/.test(normalizedMimeType) || ['mp3', 'wav', 'm4a', 'aac'].includes(extension)) return 'audio'
    if (normalizedMimeType === 'application/pdf' || extension === 'pdf') return 'pdf'
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

function formatFileSize(size: number) {
    if (!size) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
    return `${(size / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return '0:00'
    return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export function FilePreviewModal({ file, files = [], onClose, onNavigate, onShare }: FilePreviewModalProps) {
    const { vaultKey } = useUpload()
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
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
    const [zoom, setZoom] = useState(1)
    const [rotation, setRotation] = useState(0)
    const [mediaLoading, setMediaLoading] = useState(true)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [mediaTime, setMediaTime] = useState(0)
    const [mediaDuration, setMediaDuration] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [volume, setVolume] = useState(1)
    const [pdfPage, setPdfPage] = useState(1)
    const [pdfZoom, setPdfZoom] = useState(100)

    const encryptedFileUrl = file ? `/api/files/${encodeURIComponent(file.id)}/download` : ''

    useEffect(() => {
        if (!file) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
            if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
            const currentIndex = files.findIndex((item) => item.id === file.id)
            if (event.key === 'ArrowLeft' && currentIndex > 0) onNavigate?.(files[currentIndex - 1])
            if (event.key === 'ArrowRight' && currentIndex >= 0 && currentIndex < files.length - 1) onNavigate?.(files[currentIndex + 1])
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [file, files, onClose, onNavigate])

    useEffect(() => {
        setZoom(1)
        setRotation(0)
        setMediaLoading(true)
        setPreviewError('')
        setMediaTime(0)
        setMediaDuration(0)
        setIsPlaying(false)
        setVolume(1)
        setPdfPage(1)
        setPdfZoom(100)
    }, [file?.id])

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

    const kind = file
        ? previewKind(file, file.isEncrypted ? file.originalMimeType ?? 'application/octet-stream' : file.mimeType)
        : 'unsupported'
    const togglePlayback = useCallback(() => {
        const media = kind === 'video' ? videoRef.current : audioRef.current
        if (!media) return
        if (media.paused) void media.play()
        else media.pause()
    }, [kind])

    if (!file) return null

    const fileUrl = `/api/files/${encodeURIComponent(file.id)}/download`
    const resolvedFileUrl = file.isEncrypted ? decryptedUrl ?? '' : fileUrl
    const downloadUrl = file.isEncrypted ? decryptedUrl ?? undefined : `${fileUrl}?download=1`
    const pdfPreviewUrl = file.isEncrypted
        ? resolvedFileUrl
        : `/api/files/${encodeURIComponent(file.id)}/preview`
    const canRenderPreview = !file.isEncrypted || Boolean(decryptedUrl)
    const mentionMatch = draft.match(/(?:^|\s)@([\w.-]*)$/)
    const mentionCandidates = mentionMatch
        ? members.filter((member) => `${member.name ?? ''} ${member.email ?? ''}`.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 5)
        : []
    const fileIndex = files.findIndex((item) => item.id === file.id)
    const hasPrevious = fileIndex > 0
    const hasNext = fileIndex >= 0 && fileIndex < files.length - 1
    const canDownload = Boolean(downloadUrl)

    function handleMediaTimeUpdate(event: React.SyntheticEvent<HTMLMediaElement>) {
        setMediaTime(event.currentTarget.currentTime)
        setMediaDuration(event.currentTarget.duration || 0)
        setIsPlaying(!event.currentTarget.paused)
    }

    function setMediaPosition(value: number) {
        const media = kind === 'video' ? videoRef.current : audioRef.current
        if (media) media.currentTime = value
        setMediaTime(value)
    }

    function applyPlaybackRate(rate: number) {
        setPlaybackRate(rate)
        if (videoRef.current) videoRef.current.playbackRate = rate
    }

    async function toggleFullscreen() {
        const media = videoRef.current
        if (!media) return
        if (document.fullscreenElement) await document.exitFullscreen()
        else await media.requestFullscreen()
    }

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
            className="fixed inset-0 z-50 flex animate-in fade-in items-center justify-center bg-slate-950/65 p-3 backdrop-blur-md duration-200 sm:p-6"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="file-preview-title"
                className="flex max-h-[92vh] w-full max-w-7xl animate-in zoom-in-95 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-zinc-900 shadow-2xl duration-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
                <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-zinc-700">
                    <div className="min-w-0">
                        <h2 id="file-preview-title" className="truncate text-sm font-semibold" title={file.name}>{file.name}</h2>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{formatFileSize(file.size)} · {file.owner}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {onShare && <button type="button" onClick={() => onShare(file)} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                            <Share2 className="h-4 w-4" /><span className="hidden sm:inline">Share Link</span>
                        </button>}
                        <a
                            href={downloadUrl}
                            download={file.isEncrypted ? file.name : undefined}
                            aria-disabled={!canDownload}
                            tabIndex={canDownload ? undefined : -1}
                            className="inline-flex items-center gap-2 rounded-md bg-[#f15a24] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#d94e1b] aria-disabled:pointer-events-none aria-disabled:opacity-50"
                        >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download File</span>
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close preview"
                            title="Close preview"
                            className="rounded-md p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                    <div className="relative flex min-h-[35vh] min-w-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 dark:bg-black sm:p-6">
                        {hasPrevious && onNavigate && <button type="button" onClick={() => onNavigate(files[fileIndex - 1])} aria-label="Previous file" className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-800 shadow-lg hover:bg-white dark:bg-zinc-800/90 dark:text-white dark:hover:bg-zinc-700"><ChevronLeft className="h-6 w-6" /></button>}
                        {hasNext && onNavigate && <button type="button" onClick={() => onNavigate(files[fileIndex + 1])} aria-label="Next file" className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-white/90 p-2 text-slate-800 shadow-lg hover:bg-white dark:bg-zinc-800/90 dark:text-white dark:hover:bg-zinc-700"><ChevronRight className="h-6 w-6" /></button>}
                        {file.isEncrypted && !vaultKey && <p className="max-w-sm text-center text-sm text-emerald-300">Unlock the Vault to view or download this encrypted file.</p>}
                        {file.isEncrypted && vaultKey && !decryptedUrl && !previewError && <p className="text-sm text-slate-300">Decrypting in this browser...</p>}
                        {previewError && <p role="alert" className="max-w-sm text-center text-sm text-rose-400">{previewError}</p>}
                        {canRenderPreview && kind === 'image' && (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90">
                                    <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} aria-label="Zoom out" className="rounded p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"><ZoomOut className="h-4 w-4" /></button>
                                    <span className="min-w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
                                    <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} aria-label="Zoom in" className="rounded p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"><ZoomIn className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => { setZoom(1); setRotation(0) }} aria-label="Reset image" className="rounded p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"><RotateCcw className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)} aria-label="Rotate image 90 degrees" className="rounded p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"><RotateCw className="h-4 w-4" /></button>
                                </div>
                                <div className="relative flex min-h-0 max-h-[calc(92vh-12rem)] max-w-full items-center justify-center overflow-auto">
                                <img src={resolvedFileUrl} alt={file.name} loading="lazy" onLoad={() => setMediaLoading(false)} onError={() => { setMediaLoading(false); setPreviewError('Unable to load this image.') }} onClick={placeImagePin} style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }} className="max-h-[calc(92vh-12rem)] max-w-full cursor-crosshair object-contain transition-transform duration-200" />
                                {comments.filter((comment) => comment.positionX !== null && comment.positionY !== null).map((comment, index) => (
                                    <button key={comment.id} type="button" onClick={() => setReplyTo(comment.id)} title={comment.content}
                                        className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[#f15a24] text-[10px] font-bold text-white shadow"
                                        style={{ left: `${(comment.positionX ?? 0) * 100}%`, top: `${(comment.positionY ?? 0) * 100}%` }}>
                                        {index + 1}
                                    </button>
                                ))}
                                {pendingPin && <span className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-emerald-500" style={{ left: `${pendingPin.x * 100}%`, top: `${pendingPin.y * 100}%` }} />}
                                </div>
                            </div>
                        )}
                        {canRenderPreview && kind === 'video' && (
                            <div className="flex w-full flex-col items-center gap-3">
                                <video
                                    ref={videoRef}
                                    src={resolvedFileUrl}
                                    controls
                                    preload="metadata"
                                    onLoadedData={() => setMediaLoading(false)}
                                    onWaiting={() => setMediaLoading(true)}
                                    onCanPlay={() => setMediaLoading(false)}
                                    onTimeUpdate={handleMediaTimeUpdate}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    className="max-h-[calc(92vh-12rem)] max-w-full"
                                />
                                <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/90">
                                    <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause video' : 'Play video'} className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800">{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                                    <span className="text-xs tabular-nums">{formatTime(mediaTime)}</span>
                                    <input aria-label="Seek video" type="range" min="0" max={mediaDuration || 0} step="0.1" value={Math.min(mediaTime, mediaDuration || 0)} onChange={(event) => setMediaPosition(Number(event.target.value))} className="w-28 accent-[#f15a24] sm:w-48" />
                                    <span className="text-xs tabular-nums">{formatTime(mediaDuration)}</span>
                                    <select aria-label="Playback speed" value={playbackRate} onChange={(event) => applyPlaybackRate(Number(event.target.value))} className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                                        {[0.5, 1, 1.5, 2].map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
                                    </select>
                                    <button type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle fullscreen" className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800"><Maximize className="h-4 w-4" /></button>
                                </div>
                            </div>
                        )}
                        {canRenderPreview && kind === 'audio' && (
                            <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900 sm:p-8">
                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f15a24]/10 text-[#f15a24]"><Volume2 className="h-7 w-7" /></div>
                                <p className="mt-4 truncate text-base font-semibold">{file.name}</p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{formatFileSize(file.size)}</p>
                                <audio
                                    ref={audioRef}
                                    src={resolvedFileUrl}
                                    preload="metadata"
                                    onLoadedMetadata={(event) => { setMediaDuration(event.currentTarget.duration || 0); setMediaLoading(false) }}
                                    onCanPlay={() => setMediaLoading(false)}
                                    onTimeUpdate={handleMediaTimeUpdate}
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                    onEnded={() => setIsPlaying(false)}
                                    className="hidden"
                                />
                                <div className="my-6 flex h-12 items-center justify-center gap-1" aria-hidden="true">
                                    {Array.from({ length: 40 }, (_, index) => {
                                        const height = 12 + ((index * 17 + file.name.length * 11) % 34)
                                        const played = mediaDuration > 0 && index / 40 <= mediaTime / mediaDuration
                                        return <span key={index} className={`w-1 rounded-full ${played ? 'bg-[#f15a24]' : 'bg-slate-300 dark:bg-zinc-600'}`} style={{ height }} />
                                    })}
                                </div>
                                <input aria-label="Seek audio" type="range" min="0" max={mediaDuration || 0} step="0.1" value={Math.min(mediaTime, mediaDuration || 0)} onChange={(event) => setMediaPosition(Number(event.target.value))} className="w-full accent-[#f15a24]" />
                                <div className="mt-1 flex justify-between text-xs tabular-nums text-slate-500 dark:text-zinc-400"><span>{formatTime(mediaTime)}</span><span>{formatTime(mediaDuration)}</span></div>
                                <div className="mt-5 flex items-center justify-center gap-4">
                                    <button type="button" onClick={() => { setVolume((value) => Math.max(0, value - 0.1)); if (audioRef.current) audioRef.current.volume = Math.max(0, audioRef.current.volume - 0.1) }} aria-label="Volume down" className="rounded p-2 hover:bg-slate-100 dark:hover:bg-zinc-800"><Volume2 className="h-4 w-4" /></button>
                                    <input aria-label="Audio volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value }} className="w-24 accent-[#f15a24]" />
                                    <button type="button" onClick={togglePlayback} aria-label={isPlaying ? 'Pause audio' : 'Play audio'} className="rounded-full bg-[#f15a24] p-3 text-white hover:bg-[#d94e1b]">{isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</button>
                                </div>
                            </div>
                        )}
                        {canRenderPreview && kind === 'pdf' && (
                            <div className="relative flex h-[calc(92vh-8rem)] w-full flex-col gap-2">
                                <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                                    <button type="button" onClick={() => setPdfPage((page) => Math.max(1, page - 1))} aria-label="Previous PDF page" className="rounded border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"><ChevronLeft className="h-4 w-4" /></button>
                                    <label className="flex items-center gap-1">Page <input aria-label="PDF page" type="number" min="1" value={pdfPage} onChange={(event) => setPdfPage(Math.max(1, Number(event.target.value)))} className="w-14 rounded border border-slate-200 bg-white px-2 py-1 text-center dark:border-zinc-700 dark:bg-zinc-800" /></label>
                                    <button type="button" onClick={() => setPdfPage((page) => page + 1)} aria-label="Next PDF page" className="rounded border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"><ChevronRight className="h-4 w-4" /></button>
                                    <button type="button" onClick={() => setPdfZoom((value) => Math.max(50, value - 10))} aria-label="Zoom out PDF" className="rounded border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"><ZoomOut className="h-4 w-4" /></button>
                                    <span>{pdfZoom}%</span>
                                    <button type="button" onClick={() => setPdfZoom((value) => Math.min(200, value + 10))} aria-label="Zoom in PDF" className="rounded border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"><ZoomIn className="h-4 w-4" /></button>
                                    <a href={pdfPreviewUrl} target="_blank" rel="noreferrer" className="rounded border border-slate-200 bg-white px-2 py-1.5 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700">Open in new tab</a>
                                </div>
                                <iframe src={`${pdfPreviewUrl}#page=${pdfPage}&zoom=${pdfZoom}`} title={`Preview of ${file.name}`} onLoad={() => setMediaLoading(false)} className="h-full w-full rounded bg-white" />
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
                            <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                                <FileIcon className="mx-auto h-14 w-14 text-[#f15a24]" />
                                <p className="mt-4 break-all font-semibold">{file.name}</p>
                                <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{formatFileSize(file.size)} · Preview unavailable</p>
                                <a href={downloadUrl} download={file.isEncrypted ? file.name : undefined} aria-disabled={!canDownload} className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#f15a24] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#d94e1b] aria-disabled:pointer-events-none aria-disabled:opacity-50"><Download className="h-4 w-4" />Download to View</a>
                            </div>
                        )}
                        {mediaLoading && canRenderPreview && ['image', 'video', 'audio', 'pdf'].includes(kind) && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-100/70 dark:bg-black/50"><span className="h-9 w-9 animate-spin rounded-full border-4 border-slate-300 border-t-[#f15a24] dark:border-zinc-700 dark:border-t-[#f15a24]" aria-label="Loading preview" /></div>}
                    </div>
                    <aside className="flex max-h-[40vh] w-full shrink-0 flex-col border-t border-slate-200 bg-white text-slate-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-h-none sm:w-[min(22rem,42vw)] sm:border-l sm:border-t-0">
                        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-zinc-800">
                            <MessageSquare className="h-4 w-4 text-[#ff7847]" />
                            <h3 className="text-sm font-semibold">Comments</h3>
                            <span className="ml-auto text-xs text-slate-500">{comments.length}</span>
                        </div>
                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                            {comments.map((comment, index) => (
                                <article key={comment.id} className="rounded-md border border-slate-200 p-3 dark:border-zinc-800">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs font-semibold">{comment.user.name || comment.user.email || 'User'}</p>
                                        {comment.positionX !== null && <span className="text-[10px] text-[#ff7847]">Pin {index + 1}{comment.pageNumber ? ` · page ${comment.pageNumber}` : ''}</span>}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-zinc-300">{comment.content}</p>
                                    {(comment.replies ?? []).map((reply) => (
                                        <div key={reply.id} className="mt-2 border-l border-slate-300 pl-2 dark:border-zinc-700">
                                            <p className="text-[11px] font-semibold">{reply.user.name || reply.user.email || 'User'}</p>
                                            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-zinc-400">{reply.content}</p>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => { setReplyTo(comment.id); setPendingPin(null) }} className="mt-2 text-xs font-medium text-[#ff7847] hover:text-orange-300">Reply</button>
                                </article>
                            ))}
                            {comments.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No comments yet.</p>}
                        </div>
                        <form onSubmit={submitComment} className="space-y-2 border-t border-slate-200 p-3 dark:border-zinc-800">
                            {(pendingPin || replyTo) && <p className="text-xs text-emerald-400">{replyTo ? 'Replying to thread' : 'Pin selected'} <button type="button" onClick={() => { setPendingPin(null); setReplyTo(null) }} className="ml-1 text-slate-400 underline">Clear</button></p>}
                            {kind === 'pdf' && pendingPin && <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">Page <input type="number" min="1" value={pageNumber} onChange={(event) => setPageNumber(event.target.value)} className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-slate-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" /></label>}
                            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={3} placeholder="Write a comment or @mention someone..." className="w-full resize-y rounded border border-slate-300 bg-white p-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#f15a24] focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500" />
                            {mentionCandidates.length > 0 && <ul className="max-h-32 overflow-y-auto border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
                                {mentionCandidates.map((member) => {
                                    const handle = (member.email?.split('@')[0] || member.name || 'user').replace(/\s+/g, '')
                                    return <li key={member.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => {
                                        setDraft((current) => current.replace(/(^|\s)@[\w.-]*$/, (_match, prefix: string) => `${prefix}@${handle} `))
                                    }} className="w-full px-2.5 py-2 text-left text-xs hover:bg-slate-100 dark:text-zinc-200 dark:hover:bg-zinc-800">{member.name || member.email || handle}</button></li>
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