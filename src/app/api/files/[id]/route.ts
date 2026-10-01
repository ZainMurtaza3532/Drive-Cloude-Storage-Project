import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFilePermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { permanentlyDeleteItems } from '@/lib/trash'

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params
        const body = await request.json()
        const file = await prisma.file.findFirst({
            where: { id },
            select: { id: true, isTrash: true, trashedAt: true, userId: true, folderId: true },
        })

        if (!file) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }

        const permission = await getFilePermission(id, session.user.id)
        if (!permission) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        if (!canEditFolder(permission)) {
            return NextResponse.json({ error: 'Viewer access cannot modify files.' }, { status: 403 })
        }

        const isStarred = typeof body?.isStarred === 'boolean' ? body.isStarred : undefined
        const action = body?.action
        if (isStarred === undefined && action !== 'trash' && action !== 'restore') {
            return NextResponse.json({ error: 'A valid file action is required.' }, { status: 400 })
        }

        const isTrash = action === 'trash' ? true : action === 'restore' ? false : undefined
        const updatedFile = await prisma.file.update({
            where: { id },
            data: {
                ...(isStarred !== undefined ? { isStarred } : {}),
                ...(isTrash !== undefined ? {
                    isTrash,
                    trashedAt: isTrash ? (file.isTrash ? file.trashedAt : new Date()) : null,
                } : {}),
            },
            select: { id: true, isStarred: true, isTrash: true, trashedAt: true },
        })

        return NextResponse.json({ file: updatedFile })
    } catch (error) {
        console.error('Unable to update file:', error)
        return NextResponse.json({ error: 'Unable to update this file.' }, { status: 500 })
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params
        const file = await prisma.file.findFirst({
            where: { id, userId: session.user.id },
            select: { id: true, isTrash: true },
        })

        if (!file) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }

        if (!file.isTrash) {
            return NextResponse.json({ error: 'Move the file to Trash before permanently deleting it.' }, { status: 409 })
        }

        const result = await permanentlyDeleteItems(session.user.id, [id], [])
        return NextResponse.json(result)
    } catch (error) {
        console.error('Unable to permanently delete file:', error)
        return NextResponse.json({ error: 'Unable to permanently delete this file.' }, { status: 500 })
    }
}