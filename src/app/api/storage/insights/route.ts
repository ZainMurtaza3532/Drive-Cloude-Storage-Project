import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
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

function findDuplicateCandidates(files: Array<{
    id: string
    name: string
    fileHash: string | null
    updatedAt: Date
    versions: Array<{ size: bigint; mimeType: string }>
}>) {
    const groups = new Map<string, typeof files>()
    for (const file of files) {
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
        const [versionGroups, largeVersions, oldFiles, duplicateScan] = await Promise.all([
            prisma.fileVersion.groupBy({
                by: ['mimeType'],
                where: { file: { is: { userId } } },
                _sum: { size: true },
            }),
            prisma.fileVersion.findMany({
                where: {
                    isCurrent: true,
                    size: { gte: BigInt(LARGE_FILE_BYTES) },
                    file: { is: { userId, isTrash: false } },
                },
                select: {
                    size: true,
                    file: { select: { id: true, name: true, updatedAt: true } },
                },
                orderBy: { size: 'desc' },
                take: 5,
            }),
            prisma.file.findMany({
                where: {
                    userId,
                    isTrash: false,
                    updatedAt: { lte: new Date(Date.now() - OLD_FILE_AGE_MS) },
                    versions: { some: { isCurrent: true } },
                },
                select: {
                    id: true,
                    name: true,
                    updatedAt: true,
                    versions: { where: { isCurrent: true }, select: { size: true }, take: 1 },
                },
                orderBy: { updatedAt: 'asc' },
                take: 5,
            }),
            prisma.file.findMany({
                where: { userId, isTrash: false, versions: { some: { isCurrent: true } } },
                select: {
                    id: true,
                    name: true,
                    fileHash: true,
                    updatedAt: true,
                    versions: { where: { isCurrent: true }, select: { size: true, mimeType: true }, take: 1 },
                },
                orderBy: { updatedAt: 'desc' },
                take: DUPLICATE_SCAN_LIMIT,
            }),
        ])

        const categoryBytes = new Map<string, number>()
        for (const group of versionGroups) {
            const category = categoryForMimeType(group.mimeType)
            categoryBytes.set(category, (categoryBytes.get(category) ?? 0) + Number(group._sum.size ?? BigInt(0)))
        }

        return NextResponse.json({
            breakdown: categoryOrder.map((category) => ({
                category,
                bytes: categoryBytes.get(category) ?? 0,
            })),
            suggestions: {
                largeFiles: largeVersions.map(({ size, file }) => ({
                    id: file.id,
                    name: file.name,
                    size: Number(size),
                    reason: 'Larger than 50 MB',
                })),
                duplicates: findDuplicateCandidates(duplicateScan),
                oldFiles: oldFiles.map((file) => ({
                    id: file.id,
                    name: file.name,
                    size: Number(file.versions[0]?.size ?? 0),
                    reason: 'Not modified in over a year',
                    updatedAt: file.updatedAt.toISOString(),
                })),
                duplicateScanTruncated: duplicateScan.length === DUPLICATE_SCAN_LIMIT,
            },
        }, { headers: { 'Cache-Control': 'no-store, max-age=0' } })
    } catch (error) {
        console.error('Unable to analyze storage usage:', error)
        return NextResponse.json({ error: 'Unable to analyze storage usage.' }, { status: 500 })
    }
}
