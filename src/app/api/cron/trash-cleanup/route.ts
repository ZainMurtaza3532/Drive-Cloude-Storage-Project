import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { permanentlyDeleteItems } from '@/lib/trash'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RETENTION_DAYS = 30

function isAuthorized(request: Request) {
    const secret = process.env.CRON_SECRET
    if (!secret) {
        console.error('Trash cleanup is disabled because CRON_SECRET is not configured.')
        return false
    }
    return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    }

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

    try {
        const [files, folders] = await Promise.all([
            prisma.file.findMany({
                where: { isTrash: true, trashedAt: { lte: cutoff } },
                select: { id: true, userId: true },
            }),
            prisma.folder.findMany({
                where: { isTrash: true, trashedAt: { lte: cutoff } },
                select: { id: true, userId: true },
            }),
        ])

        const userIds = new Set([...files.map(({ userId }) => userId), ...folders.map(({ userId }) => userId)])
        let deletedFiles = 0
        let deletedFolders = 0
        for (const userId of userIds) {
            const userFiles = files.filter((file) => file.userId === userId).map(({ id }) => id)
            const userFolders = folders.filter((folder) => folder.userId === userId).map(({ id }) => id)
            const result = await permanentlyDeleteItems(userId, userFiles, userFolders)
            deletedFiles += result.deletedFiles
            deletedFolders += result.deletedFolders
        }

        return NextResponse.json({
            success: true,
            retentionDays: RETENTION_DAYS,
            deletedFiles,
            deletedFolders,
        })
    } catch (error) {
        console.error('Automated Trash cleanup failed:', error)
        return NextResponse.json({ error: 'Unable to complete automated Trash cleanup.' }, { status: 500 })
    }
}
