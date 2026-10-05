import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFolderPermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const body = await request.json() as { parentId?: unknown; paths?: unknown }
        const parentId = typeof body.parentId === 'string' ? body.parentId : null
        if (body.parentId !== undefined && body.parentId !== null && typeof body.parentId !== 'string') {
            return NextResponse.json({ error: 'Invalid destination folder.' }, { status: 400 })
        }
        if (body.parentId === '') {
            return NextResponse.json({ error: 'Invalid destination folder.' }, { status: 400 })
        }
        if (!Array.isArray(body.paths) || body.paths.length === 0 ||
            body.paths.some((path) => typeof path !== 'string' || !path)) {
            return NextResponse.json({ error: 'A folder structure is required.' }, { status: 400 })
        }

        if (parentId) {
            const permission = await getFolderPermission(parentId, session.user.id)
            if (!permission) return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
            if (!canEditFolder(permission)) {
                return NextResponse.json({ error: 'You need Editor access to create folders here.' }, { status: 403 })
            }
        }

        const allPaths = new Set<string>()
        for (const path of body.paths as string[]) {
            const segments = path.split('/')
            if (segments.some((segment) => !segment.trim() || segment === '.' || segment === '..')) {
                return NextResponse.json({ error: 'The selected folder contains an invalid path.' }, { status: 400 })
            }
            for (let index = 1; index <= segments.length; index += 1) {
                allPaths.add(segments.slice(0, index).join('/'))
            }
        }

        const orderedPaths = [...allPaths].sort((left, right) => {
            const depthDifference = left.split('/').length - right.split('/').length
            return depthDifference || left.localeCompare(right)
        })
        const folders = await prisma.$transaction(async (transaction) => {
            const folderIds = new Map<string, string>()
            for (const path of orderedPaths) {
                const segments = path.split('/')
                const name = segments.at(-1)!
                const parentPath = segments.slice(0, -1).join('/')
                const folderParentId = parentPath ? folderIds.get(parentPath) : parentId
                if (!folderParentId && parentPath) {
                    throw new Error('A parent folder is missing from the selected folder structure.')
                }
                const folder = await transaction.folder.create({
                    data: {
                        name,
                        parentId: folderParentId,
                        userId: session.user.id,
                    },
                    select: { id: true },
                })
                folderIds.set(path, folder.id)
            }
            return Object.fromEntries(folderIds)
        })

        return NextResponse.json({ folders }, { status: 201 })
    } catch (error) {
        console.error('Unable to create uploaded folder structure:', error)
        return NextResponse.json({ error: 'Unable to create the selected folder structure.' }, { status: 500 })
    }
}
