import type { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderPermission } from '@/lib/folder-access'
import { fileListSelect, toDriveFilePayload } from '@/lib/files'
import prisma from '@/lib/prisma'

const supportedTypes = new Set(['image', 'video', 'document'])
const documentMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
]

export async function GET(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { searchParams } = new URL(request.url)
        const query = searchParams.get('q')?.trim() ?? ''
        const type = searchParams.get('type') ?? ''
        const requestedDateRange = searchParams.get('dateRange')?.trim().toLowerCase() ?? ''
        const dateRange = ['last 7 days', 'last-7-days'].includes(requestedDateRange) ? 'last7days' : requestedDateRange
        const minSizeValue = searchParams.get('minSize')
        const maxSizeValue = searchParams.get('maxSize')

        if (query.length > 200) return NextResponse.json({ error: 'Search text is too long.' }, { status: 400 })
        if (type && !supportedTypes.has(type)) {
            return NextResponse.json({ error: 'Choose image, video, or document as the file type.' }, { status: 400 })
        }
        if (dateRange && dateRange !== 'today' && dateRange !== 'last7days') {
            return NextResponse.json({ error: 'Choose today or last7days as the date range.' }, { status: 400 })
        }

        const minSize = minSizeValue === null ? undefined : Number(minSizeValue)
        const maxSize = maxSizeValue === null ? undefined : Number(maxSizeValue)
        if (
            (minSize !== undefined && (!Number.isSafeInteger(minSize) || minSize < 0)) ||
            (maxSize !== undefined && (!Number.isSafeInteger(maxSize) || maxSize < 0)) ||
            (minSize !== undefined && maxSize !== undefined && minSize > maxSize)
        ) {
            return NextResponse.json({ error: 'Enter a valid file size range in bytes.' }, { status: 400 })
        }

        const accessGrants = await prisma.folderAccess.findMany({
            where: { userId: session.user.id, folder: { isTrash: false } },
            select: { folderId: true },
        })
        const validGrantIds = await Promise.all(accessGrants.map(async ({ folderId }) => (
            await getFolderPermission(folderId, session.user.id) ? folderId : null
        )))
        const accessibleFolderIds = new Set(validGrantIds.filter((folderId): folderId is string => folderId !== null))
        let frontier = [...accessibleFolderIds]

        while (frontier.length > 0) {
            const children = await prisma.folder.findMany({
                where: { parentId: { in: frontier }, isTrash: false },
                select: { id: true },
            })
            frontier = children.map(({ id }) => id).filter((id) => !accessibleFolderIds.has(id))
            frontier.forEach((id) => accessibleFolderIds.add(id))
        }

        const versionFilter: Prisma.FileVersionWhereInput = {
            isCurrent: true,
            ...(minSize !== undefined || maxSize !== undefined
                ? { size: { ...(minSize !== undefined ? { gte: BigInt(minSize) } : {}), ...(maxSize !== undefined ? { lte: BigInt(maxSize) } : {}) } }
                : {}),
            ...(type === 'image' ? { mimeType: { startsWith: 'image/' } } : {}),
            ...(type === 'video' ? { mimeType: { startsWith: 'video/' } } : {}),
            ...(type === 'document'
                ? { OR: [{ mimeType: { startsWith: 'text/' } }, { mimeType: { in: documentMimeTypes } }] }
                : {}),
        }

        let updatedAt: Prisma.DateTimeFilter<'File'> | undefined
        if (dateRange === 'today') {
            const startOfToday = new Date()
            startOfToday.setHours(0, 0, 0, 0)
            updatedAt = { gte: startOfToday }
        } else if (dateRange === 'last7days') {
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            updatedAt = { gte: sevenDaysAgo }
        }

        const ownershipFilter: Prisma.FileWhereInput[] = [{ userId: session.user.id }]
        if (accessibleFolderIds.size > 0) {
            ownershipFilter.push({ folderId: { in: [...accessibleFolderIds] } })
        }

        const files = await prisma.file.findMany({
            where: {
                isTrash: false,
                OR: ownershipFilter,
                ...(query ? { name: { contains: query, mode: 'insensitive' } } : {}),
                ...(updatedAt ? { updatedAt } : {}),
                versions: { some: versionFilter },
            },
            select: fileListSelect,
            orderBy: { updatedAt: 'desc' },
            take: 100,
        })

        return NextResponse.json({ results: files.map((file) => toDriveFilePayload(file)) })
    } catch (error) {
        console.error('Unable to search files:', error)
        return NextResponse.json({ error: 'Unable to search files.' }, { status: 500 })
    }
}