'use client'

import { useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileUp } from 'lucide-react'
import { useUpload } from '@/context/UploadContext'

type UploadDropzoneProps = {
    folderId: string | null
    disabled?: boolean
    children: (openFileDialog: () => void, openFolderDialog: () => void) => React.ReactNode
}

export function UploadDropzone({ folderId, disabled = false, children }: UploadDropzoneProps) {
    const { uploadFiles, reportUploadError } = useUpload()
    const folderInputRef = useRef<HTMLInputElement>(null)

    async function uploadFilesWithStructure(files: File[]) {
        if (!files.length) return

        const filePaths = files.map((file) => {
            const fileWithPath = file as File & { path?: string }
            const path = file.webkitRelativePath || fileWithPath.path || file.name
            return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^(?:\.\/)+/, '')
        })
        const parsed = files.map((file, index) => {
            const segments = filePaths[index].split('/')
            const valid = segments.every((segment) => segment && segment !== '.' && segment !== '..')
            return { file, segments, valid }
        })

        const hasDirectoryPaths = parsed.some(({ segments }) => segments.length > 1)
        if (!hasDirectoryPaths) {
            uploadFiles(files, folderId ?? undefined)
            return
        }

        const validFiles = parsed.filter(({ valid }) => valid)
        parsed.filter(({ valid }) => !valid).forEach(({ file }) => {
            reportUploadError(file, 'This folder contains a file with an invalid path.')
        })
        if (!validFiles.length) return

        const directoryPaths = [...new Set(validFiles
            .map(({ segments }) => segments.slice(0, -1).join('/'))
            .filter(Boolean))]
        let folderIds: Record<string, string> = {}
        if (directoryPaths.length) {
            const response = await fetch('/api/folders/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parentId: folderId, paths: directoryPaths }),
            })
            const data = await response.json().catch(() => null) as { folders?: Record<string, string>; error?: string } | null
            if (!response.ok || !data?.folders) {
                const message = data?.error ?? 'Unable to create the selected folder structure.'
                validFiles.forEach(({ file }) => reportUploadError(file, message))
                return
            }
            folderIds = data.folders
        }

        const filesByFolder = new Map<string, File[]>()
        for (const { file, segments } of validFiles) {
            const directoryPath = segments.slice(0, -1).join('/')
            const destinationId = folderIds[directoryPath] ?? folderId ?? ''
            const destinationFiles = filesByFolder.get(destinationId) ?? []
            destinationFiles.push(file)
            filesByFolder.set(destinationId, destinationFiles)
        }
        filesByFolder.forEach((destinationFiles, destinationId) => uploadFiles(destinationFiles, destinationId || undefined))
        window.dispatchEvent(new CustomEvent('drivea:folders-created', {
            detail: { parentId: folderId },
        }))
    }

    async function handleFolderUpload(event: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.currentTarget.files ?? [])
        event.currentTarget.value = ''
        try {
            await uploadFilesWithStructure(files)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to upload this folder.'
            files.forEach((file) => reportUploadError(file, message))
        }
    }

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        disabled,
        noClick: true,
        noKeyboard: true,
        onDrop: (acceptedFiles, rejectedFiles) => {
            void uploadFilesWithStructure(acceptedFiles).catch((error: unknown) => {
                const message = error instanceof Error ? error.message : 'Unable to upload these files.'
                acceptedFiles.forEach((file) => reportUploadError(file, message))
            })
            rejectedFiles.forEach(({ file, errors }) => {
                reportUploadError(file, errors[0]?.message ?? 'This file cannot be uploaded.')
            })
        },
    })

    return (
        <div {...getRootProps({ className: 'relative min-h-full outline-none' })}>
            <input {...getInputProps()} />
            <input
                ref={(input) => {
                    folderInputRef.current = input
                    input?.setAttribute('webkitdirectory', '')
                    input?.setAttribute('mozdirectory', '')
                    input?.setAttribute('directory', '')
                }}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => void handleFolderUpload(event)}
            />
            {children(open, () => folderInputRef.current?.click())}

            {isDragActive && (
                <div className="pointer-events-none fixed inset-6 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-[#f15a24] bg-[#f15a24]/10 dark:bg-[#0b0f17]/90 text-slate-900 dark:text-white shadow-2xl backdrop-blur-md animate-in fade-in duration-150">
                    <div className="text-center p-8">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f15a24]/20 text-[#f15a24]">
                            <FileUp className="h-8 w-8 stroke-[2.5]" />
                        </div>
                        <p className="text-xl font-bold">Drop files or folders to upload</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Folders and their directory structure will be preserved</p>
                    </div>
                </div>
            )}

        </div>
    )
}