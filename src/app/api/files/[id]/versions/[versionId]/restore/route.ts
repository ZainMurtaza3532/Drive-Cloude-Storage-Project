import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFilePermission } from '@/lib/folder-access'
import { fileListSelect, toDriveFilePayload } from '@/lib/files'
import prisma from '@/lib/prisma'

type RouteContext = { params: Promise<{ id: string; versionId: string }> }

export async function POST(_request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id, versionId } = await params
        const permission = await getFilePermission(id, session.user.id)
        if (!permission) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        if (!canEditFolder(permission)) {
            return NextResponse.json({ error: 'Viewer access cannot restore file versions.' }, { status: 403 })
        }

        const file = await prisma.file.findFirst({ where: { id, isTrash: false }, select: { id: true } })
        if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

        const restored = await prisma.$transaction(async (transaction) => {
            const version = await transaction.fileVersion.findFirst({
                where: { id: versionId, fileId: id },
                select: { id: true },
            })
            if (!version) return null

            await transaction.fileVersion.updateMany({ where: { fileId: id }, data: { isCurrent: false } })
            await transaction.fileVersion.update({ where: { id: versionId }, data: { isCurrent: true } })
            return transaction.file.update({
                where: { id },
                data: { updatedAt: new Date() },
                select: fileListSelect,
            })
        })

        if (!restored) return NextResponse.json({ error: 'File version not found.' }, { status: 404 })
        return NextResponse.json({ file: toDriveFilePayload(restored, session.user.name || 'You') })
    } catch (error) {
        console.error('Unable to restore file version:', error)
        return NextResponse.json({ error: 'Unable to restore this version.' }, { status: 500 })
    }
}