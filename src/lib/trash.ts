import prisma from '@/lib/prisma'
import { deleteS3Objects } from '@/lib/s3'

export async function permanentlyDeleteItems(userId: string, fileIds: string[], rootFolderIds: string[]) {
    const folderIds = new Set(rootFolderIds)
    let frontier = [...folderIds]

    while (frontier.length > 0) {
        const children = await prisma.folder.findMany({
            where: { userId, parentId: { in: frontier } },
            select: { id: true },
        })
        frontier = children.map(({ id }) => id).filter((id) => !folderIds.has(id))
        frontier.forEach((id) => folderIds.add(id))
    }

    const folderIdList = [...folderIds]
    const files = await prisma.file.findMany({
        where: {
            userId,
            OR: [
                ...(fileIds.length > 0 ? [{ id: { in: fileIds } }] : []),
                ...(folderIdList.length > 0 ? [{ folderId: { in: folderIdList } }] : []),
            ],
        },
        select: {
            id: true,
            versions: { select: { s3Key: true, size: true } },
        },
    })

    await deleteS3Objects(files.flatMap((file) => file.versions.map(({ s3Key }) => s3Key)))

    return prisma.$transaction(async (transaction) => {
        const currentFiles = files.length > 0
            ? await transaction.file.findMany({
                where: { userId, id: { in: files.map(({ id }) => id) } },
                select: {
                    id: true,
                    versions: { select: { size: true } },
                },
            })
            : []
        const currentFileIds = currentFiles.map(({ id }) => id)
        const shareLinkConditions = [
            ...(currentFileIds.length > 0 ? [{ fileId: { in: currentFileIds } }] : []),
            ...(folderIdList.length > 0 ? [{ folderId: { in: folderIdList } }] : []),
        ]

        if (shareLinkConditions.length > 0) {
            await transaction.shareLink.deleteMany({ where: { OR: shareLinkConditions } })
        }

        if (currentFileIds.length > 0) {
            await transaction.file.deleteMany({ where: { userId, id: { in: currentFileIds } } })
        }

        let deletedFolders = 0
        for (const folderId of folderIdList.reverse()) {
            const result = await transaction.folder.deleteMany({ where: { userId, id: folderId } })
            deletedFolders += result.count
        }

        const storageBytes = currentFiles.reduce(
            (total, file) => total + file.versions.reduce((sum, version) => sum + version.size, BigInt(0)),
            BigInt(0),
        )
        if (storageBytes > BigInt(0)) {
            const userUpdate = await transaction.user.updateMany({
                where: { id: userId, storageUsed: { gte: storageBytes } },
                data: { storageUsed: { decrement: storageBytes } },
            })

            if (userUpdate.count !== 1) {
                throw new Error('Storage usage is inconsistent; file records were not deleted.')
            }
        }

        return { deletedFiles: currentFileIds.length, deletedFolders }
    })
}
