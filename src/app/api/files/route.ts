import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderPermission } from '@/lib/folder-access'
import { fileListSelect, toDriveFilePayload } from '@/lib/files'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const folderId = searchParams.get('folderId')
        const view = searchParams.get('view')

        if (folderId && !view) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const files = await prisma.file.findMany({
            where: {
                ...(folderId && !view ? { folderId } : { userId: session.user.id }),
                isTrash: view === 'trash',
                ...(view === 'starred' ? { isStarred: true } : {}),
                ...(view === 'recent' || view === 'starred' || view === 'trash' ? {} : { folderId: folderId || null }),
            },
            select: fileListSelect,
            orderBy: { updatedAt: 'desc' },
        })

        return NextResponse.json({
            files: files.map((file) => toDriveFilePayload(file)),
        })
    } catch (error) {
        console.error('Failed to load files:', error)
        return NextResponse.json({ error: 'Unable to load files. Check the database connection and schema.' }, { status: 500 })
    }
}
