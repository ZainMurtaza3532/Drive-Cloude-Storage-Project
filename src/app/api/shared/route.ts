import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderPermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const folderId = new URL(request.url).searchParams.get('folderId')

        if (folderId) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })

            const folder = await prisma.folder.findUnique({
                where: { id: folderId },
                select: {
                    id: true,
                    name: true,
                    parentId: true,
                    user: { select: { name: true, email: true } },
                },
            })
            if (!folder) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })

            const [subfolders, files] = await Promise.all([
                prisma.folder.findMany({
                    where: { parentId: folderId, isTrash: false },
                    select: {
                        id: true,
                        name: true,
                        parentId: true,
                        updatedAt: true,
                        user: { select: { name: true, email: true } },
                    },
                    orderBy: { name: 'asc' },
                }),
                prisma.file.findMany({
                    where: { folderId, isTrash: false },
                    select: {
                        id: true,
                        name: true,
                        folderId: true,
                        updatedAt: true,
                        isStarred: true,
                        isTrash: true,
                        trashedAt: true,
                        user: { select: { name: true } },
                        versions: {
                            where: { isCurrent: true },
                            select: { size: true, mimeType: true },
                            take: 1,
                        },
                    },
                    orderBy: { name: 'asc' },
                }),
            ])

            const folders = await Promise.all(subfolders.map(async (item) => ({
                id: item.id,
                name: item.name,
                parentId: item.parentId,
                updatedAt: item.updatedAt,
                owner: item.user.name || item.user.email || 'Unknown',
                role: await getFolderPermission(item.id, session.user.id),
            })))

            return NextResponse.json({
                folder: {
                    id: folder.id,
                    name: folder.name,
                    parentId: folder.parentId,
                    owner: folder.user.name || folder.user.email || 'Unknown',
                    role: permission,
                },
                folders,
                files: files.map((file) => {
                    const currentVersion = file.versions[0]
                    return {
                        id: file.id,
                        name: file.name,
                        size: Number(currentVersion?.size ?? 0),
                        mimeType: currentVersion?.mimeType ?? 'application/octet-stream',
                        folderId: file.folderId,
                        updatedAt: file.updatedAt,
                        isStarred: file.isStarred,
                        isTrash: file.isTrash,
                        trashedAt: file.trashedAt,
                        owner: file.user.name || 'Unknown',
                    }
                }),
            })
        }

        const sharedFolders = await prisma.folderAccess.findMany({
            where: { userId: session.user.id, folder: { isTrash: false } },
            select: {
                role: true,
                folder: {
                    select: {
                        id: true,
                        name: true,
                        parentId: true,
                        updatedAt: true,
                        user: { select: { name: true, email: true } },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        })

        const grantedFolderIds = new Set(sharedFolders.map(({ folder }) => folder.id))
        const rootShares = (await Promise.all(sharedFolders.map(async (share) => {
            let parentId = share.folder.parentId
            const visited = new Set<string>()

            while (parentId) {
                if (grantedFolderIds.has(parentId)) return null
                if (visited.has(parentId)) return null
                visited.add(parentId)

                const parent = await prisma.folder.findUnique({
                    where: { id: parentId },
                    select: { parentId: true, isTrash: true },
                })
                if (!parent) break
                if (parent.isTrash) return null
                parentId = parent.parentId
            }

            return share
        }))).filter((share): share is (typeof sharedFolders)[number] => share !== null)

        return NextResponse.json({
            folders: rootShares.map(({ role, folder }) => ({
                ...folder,
                owner: folder.user.name || folder.user.email || 'Unknown',
                role,
            })),
        })
    } catch (error) {
        console.error('Unable to load shared folders:', error)
        return NextResponse.json({ error: 'Unable to load shared folders.' }, { status: 500 })
    }
}