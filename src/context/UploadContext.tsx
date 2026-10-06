'use client'

import { createContext, useContext, useRef, useState } from 'react'
import { encryptVaultChunk, encryptVaultFile } from '@/lib/vault-crypto'
import { MULTIPART_CHUNK_SIZE } from '@/lib/upload-constraints'

export type UploadStatus = 'QUEUED' | 'PREPARING' | 'UPLOADING' | 'PAUSED' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

export interface UploadItem {
    id: string
    file: File
    fileName: string
    fileSize: number
    progress: number
    speed: number
    status: UploadStatus
    folderId?: string
    error?: string
    xhr?: XMLHttpRequest
}

type ActiveUpload = {
    controller: AbortController
    xhr?: XMLHttpRequest
    paused?: boolean
}

type MultipartSession = {
    sessionId: string
    uploadId: string
    fileId: string
    versionId: string
    completedParts: Map<number, string>
}

type UploadContextValue = {
    uploads: UploadItem[]
    uploadFiles: (files: File[], folderId?: string) => void
    reportUploadError: (file: File, error: string) => void
    cancelUpload: (id: string) => void
    pauseUpload: (id: string) => void
    resumeUpload: (id: string) => void
    unlockVault: (folderId: string, key: CryptoKey) => void
    lockVault: () => void
    vaultFolderId: string | null
    vaultKey: CryptoKey | null
    minimizeWidget: () => void
    toggleWidget: () => void
    isWidgetMinimized: boolean
}

const UploadContext = createContext<UploadContextValue | null>(null)
const fileHashes = new WeakMap<File, Promise<string | null>>()

function generateUniqueId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID()
        } catch {
            // fallback if unavailable or throws
        }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

