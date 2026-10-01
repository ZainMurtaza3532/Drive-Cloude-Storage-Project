import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFilePermission, getFolderPermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { permanentlyDeleteItems } from '@/lib/trash'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const action = body?.action
        const fileIds = Array.isArray(body?.fileIds) ? [...new Set(body.fileIds.filter((id: unknown) => typeof id === 'string'))] as string[] : []

        if (fileIds.length === 0 || fileIds.length > 100 || !['trash', 'restore', 'delete', 'move'].includes(action)) {
            return NextResponse.json({ error: 'Select between 1 and 100 files and provide a valid action.' }, { status: 400 })
        }

        if (action === 'move') {
            const destinationValue = body?.destinationFolderId
            if (destinationValue !== null && typeof destinationValue !== 'string') {
                return NextResponse.json({ error: 'A valid destination folder is required.' }, { status: 400 })
            }
            const destinationFolderId = destinationValue || null

            if (destinationFolderId) {
                const folderPermission = await getFolderPermission(destinationFolderId, session.user.id)
                if (!canEditFolder(folderPermission)) {
                    return NextResponse.json({ error: 'You need Editor access to move files here.' }, { status: 403 })
                }
            }

            const files = await prisma.file.findMany({
                where: { id: { in: fileIds }, isTrash: false },
                select: { id: true, name: true, userId: true },
            })
            if (files.length !== fileIds.length) {
                return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
            }
            if (!destinationFolderId && files.some((file) => file.userId !== session.user.id)) {
                return NextResponse.json({ error: 'Shared files cannot be moved to your My Drive root.' }, { status: 403 })
            }

            for (const file of files) {
                const permission = await getFilePermission(file.id, session.user.id)
                if (!canEditFolder(permission)) {
                    return NextResponse.json({ error: 'Viewer access cannot move files.' }, { status: 403 })
                }
            }

            const conflictingFiles = await prisma.file.findMany({
                where: {
                    id: { notIn: fileIds },
                    name: { in: files.map(({ name }) => name) },
                    folderId: destinationFolderId,
                    isTrash: false,
                },
                select: { id: true },
                take: 1,
            })
            if (conflictingFiles.length) {
                return NextResponse.json({ error: 'The destination already contains a file with the same name.' }, { status: 409 })
            }

            const result = await prisma.file.updateMany({
                where: { id: { in: fileIds }, isTrash: false },
                data: { folderId: destinationFolderId },
            })
            return NextResponse.json({ movedFiles: result.count })
        }

        if (action === 'delete') {
            const trashedFiles = await prisma.file.findMany({
                where: { id: { in: fileIds }, userId: session.user.id, isTrash: true },
                select: { id: true },
            })

            if (trashedFiles.length !== fileIds.length) {
                return NextResponse.json({ error: 'Only your trashed files can be permanently deleted.' }, { status: 400 })
            }

            const result = await permanentlyDeleteItems(session.user.id, fileIds, [])
            return NextResponse.json(result)
        }

        const isTrash = action === 'trash'
        if (isTrash) {
            const files = await prisma.file.findMany({
                where: { id: { in: fileIds }, isTrash: false },
                select: { id: true },
            })
            if (files.length !== fileIds.length) {
                return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
            }

            for (const file of files) {
                const permission = await getFilePermission(file.id, session.user.id)
                if (!canEditFolder(permission)) {
                    return NextResponse.json({ error: 'Viewer access cannot move files to Trash.' }, { status: 403 })
                }
            }

            const result = await prisma.file.updateMany({
                where: { id: { in: fileIds }, isTrash: false },
                data: { isTrash: true, trashedAt: new Date() },
            })
            return NextResponse.json({ updatedFiles: result.count })
        }

        const result = await prisma.file.updateMany({
            where: {
                id: { in: fileIds },
                userId: session.user.id,
                isTrash: !isTrash,
            },
            data: {
                isTrash,
                trashedAt: isTrash ? new Date() : null,
            },
        })

        return NextResponse.json({ updatedFiles: result.count })
    } catch (error) {
        console.error('Unable to apply bulk file action:', error)
        return NextResponse.json({ error: 'Unable to update the selected files.' }, { status: 500 })
    }
}