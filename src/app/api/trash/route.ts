import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { permanentlyDeleteItems } from '@/lib/trash'

export async function DELETE() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const [files, folders] = await Promise.all([
            prisma.file.findMany({ where: { userId: session.user.id, isTrash: true }, select: { id: true } }),
            prisma.folder.findMany({ where: { userId: session.user.id, isTrash: true }, select: { id: true } }),
        ])

        const result = await permanentlyDeleteItems(
            session.user.id,
            files.map(({ id }) => id),
            folders.map(({ id }) => id)
        )

        return NextResponse.json(result)
    } catch (error) {
        console.error('Unable to empty trash:', error)
        return NextResponse.json({ error: 'Unable to empty Trash.' }, { status: 500 })
    }
}