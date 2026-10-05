import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LARGE_FILE_BYTES = 50 * 1024 * 1024
const OLD_FILE_AGE_MS = 365 * 24 * 60 * 60 * 1000
const DUPLICATE_SCAN_LIMIT = 2_000
const categoryOrder = ['Images', 'Videos', 'Audio', 'Documents', 'Other'] as const

function categoryForMimeType(mimeType: string) {
    if (mimeType.startsWith('image/')) return 'Images'
    if (mimeType.startsWith('video/')) return 'Videos'
    if (mimeType.startsWith('audio/')) return 'Audio'
    if (mimeType === 'application/pdf' || mimeType.startsWith('text/') ||
        /word|document|spreadsheet|presentation|opendocument/.test(mimeType)) return 'Documents'
    return 'Other'
}

type AnalyzedFile = {
    id: string
    name: string
    fileHash: string | null
    updatedAt: Date
    versions: Array<{ size: bigint; mimeType: string }>
}

type StorageFileRow = Omit<AnalyzedFile, 'fileHash'> & { fileHash?: string | null }

function isMissingFileHashColumn(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2022' &&
        /fileHash/i.test(error.message)
}

function findDuplicateCandidates(files: AnalyzedFile[]) {
    const groups = new Map<string, AnalyzedFile[]>()
    for (const file of files.slice(0, DUPLICATE_SCAN_LIMIT)) {
        const version = file.versions[0]
        if (!version) continue
        const key = file.fileHash
            ? `hash:${file.fileHash}`
            : `metadata:${file.name.toLocaleLowerCase()}:${version.size}:${version.mimeType}`
        const group = groups.get(key) ?? []
        group.push(file)
        groups.set(key, group)
    }

    return [...groups.values()]
        .filter((group) => group.length > 1)
        .flatMap((group) => {
            const ordered = [...group].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
            return ordered.slice(1).map((file) => ({
                id: file.id,
                name: file.name,
                size: Number(file.versions[0].size),
                reason: file.fileHash ? 'Matching file checksum' : 'Same name, size, and type',
                updatedAt: file.updatedAt.toISOString(),
            }))
        })
        .slice(0, 10)
}

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const userId = session.user.id
        const where = { userId, isTrash: false, versions: { some: { isCurrent: true } } }
        const baseSelect = {
            id: true,
            name: true,
            updatedAt: true,
            versions: {
                where: { isCurrent: true },
                select: { size: true, mimeType: true },
                take: 1,
            },
        } as const
        let files: AnalyzedFile[]
        let checksumColumnAvailable = true
        try {
            const rows: StorageFileRow[] = await prisma.file.findMany({
                where,
                select: { ...baseSelect, fileHash: true },
                orderBy: { updatedAt: 'desc' },
            })
            files = rows.map((file) => ({ ...file, fileHash: file.fileHash ?? null }))
        } catch (error) {
            if (!isMissingFileHashColumn(error)) throw error
            console.warn('Storage analysis is falling back to metadata-based duplicate detection because File.fileHash is not available in the database.')
            checksumColumnAvailable = false
            files = await prisma.file.findMany({
                where,
                select: baseSelect,
                orderBy: { updatedAt: 'desc' },
            }).then((rows) => rows.map((file) => ({ ...file, fileHash: null })))
        }

        const categoryBytes = new Map<string, number>()
        const largeFiles: Array<{ id: string; name: string; size: number; reason: string }> = []
        const oldFiles: Array<{ id: string; name: string; size: number; reason: string; updatedAt: string }> = []
        const oldFileCutoff = Date.now() - OLD_FILE_AGE_MS

        for (const file of files) {
            const version = file.versions[0]
            if (!version) continue
            const size = Number(version.size)
            if (!Number.isSafeInteger(size) || size < 0) {
                throw new Error(`Invalid stored file size for file ${file.id}.`)
            }

            const category = categoryForMimeType(version.mimeType.toLowerCase())
            categoryBytes.set(category, (categoryBytes.get(category) ?? 0) + size)

            if (size >= LARGE_FILE_BYTES) {
                largeFiles.push({ id: file.id, name: file.name, size, reason: 'Larger than 50 MB' })
            }
            if (file.updatedAt.getTime() <= oldFileCutoff) {
                oldFiles.push({
                    id: file.id,
                    name: file.name,
                    size,
                    reason: 'Not modified in over a year',
                    updatedAt: file.updatedAt.toISOString(),
                })
            }
        }

        return NextResponse.json({
            breakdown: categoryOrder.map((category) => ({
                category,
                bytes: categoryBytes.get(category) ?? 0,
            })),
            suggestions: {
                largeFiles: largeFiles.sort((left, right) => right.size - left.size).slice(0, 5),
                duplicates: findDuplicateCandidates(files),
                oldFiles: oldFiles.sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).slice(0, 5),
                duplicateScanTruncated: files.length > DUPLICATE_SCAN_LIMIT,
                checksumColumnAvailable,
            },
        }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    } catch (error) {
        console.error('Unable to analyze storage usage:', error)
        return NextResponse.json({ error: 'Unable to analyze storage usage.' }, { status: 500 })
    }
}
