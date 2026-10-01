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
    if (!await getFilePermission(id, session.user.id)) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

    const file = await prisma.file.findUnique({ where: { id }, select: { userId: true, folderId: true } })
    if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 404 })
    const comments = await prisma.comment.findMany({
        where: { fileId: id, parentId: null },
        include: {
            user: { select: { id: true, name: true, email: true } },
            replies: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
    })
    const participantIds = new Set([file.userId, ...comments.flatMap((comment) => [comment.userId, ...comment.replies.map((reply) => reply.userId)])])
    let folderId = file.folderId
    while (folderId) {
        const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { parentId: true, access: { select: { userId: true } } } })
        if (!folder) break
        folder.access.forEach((access) => participantIds.add(access.userId))
        folderId = folder.parentId
    }
    const members = await prisma.user.findMany({ where: { id: { in: [...participantIds] } }, select: { id: true, name: true, email: true } })
    return NextResponse.json({ comments, members })
}

export async function POST(request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: fileId } = await params
    if (!await getFilePermission(fileId, session.user.id)) return NextResponse.json({ error: 'File not found.' }, { status: 404 })

    try {
        const body = await request.json()
        const content = typeof body?.content === 'string' ? body.content.trim() : ''
        const parentId = typeof body?.parentId === 'string' ? body.parentId : null
        const positionX = body?.positionX ?? null
        const positionY = body?.positionY ?? null
        const pageNumber = body?.pageNumber ?? null
        if (!content || content.length > 4000) return NextResponse.json({ error: 'Comments must contain 1 to 4000 characters.' }, { status: 400 })
        if ((positionX === null) !== (positionY === null) ||
            (positionX !== null && (!Number.isFinite(positionX) || positionX < 0 || positionX > 1 || !Number.isFinite(positionY) || positionY < 0 || positionY > 1)) ||
            (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1))) {
            return NextResponse.json({ error: 'Invalid annotation position.' }, { status: 400 })
        }
        if (parentId) {
            const parent = await prisma.comment.findFirst({ where: { id: parentId, fileId, parentId: null }, select: { id: true } })
            if (!parent) return NextResponse.json({ error: 'Comment thread not found.' }, { status: 404 })
        }

        const comment = await prisma.comment.create({
            data: { fileId, userId: session.user.id, content, parentId, positionX, positionY, pageNumber },
            include: { user: { select: { id: true, name: true, email: true } } },
        })
        return NextResponse.json({ comment }, { status: 201 })
    } catch (error) {
        console.error('Unable to create file comment:', error)
        return NextResponse.json({ error: 'Unable to save this comment.' }, { status: 500 })
    }
}