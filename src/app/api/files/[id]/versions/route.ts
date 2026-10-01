import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!await getFilePermission(id, session.user.id)) {
        return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    }

    const file = await prisma.file.findFirst({ where: { id, isTrash: false }, select: { id: true } })
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

    const versions = await prisma.fileVersion.findMany({
        where: { fileId: id },
        select: { id: true, versionNumber: true, size: true, mimeType: true, createdAt: true, isCurrent: true },
        orderBy: { versionNumber: 'desc' },
    })

    return NextResponse.json({
        versions: versions.map((version) => ({ ...version, size: Number(version.size) })),
    })
}