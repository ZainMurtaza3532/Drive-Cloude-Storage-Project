import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
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

        const folder = await prisma.folder.findFirst({
            where: {
                id,
                userId: session.user.id,
            },
        })

        if (!folder) {
            return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const nextName = typeof body?.name === 'string' ? body.name.trim() : undefined
        const nextParentId = typeof body?.parentId === 'string' ? body.parentId : undefined
        const isStarred = typeof body?.isStarred === 'boolean' ? body.isStarred : undefined
        const isTrash = typeof body?.isTrash === 'boolean' ? body.isTrash : undefined

        if (nextName !== undefined && !nextName) {
            return NextResponse.json({ error: 'Folder name cannot be empty.' }, { status: 400 })
        }

        if (nextParentId !== undefined) {
            if (nextParentId === id) {
                return NextResponse.json({ error: 'A folder cannot be moved into itself.' }, { status: 400 })
            }

            if (nextParentId) {
                const parentExists = await prisma.folder.findFirst({
                    where: {
                        id: nextParentId,
                        userId: session.user.id,
                        isTrash: false,
                    },
                })

                if (!parentExists) {
                    return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
                }
            }
        }

        const updatedFolder = await prisma.folder.update({
            where: { id },
            data: {
                ...(nextName !== undefined ? { name: nextName } : {}),
                ...(nextParentId !== undefined ? { parentId: nextParentId || null } : {}),
                ...(isStarred !== undefined ? { isStarred } : {}),
                ...(isTrash !== undefined ? {
                    isTrash,
                    trashedAt: isTrash ? (folder.isTrash ? folder.trashedAt : new Date()) : null,
                } : {}),
            },
        })

        return NextResponse.json({ folder: updatedFolder })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unable to update folder.' },
            { status: 500 }
        )
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params

        const folder = await prisma.folder.findFirst({
            where: {
                id,
                userId: session.user.id,
            },
        })

        if (!folder) {
            return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const permanentlyDelete = new URL(request.url).searchParams.get('permanent') === '1'

        if (permanentlyDelete) {
            if (!folder.isTrash) {
                return NextResponse.json({ error: 'Move the folder to Trash before permanently deleting it.' }, { status: 409 })
            }

            const result = await permanentlyDeleteItems(session.user.id, [], [id])
            return NextResponse.json(result)
        }

        const deletedFolder = await prisma.folder.update({
            where: { id },
            data: {
                isTrash: true,
                trashedAt: folder.isTrash ? folder.trashedAt : new Date(),
                parentId: null,
            },
        })

        return NextResponse.json({ folder: deletedFolder })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unable to delete folder.' },
            { status: 500 }
        )
    }
}
