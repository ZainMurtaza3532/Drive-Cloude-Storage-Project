'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileExplorer, type DriveFile } from '@/components/files/FileExplorer'
import { FilePreviewModal } from '@/components/files/FilePreviewModal'

type SearchResponse = { results?: DriveFile[]; error?: string }

export function SearchResultsPage() {
    const searchParams = useSearchParams()
    const queryString = searchParams.toString()
    const [files, setFiles] = useState<DriveFile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        setIsLoading(true)
        setError('')

        fetch(`/api/search${queryString ? `?${queryString}` : ''}`, { signal: controller.signal })
            .then(async (response) => {
                const data = await response.json() as SearchResponse
                if (!response.ok) throw new Error(data.error ?? 'Unable to search files.')
                setFiles(data.results ?? [])
            })
            .catch((searchError) => {
                if (searchError instanceof DOMException && searchError.name === 'AbortError') return
                setError(searchError instanceof Error ? searchError.message : 'Unable to search files.')
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLoading(false)
            })

        return () => controller.abort()
    }, [queryString])

    const query = searchParams.get('q')

    return (
        <div className="space-y-6">
            <header className="border-b border-slate-200 pb-5 dark:border-slate-800">
                <Link href="/dashboard" className="text-xs font-semibold uppercase tracking-wide text-[#f15a24] hover:text-[#d94e1b]">My Drive</Link>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Search results</h1>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{query ? `Results for “${query}”` : 'Matching files across your drive and shared folders.'}</p>
            </header>

            {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
            {isLoading ? (
                <p className="py-12 text-center text-sm text-slate-500">Searching files...</p>
            ) : (
                <FileExplorer
                    files={files}
                    onOpen={setSelectedFile}
                    onBulkDownload={async (fileIds) => {
                        const query = new URLSearchParams({ fileIds: fileIds.join(',') })
                        window.location.assign(`/api/files/download-zip?${query}`)
                    }}
                />
            )}
            <FilePreviewModal file={selectedFile} onClose={() => setSelectedFile(null)} />
        </div>
    )
}