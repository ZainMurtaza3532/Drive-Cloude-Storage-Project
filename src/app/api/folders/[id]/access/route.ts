import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

type RouteContext = { params: Promise<{ id: string }> }

async function requireFolderOwner(folderId: string, userId: string) {
    return prisma.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
    })
}

export async function GET(_request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!await requireFolderOwner(id, session.user.id)) {
        return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
    }

    const members = await prisma.folderAccess.findMany({
        where: { folderId: id },
        select: {
            id: true,
            role: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ members })
}

export async function POST(request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id } = await params
        if (!await requireFolderOwner(id, session.user.id)) {
            return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const body = await request.json()
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        const role = body?.role === 'EDITOR' ? 'EDITOR' : body?.role === 'VIEWER' ? 'VIEWER' : null
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !role || email.length > 254) {
            return NextResponse.json({ error: 'Enter a valid email and role.' }, { status: 400 })
        }

        const invitedUser = await prisma.user.findUnique({ where: { email } })
        if (!invitedUser) return NextResponse.json({ error: 'No Drivea account exists for that email.' }, { status: 404 })
        if (invitedUser.id === session.user.id) {
            return NextResponse.json({ error: 'You already own this folder.' }, { status: 400 })
        }

        const member = await prisma.folderAccess.upsert({
            where: { folderId_userId: { folderId: id, userId: invitedUser.id } },
            create: { folderId: id, userId: invitedUser.id, role },
            update: { role },
            select: {
                id: true,
                role: true,
                createdAt: true,
                user: { select: { name: true, email: true } },
            },
        })

        return NextResponse.json({ member }, { status: 201 })
    } catch (error) {
        console.error('Unable to invite folder member:', error)
        return NextResponse.json({ error: 'Unable to invite this user.' }, { status: 500 })
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id } = await params
        if (!await requireFolderOwner(id, session.user.id)) {
            return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const body = await request.json()
        const role = body?.role === 'EDITOR' || body?.role === 'VIEWER' ? body.role : null
        const accessId = typeof body?.accessId === 'string' ? body.accessId : ''
        if (!role || !accessId) return NextResponse.json({ error: 'A member and valid role are required.' }, { status: 400 })

        const result = await prisma.folderAccess.updateMany({
            where: { id: accessId, folderId: id },
            data: { role },
        })
        if (!result.count) return NextResponse.json({ error: 'Folder member not found.' }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Unable to update folder member:', error)
        return NextResponse.json({ error: 'Unable to update this member.' }, { status: 500 })
    }
}

export async function DELETE(request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { id } = await params
        if (!await requireFolderOwner(id, session.user.id)) {
            return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        }

        const body = await request.json()
        const accessId = typeof body?.accessId === 'string' ? body.accessId : ''
        if (!accessId) return NextResponse.json({ error: 'A folder member is required.' }, { status: 400 })

        const result = await prisma.folderAccess.deleteMany({ where: { id: accessId, folderId: id } })
        if (!result.count) return NextResponse.json({ error: 'Folder member not found.' }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Unable to remove folder member:', error)
        return NextResponse.json({ error: 'Unable to remove this member.' }, { status: 500 })
    }
}