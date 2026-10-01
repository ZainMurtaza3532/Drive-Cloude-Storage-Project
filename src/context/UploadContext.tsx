'use client'

import { createContext, useContext, useRef, useState } from 'react'
import { encryptVaultChunk, encryptVaultFile } from '@/lib/vault-crypto'
import { MULTIPART_CHUNK_SIZE } from '@/lib/upload-constraints'

export type UploadStatus = 'PREPARING' | 'UPLOADING' | 'PAUSED' | 'COMPLETED' | 'ERROR' | 'CANCELLED'

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

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const [uploads, setUploads] = useState<UploadItem[]>([])
    const [isWidgetMinimized, setIsWidgetMinimized] = useState(false)
    const [vault, setVault] = useState<{ folderId: string; key: CryptoKey } | null>(null)
    const activeUploads = useRef(new Map<string, ActiveUpload>())
    const multipartSessions = useRef(new Map<string, MultipartSession>())
    const encryptedPayloads = useRef(new Map<string, Blob>())

    function updateUpload(id: string, patch: Partial<UploadItem>) {
        setUploads((current) => current.map((upload) =>
            upload.id === id ? { ...upload, ...patch } : upload,
        ))
    }

    async function uploadFile(upload: UploadItem) {
        const activeUpload: ActiveUpload = { controller: new AbortController() }
        activeUploads.current.set(upload.id, activeUpload)

        try {
            let isVaultDestination = false
            if (upload.folderId) {
                const vaultResponse = await fetch(`/api/vault?folderId=${encodeURIComponent(upload.folderId)}`, { signal: activeUpload.controller.signal })
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
            if (uploadSize > 10_000_000) {
                await uploadMultipartFile(upload, activeUpload, payload, uploadSize, uploadMimeType, encrypted, chunkedEncryption)
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
                    folderId: upload.folderId,
                }),
                signal: activeUpload.controller.signal,
            })
            const presignData = await presignResponse.json().catch(() => null)
            if (!presignResponse.ok) {
                throw new Error(presignData?.error ?? 'Unable to prepare upload.')
            }

            const xhr = new XMLHttpRequest()
            activeUpload.xhr = xhr
            updateUpload(upload.id, { status: 'UPLOADING', xhr })
            const startedAt = performance.now()

            await new Promise<void>((resolve, reject) => {
                xhr.open('PUT', presignData.uploadUrl)
                xhr.setRequestHeader('Content-Type', uploadMimeType)
                xhr.upload.onprogress = (event) => {
                    const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.1)
                    updateUpload(upload.id, {
                        progress: event.lengthComputable
                            ? Math.min(100, Math.round((event.loaded / event.total) * 100))
                            : 0,
                        speed: event.loaded / elapsedSeconds,
                    })
                }
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve()
                    else reject(new Error('Storage rejected this upload.'))
                }
                xhr.onerror = () => reject(new Error('Network error while uploading to storage.'))
                xhr.onabort = () => reject(new DOMException('Upload canceled.', 'AbortError'))
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
                    folderId: upload.folderId,
                }),
                signal: activeUpload.controller.signal,
            })
            const completeData = await completeResponse.json().catch(() => null)
            if (!completeResponse.ok) {
                throw new Error(completeData?.error ?? 'Unable to save uploaded file.')
            }

            window.dispatchEvent(new CustomEvent('drivea:file-uploaded', { detail: completeData.file }))
            encryptedPayloads.current.delete(upload.id)
            updateUpload(upload.id, { status: 'COMPLETED', progress: 100, speed: 0 })
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                updateUpload(upload.id, {
                    status: activeUpload.paused ? 'PAUSED' : 'CANCELLED',
                    speed: 0,
                    xhr: undefined,
                })
            } else {
                updateUpload(upload.id, {
                    status: 'ERROR',
                    speed: 0,
                    xhr: undefined,
                    error: error instanceof Error ? error.message : 'Upload failed.',
                })
            }
        } finally {
            activeUploads.current.delete(upload.id)
        }
    }

    async function uploadMultipartFile(upload: UploadItem, activeUpload: ActiveUpload, payload: Blob, uploadSize: number, mimeType: string, encrypted: boolean, chunkedEncryption: boolean) {
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
                    folderId: upload.folderId,
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
            let etag = ''
            let attempt = 0
            while (!etag) {
                try {
                    etag = await uploadPart(partUrl, blob, activeUpload, (loaded) => {
                        const transferred = [...multipart.completedParts.keys()].reduce((total, number) => {
                            return total + Math.min(chunkSize, sourceSize - (number - 1) * chunkSize) + (chunkedEncryption ? 28 : 0)
                        }, 0) + loaded
                        updateUpload(upload.id, {
                            progress: Math.min(99, Math.round((transferred / uploadSize) * 100)),
                            speed: transferred / Math.max((performance.now() - startedAt) / 1000, 0.1),
                        })
                    })
                } catch (error) {
                    if (activeUpload.controller.signal.aborted) throw error
                    attempt += 1
                    if (attempt > 5) throw error
                    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 16000)))
                }
            }
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
                folderId: upload.folderId,
            }),
            signal: activeUpload.controller.signal,
        })
        const savedData = await saveResponse.json().catch(() => null)
        if (!saveResponse.ok) throw new Error(savedData?.error ?? 'Unable to save uploaded file.')
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
                    : 'Storage rejected this upload part.'))
            }
            xhr.onerror = () => reject(new Error('Network error while uploading to storage.'))
            xhr.onabort = () => reject(new DOMException('Upload paused.', 'AbortError'))
            xhr.send(blob)
        })
    }

    function uploadFiles(files: File[], folderId?: string) {
        const newUploads = files.map((file): UploadItem => ({
            id: crypto.randomUUID(),
            file,
            fileName: file.name,
            fileSize: file.size,
            progress: 0,
            speed: 0,
            status: 'PREPARING',
            folderId,
        }))

        setUploads((current) => [...newUploads, ...current])
        newUploads.forEach((upload) => void uploadFile(upload))
    }

    function reportUploadError(file: File, error: string) {
        setUploads((current) => [{
            id: crypto.randomUUID(),
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
        const upload = uploads.find((item) => item.id === id)
        if (!upload || (upload.status !== 'PAUSED' && upload.status !== 'ERROR')) return
        updateUpload(id, { status: 'PREPARING', error: undefined })
        void uploadFile(upload)
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