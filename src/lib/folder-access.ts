import prisma from '@/lib/prisma'

export type FolderPermission = 'OWNER' | 'EDITOR' | 'VIEWER'

export async function getFolderPermission(folderId: string, userId: string): Promise<FolderPermission | null> {
    let currentFolderId: string | null = folderId
    const visited = new Set<string>()

    while (currentFolderId) {
        if (visited.has(currentFolderId)) return null
        visited.add(currentFolderId)

        const folder = await prisma.folder.findUnique({
            where: { id: currentFolderId },
            select: { id: true, parentId: true, userId: true, isTrash: true },
        })

        if (!folder || folder.isTrash) return null
        if (folder.userId === userId) return 'OWNER'

        const access = await prisma.folderAccess.findUnique({
            where: { folderId_userId: { folderId: folder.id, userId } },
            select: { role: true },
        })

        if (access) return access.role
        currentFolderId = folder.parentId
    }

    return null
}

export async function getFilePermission(fileId: string, userId: string): Promise<FolderPermission | null> {
    const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: { userId: true, folderId: true, isTrash: true },
    })

    if (!file) return null
    if (file.isTrash) return file.userId === userId ? 'OWNER' : null

    if (file.folderId) return getFolderPermission(file.folderId, userId)
    return file.userId === userId ? 'OWNER' : null
}

export async function isInVaultFolder(folderId: string): Promise<boolean> {
    let currentFolderId: string | null = folderId
    const visited = new Set<string>()
    while (currentFolderId) {
        if (visited.has(currentFolderId)) return false
        visited.add(currentFolderId)
        const folder = await prisma.folder.findUnique({ where: { id: currentFolderId }, select: { parentId: true, isVault: true } })
        if (!folder) return false
        if (folder.isVault) return true
        currentFolderId = folder.parentId
    }
    return false
}

export function canEditFolder(permission: FolderPermission | null): boolean {
    return permission === 'OWNER' || permission === 'EDITOR'
}