function getFileHash(file: File): Promise<string | null> {
    let hash = fileHashes.get(file)
    if (!hash) {
        if (typeof crypto === 'undefined' || !crypto.subtle || typeof crypto.subtle.digest !== 'function') {
            return Promise.resolve(null)
        }
        hash = file.arrayBuffer()
            .then(async (contents) => {
                const digest = await crypto.subtle.digest('SHA-256', contents)
                return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
            })
            .catch(() => null)
        fileHashes.set(file, hash)
    }
    return hash
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const [uploads, setUploads] = useState<UploadItem[]>([])
    const [isWidgetMinimized, setIsWidgetMinimized] = useState(false)
    const [vault, setVault] = useState<{ folderId: string; key: CryptoKey } | null>(null)
    const activeUploads = useRef(new Map<string, ActiveUpload>())
    const multipartSessions = useRef(new Map<string, MultipartSession>())
    const encryptedPayloads = useRef(new Map<string, Blob>())
    const uploadQueue = useRef<UploadItem[]>([])
    const activeUploadCount = useRef(0)
    const maxConcurrentUploads = 3

    function updateUpload(id: string, patch: Partial<UploadItem>) {
        setUploads((current) => current.map((upload) =>
            upload.id === id ? { ...upload, ...patch } : upload,
        ))
    }

    async function uploadFileAttempt(upload: UploadItem, activeUpload: ActiveUpload) {
        const cleanFolderId = upload.folderId && String(upload.folderId).trim() ? String(upload.folderId).trim() : undefined
        let isVaultDestination = false
        if (cleanFolderId) {
            const vaultResponse = await fetch(`/api/vault?folderId=${encodeURIComponent(cleanFolderId)}`, { signal: activeUpload.controller.signal })
            const vaultData = await vaultResponse.json().catch(() => null)
            if (!vaultResponse.ok) throw new Error(vaultData?.error ?? 'Unable to verify upload destination.')
            isVaultDestination = vaultData.isVaultDestination === true
        }
        if (isVaultDestination && !vault) throw new Error('Unlock the Vault before uploading files to it.')
        const encrypted = isVaultDestination
        const chunkedEncryption = encrypted && upload.fileSize > 10_000_000
        let payload = chunkedEncryption ? upload.file : encryptedPayloads.current.get(upload.id)
        if (!payload) {
            payload = encrypted && vault ? await encryptVaultFile(upload.file, vault.key) : upload.file
            if (encrypted) encryptedPayloads.current.set(upload.id, payload)
        }
        const encryptedPartCount = chunkedEncryption ? Math.ceil(upload.fileSize / MULTIPART_CHUNK_SIZE) : 0
        const uploadSize = chunkedEncryption ? upload.fileSize + encryptedPartCount * 28 : payload.size
        const uploadMimeType = encrypted ? 'application/octet-stream' : upload.file.type || 'application/octet-stream'
        let fileHash: string | null = null
        if (!encrypted && upload.fileSize <= 10_000_000) {
            try {
                fileHash = await getFileHash(upload.file)
            } catch (error) {
                console.warn('Unable to calculate file checksum; upload will continue without duplicate detection metadata.', error)
            }
        }
        if (uploadSize > 10_000_000) {
            await uploadMultipartFile(upload, activeUpload, payload, uploadSize, uploadMimeType, encrypted, chunkedEncryption, fileHash, cleanFolderId)
            return
        }
        const presignResponse = await fetch('/api/upload/presigned-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: upload.fileName,
                size: uploadSize,
                mimeType: uploadMimeType,
                encrypted,
                folderId: cleanFolderId ?? null,
            }),
            signal: activeUpload.controller.signal,
        })
        const presignData = await presignResponse.json().catch(() => null)
        if (!presignResponse.ok) {
            const detailMsg = presignData?.details ? `: ${presignData.details}` : ''
            throw new Error((presignData?.error ?? 'Unable to prepare upload.') + detailMsg)
        }

        const xhr = new XMLHttpRequest()
        activeUpload.xhr = xhr
        updateUpload(upload.id, { status: 'UPLOADING', xhr })
        const startedAt = performance.now()
        let lastProgressUpdate = 0

        await new Promise<void>((resolve, reject) => {
            xhr.open('PUT', presignData.uploadUrl)
            xhr.setRequestHeader('Content-Type', uploadMimeType)
            xhr.upload.onprogress = (event) => {
                const now = performance.now()
                const isFinished = event.lengthComputable && event.loaded >= event.total
                if (!isFinished && now - lastProgressUpdate < 80) return
                lastProgressUpdate = now
                const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.1)
                updateUpload(upload.id, {
                    progress: event.lengthComputable
                        ? Math.min(100, Math.round((event.loaded / event.total) * 100))
                        : 0,
                    speed: event.loaded / elapsedSeconds,
                })
            }
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) resolve()
                else reject(new Error(`Storage rejected this upload (HTTP ${xhr.status}).`))
            }
            xhr.onerror = () => reject(new Error('Network error while uploading to storage.'))
            xhr.ontimeout = () => reject(new Error('Upload timed out while sending this file.'))
            xhr.onabort = () => reject(new DOMException('Upload canceled.', 'AbortError'))
            xhr.timeout = 120_000
            xhr.send(payload)
        })

        updateUpload(upload.id, { status: 'PREPARING', progress: 100, speed: 0, xhr: undefined })
        const completeResponse = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileId: presignData.fileId,
                versionId: presignData.versionId,
                name: upload.fileName,
                size: uploadSize,
                mimeType: uploadMimeType,
                encrypted,
                originalMimeType: encrypted ? upload.file.type || 'application/octet-stream' : null,
                originalSize: encrypted ? upload.fileSize : null,
                encryptionChunkSize: null,
                folderId: cleanFolderId ?? null,
                fileHash,
            }),
            signal: activeUpload.controller.signal,
        })
        const completeData = await completeResponse.json().catch(() => null)
        if (!completeResponse.ok) {
            const detailMsg = completeData?.details ? `: ${completeData.details}` : ''
            throw new Error((completeData?.error ?? 'Unable to save uploaded file.') + detailMsg)
        }

        window.dispatchEvent(new CustomEvent('drivea:file-uploaded', { detail: completeData.file }))
        encryptedPayloads.current.delete(upload.id)
        updateUpload(upload.id, { status: 'COMPLETED', progress: 100, speed: 0 })
    }

    function isRetryableUploadError(error: unknown) {
        if (error instanceof TypeError) return true
        if (!(error instanceof Error)) return false
        return /network|timeout|timed out|connection|fetch failed/i.test(error.message)
    }

    function waitForRetry(delay: number, signal: AbortSignal) {
        return new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                signal.removeEventListener('abort', onAbort)
                resolve()
            }, delay)
            function onAbort() {
                window.clearTimeout(timeout)
                reject(new DOMException('Upload canceled.', 'AbortError'))
            }
            if (signal.aborted) onAbort()
            else signal.addEventListener('abort', onAbort, { once: true })
        })
    }

    async function uploadFile(upload: UploadItem) {
        const activeUpload: ActiveUpload = { controller: new AbortController() }
        activeUploads.current.set(upload.id, activeUpload)
        let retryCount = 0

        try {
            while (true) {
                try {
                    await uploadFileAttempt(upload, activeUpload)
                    return
                } catch (error) {
                    if (error instanceof DOMException && error.name === 'AbortError') {
                        updateUpload(upload.id, {
                            status: activeUpload.paused ? 'PAUSED' : 'CANCELLED',
                            speed: 0,
                            xhr: undefined,
                        })
                        return
                    }

                    if (retryCount < 2 && isRetryableUploadError(error)) {
                        retryCount += 1
                        updateUpload(upload.id, { status: 'PREPARING', speed: 0, xhr: undefined, error: undefined })
                        try {
                            await waitForRetry(1000 * 2 ** (retryCount - 1), activeUpload.controller.signal)
                        } catch {
                            updateUpload(upload.id, {
                                status: activeUpload.paused ? 'PAUSED' : 'CANCELLED',
                                speed: 0,
                                xhr: undefined,
                            })
                            return
                        }
                        continue
                    }

                    updateUpload(upload.id, {
                        status: 'ERROR',
                        speed: 0,
                        xhr: undefined,
                        error: error instanceof Error ? error.message : 'Upload failed.',
                    })
                    return
                }
            }
        } finally {
            activeUploads.current.delete(upload.id)
        }
    }

    async function uploadMultipartFile(
        upload: UploadItem,
        activeUpload: ActiveUpload,
        payload: Blob,
        uploadSize: number,
        mimeType: string,
        encrypted: boolean,
        chunkedEncryption: boolean,
        fileHash: string | null,
        cleanFolderId?: string
    ) {
        const chunkSize = MULTIPART_CHUNK_SIZE
        let multipart = multipartSessions.current.get(upload.id)
        if (!multipart) {
            const response = await fetch('/api/upload/multipart/initiate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: upload.fileName,
                    size: uploadSize,
                    mimeType,
                    encrypted,
                    folderId: cleanFolderId ?? null,
                }),
                signal: activeUpload.controller.signal,
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error ?? 'Unable to prepare multipart upload.')
            multipart = { sessionId: data.sessionId, uploadId: data.uploadId, fileId: data.fileId, versionId: data.versionId, completedParts: new Map() }
            multipartSessions.current.set(upload.id, multipart)
        }

        updateUpload(upload.id, { status: 'UPLOADING' })
        const sourceSize = chunkedEncryption ? upload.fileSize : uploadSize
        const partCount = Math.ceil(sourceSize / chunkSize)
        const startedAt = performance.now()
        let lastPartProgress = 0

        for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
            if (activeUpload.controller.signal.aborted) throw new DOMException('Upload paused.', 'AbortError')
            if (multipart.completedParts.has(partNumber)) continue

            const urlResponse = await fetch('/api/upload/multipart/presigned-urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uploadId: multipart.uploadId, fileId: multipart.fileId, partNumbers: [partNumber] }),
                signal: activeUpload.controller.signal,
            })
            const urlData = await urlResponse.json().catch(() => null)
            if (!urlResponse.ok) throw new Error(urlData?.error ?? 'Unable to prepare an upload part.')
            for (const part of urlData.completedParts as Array<{ partNumber: number; etag: string }>) {
                multipart.completedParts.set(part.partNumber, part.etag)
            }
            if (multipart.completedParts.has(partNumber)) continue
            const partUrl = urlData.urls?.[0]?.url as string | undefined
            if (!partUrl) throw new Error('The server did not return a signed URL for this part.')

            const start = (partNumber - 1) * chunkSize
            const rawChunk = payload.slice(start, Math.min(start + chunkSize, sourceSize))
            const blob = chunkedEncryption && vault ? await encryptVaultChunk(rawChunk, vault.key) : rawChunk
            const etag = await uploadPart(partUrl, blob, activeUpload, (loaded) => {
                const now = performance.now()
                if (now - lastPartProgress < 80) return
                lastPartProgress = now
                const transferred = [...multipart!.completedParts.keys()].reduce((total, number) => {
                    return total + Math.min(chunkSize, sourceSize - (number - 1) * chunkSize) + (chunkedEncryption ? 28 : 0)
                }, 0) + loaded
                updateUpload(upload.id, {
                    progress: Math.min(99, Math.round((transferred / uploadSize) * 100)),
                    speed: transferred / Math.max((now - startedAt) / 1000, 0.1),
                })
            })
            multipart.completedParts.set(partNumber, etag)
        }

        const completeResponse = await fetch('/api/upload/multipart/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: multipart.uploadId, fileId: multipart.fileId }),
            signal: activeUpload.controller.signal,
        })
        const completeData = await completeResponse.json().catch(() => null)
        if (!completeResponse.ok) throw new Error(completeData?.error ?? 'Unable to assemble multipart upload.')

        updateUpload(upload.id, { status: 'PREPARING', progress: 100, speed: 0, xhr: undefined })
        const saveResponse = await fetch('/api/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileId: multipart.fileId,
                versionId: multipart.versionId,
                name: upload.fileName,
                size: uploadSize,
                mimeType,
                encrypted,
                originalMimeType: encrypted ? upload.file.type || 'application/octet-stream' : null,
                originalSize: encrypted ? upload.fileSize : null,
                encryptionChunkSize: chunkedEncryption ? chunkSize : null,
                folderId: cleanFolderId ?? null,
                fileHash,
            }),
            signal: activeUpload.controller.signal,
        })
        const savedData = await saveResponse.json().catch(() => null)
        if (!saveResponse.ok) {
            const detailMsg = savedData?.details ? `: ${savedData.details}` : ''
            throw new Error((savedData?.error ?? 'Unable to save uploaded file.') + detailMsg)
        }
        multipartSessions.current.delete(upload.id)
        encryptedPayloads.current.delete(upload.id)
        window.dispatchEvent(new CustomEvent('drivea:file-uploaded', { detail: savedData.file }))
        updateUpload(upload.id, { status: 'COMPLETED', progress: 100, speed: 0, xhr: undefined })
    }

    function uploadPart(
        url: string,
        blob: Blob,
        activeUpload: ActiveUpload,
        onProgress: (loaded: number) => void,
    ) {
        return new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest()
            activeUpload.xhr = xhr
            xhr.open('PUT', url)
            xhr.upload.onprogress = (event) => onProgress(event.loaded)
            xhr.onload = () => {
                const etag = xhr.getResponseHeader('ETag')
                if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag)
                else reject(new Error(xhr.status >= 200 && xhr.status < 300
                    ? 'Storage did not expose the uploaded part ETag. Configure CORS to expose ETag.'
                    : `Storage rejected this upload part (HTTP ${xhr.status}).`))
            }
            xhr.onerror = () => reject(new Error('Network error while uploading to storage.'))
            xhr.ontimeout = () => reject(new Error('Upload timed out while sending this file part.'))
            xhr.onabort = () => reject(new DOMException('Upload paused.', 'AbortError'))
            xhr.timeout = 120_000
            xhr.send(blob)
        })
    }

    function processUploadQueue() {
        while (activeUploadCount.current < maxConcurrentUploads && uploadQueue.current.length > 0) {
            const upload = uploadQueue.current.shift()
            if (!upload) break
            activeUploadCount.current += 1
            updateUpload(upload.id, { status: 'PREPARING', error: undefined })
            void uploadFile(upload)
                .catch((err: unknown) => {
                    console.error(`Upload error for ${upload.fileName}:`, err)
                    updateUpload(upload.id, {
                        status: 'ERROR',
                        speed: 0,
                        error: err instanceof Error ? err.message : 'Upload failed.',
                    })
                })
                .finally(() => {
                    activeUploadCount.current = Math.max(0, activeUploadCount.current - 1)
                    processUploadQueue()
                })
        }
    }

    function uploadFiles(files: File[], folderId?: string) {
        const safeFolderId = folderId && String(folderId).trim() ? String(folderId).trim() : undefined
        const fileList = Array.from(files || [])
        if (!fileList.length) return

        const newUploads = fileList.map((file): UploadItem => ({
            id: generateUniqueId(),
            file,
            fileName: file.name,
            fileSize: file.size,
            progress: 0,
            speed: 0,
            status: 'QUEUED',
            folderId: safeFolderId,
        }))

        setUploads((current) => [...newUploads, ...current])
        uploadQueue.current.push(...newUploads)
        processUploadQueue()
    }

    function reportUploadError(file: File, error: string) {
        setUploads((current) => [{
            id: generateUniqueId(),
            file,
            fileName: file.name,
            fileSize: file.size,
            progress: 0,
            speed: 0,
            status: 'ERROR',
            error,
        }, ...current])
    }

    function cancelUpload(id: string) {
        uploadQueue.current = uploadQueue.current.filter((upload) => upload.id !== id)
        const activeUpload = activeUploads.current.get(id)
        if (activeUpload) {
            activeUpload.controller.abort()
            activeUpload.xhr?.abort()
        }
        updateUpload(id, { status: 'CANCELLED', speed: 0, xhr: undefined })
        const multipart = multipartSessions.current.get(id)
        if (multipart) {
            void fetch('/api/upload/multipart/abort', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileId: multipart.fileId, uploadId: multipart.uploadId }),
            })
            multipartSessions.current.delete(id)
        }
        encryptedPayloads.current.delete(id)
    }

    function pauseUpload(id: string) {
        const activeUpload = activeUploads.current.get(id)
        if (!activeUpload) return
        activeUpload.paused = true
        activeUpload.controller.abort()
        activeUpload.xhr?.abort()
    }

    function resumeUpload(id: string) {
        setUploads((current) => {
            const upload = current.find((item) => item.id === id)
            if (!upload || (upload.status !== 'PAUSED' && upload.status !== 'ERROR')) return current
            setTimeout(() => {
                uploadQueue.current.push({ ...upload, status: 'QUEUED', error: undefined })
                processUploadQueue()
            }, 0)
            return current.map((item) => item.id === id ? { ...item, status: 'QUEUED', error: undefined } : item)
        })
    }

    function minimizeWidget() {
        setIsWidgetMinimized(true)
    }

    function toggleWidget() {
        setIsWidgetMinimized((minimized) => !minimized)
    }

    function unlockVault(folderId: string, key: CryptoKey) {
        setVault({ folderId, key })
    }

    function lockVault() {
        setVault(null)
    }

    return (
        <UploadContext.Provider value={{
            uploads,
            uploadFiles,
            reportUploadError,
            cancelUpload,
            pauseUpload,
            resumeUpload,
            unlockVault,
            lockVault,
            vaultFolderId: vault?.folderId ?? null,
            vaultKey: vault?.key ?? null,
            minimizeWidget,
            toggleWidget,
            isWidgetMinimized,
        }}>
            {children}
        </UploadContext.Provider>
    )
}

export function useUpload() {
    const context = useContext(UploadContext)
    if (!context) throw new Error('useUpload must be used within an UploadProvider.')
    return context
}