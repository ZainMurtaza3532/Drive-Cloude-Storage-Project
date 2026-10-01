import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFolderPermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const parentId = searchParams.get('parentId')
        const view = searchParams.get('view')

        if (parentId && !view) {
            const permission = await getFolderPermission(parentId, session.user.id)
            if (!permission) return NextResponse.json({ error: 'Parent folder not found.' }, { status: 404 })

            const childFolders = await prisma.folder.findMany({
                where: { parentId, isTrash: false },
                orderBy: { updatedAt: 'desc' },
            })
            return NextResponse.json({
                folders: childFolders.map((folder) => ({ ...folder, canManage: folder.userId === session.user.id })),
                folderPermission: permission,
            })
        }

        const folders = await prisma.folder.findMany({
            where: {
                userId: session.user.id,
                isTrash: view === 'trash',
                ...(view === 'starred' ? { isStarred: true } : {}),
                ...(view === 'starred' || view === 'trash' ? {} : { parentId: parentId || null }),
            },
            orderBy: { updatedAt: 'desc' },
        })

        return NextResponse.json({
            folders: folders.map((folder) => ({ ...folder, canManage: folder.userId === session.user.id })),
            folderPermission: 'OWNER',
        })
    } catch (error) {
        console.error('Failed to load folders:', error)
        return NextResponse.json({ error: 'Unable to load folders. Check the database connection and schema.' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const name = typeof body?.name === 'string' ? body.name.trim() : ''
        const parentId = typeof body?.parentId === 'string' ? body.parentId : null

        if (!name) {
            return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 })
        }

        if (parentId) {
            const permission = await getFolderPermission(parentId, session.user.id)
            if (!permission) {
                return NextResponse.json({ error: 'Parent folder not found.' }, { status: 404 })
            }
            if (!canEditFolder(permission)) {
                return NextResponse.json({ error: 'You need Editor access to create folders here.' }, { status: 403 })
            }
        }

        const folder = await prisma.folder.create({
            data: {
                name,
                parentId,
                userId: session.user.id,
            },
        })

        return NextResponse.json({ folder }, { status: 201 })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unable to create folder.' },
            { status: 500 }
        )
    }
}
