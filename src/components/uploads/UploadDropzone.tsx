'use client'

import { useDropzone } from 'react-dropzone'
import { FileUp } from 'lucide-react'
import { useUpload } from '@/context/UploadContext'

type UploadDropzoneProps = {
    folderId: string | null
    disabled?: boolean
    children: (openFileDialog: () => void) => React.ReactNode
}

export function UploadDropzone({ folderId, disabled = false, children }: UploadDropzoneProps) {
    const { uploadFiles, reportUploadError } = useUpload()

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        disabled,
        noClick: true,
        noKeyboard: true,
        onDrop: (acceptedFiles, rejectedFiles) => {
            uploadFiles(acceptedFiles, folderId ?? undefined)
            rejectedFiles.forEach(({ file, errors }) => {
                reportUploadError(file, errors[0]?.message ?? 'This file cannot be uploaded.')
            })
        },
    })

    return (
        <div {...getRootProps({ className: 'relative min-h-full outline-none' })}>
            <input {...getInputProps()} />
            {children(open)}

            {isDragActive && (
                <div className="pointer-events-none fixed inset-6 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-[#f15a24] bg-[#f15a24]/10 dark:bg-[#0b0f17]/90 text-slate-900 dark:text-white shadow-2xl backdrop-blur-md animate-in fade-in duration-150">
                    <div className="text-center p-8">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#f15a24]/20 text-[#f15a24]">
                            <FileUp className="h-8 w-8 stroke-[2.5]" />
                        </div>
                        <p className="text-xl font-bold">Drop files to upload</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Files will be uploaded directly to this folder</p>
                    </div>
                </div>
            )}

        </div>
    )
}