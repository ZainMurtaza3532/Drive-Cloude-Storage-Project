'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

const getCurrentUserId = async () => {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        throw new Error('You must be signed in to manage folders.')
    }

    return session.user.id as string
}

const normalizeFolderName = (name: string) => {
    const value = name.trim().replace(/\s+/g, ' ')
    if (!value) {
        throw new Error('Folder name cannot be empty.')
    }
    return value
}

export async function createFolder(name: string, parentId?: string | null) {
    const userId = await getCurrentUserId()
    const safeName = normalizeFolderName(name)

    const parent = parentId
        ? await prisma.folder.findFirst({
            where: {
                id: parentId,
                userId,
                isTrash: false,
            },
        })
        : null

    if (parentId && !parent) {
        throw new Error('Parent folder not found.')
    }

    return prisma.folder.create({
        data: {
            name: safeName,
            parentId: parentId || null,
            userId,
        },
    })
}

export async function getFolders(parentId?: string | null) {
    const userId = await getCurrentUserId()

    return prisma.folder.findMany({
        where: {
            userId,
            parentId: parentId ?? null,
            isTrash: false,
        },
        orderBy: { updatedAt: 'desc' },
    })
}

export async function renameFolder(id: string, newName: string) {
    const userId = await getCurrentUserId()
    const safeName = normalizeFolderName(newName)

    const folder = await prisma.folder.findFirst({
        where: {
            id,
            userId,
        },
    })

    if (!folder) {
        throw new Error('Folder not found.')
    }

    return prisma.folder.update({
        where: { id },
        data: {
            name: safeName,
            updatedAt: new Date(),
        },
    })
}

export async function deleteFolder(id: string) {
    const userId = await getCurrentUserId()

    const folder = await prisma.folder.findFirst({
        where: {
            id,
            userId,
        },
    })

    if (!folder) {
        throw new Error('Folder not found.')
    }

    return prisma.folder.update({
        where: { id },
        data: {
            isTrash: true,
            parentId: null,
            updatedAt: new Date(),
        },
    })
}

export async function moveFolder(id: string, newParentId?: string | null) {
    const userId = await getCurrentUserId()

    const target = await prisma.folder.findFirst({
        where: {
            id,
            userId,
        },
    })

    if (!target) {
        throw new Error('Folder not found.')
    }

    if (newParentId) {
        const parent = await prisma.folder.findFirst({
            where: {
                id: newParentId,
                userId,
                isTrash: false,
            },
        })

        if (!parent) {
            throw new Error('Destination folder not found.')
        }

        if (newParentId === id) {
            throw new Error('A folder cannot be moved into itself.')
        }
    }

    return prisma.folder.update({
        where: { id },
        data: {
            parentId: newParentId || null,
            updatedAt: new Date(),
        },
    })
}
