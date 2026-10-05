import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

type ResourceType = 'file' | 'folder'

function getResource(body: Record<string, unknown>) {
    const type = body.type
    const id = typeof body.id === 'string' ? body.id : ''
    if ((type !== 'file' && type !== 'folder') || !id) return null
    return { type: type as ResourceType, id }
}

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const url = new URL(request.url)
        const type = url.searchParams.get('type')
        const id = url.searchParams.get('id')
        if ((type !== 'file' && type !== 'folder') || !id) {
            return NextResponse.json({ error: 'A valid file or folder is required.' }, { status: 400 })
        }

        const resource = type === 'file'
            ? await prisma.file.findFirst({ where: { id, userId: session.user.id, isTrash: false }, select: { id: true } })
            : await prisma.folder.findFirst({ where: { id, userId: session.user.id, isTrash: false }, select: { id: true } })
        if (!resource) return NextResponse.json({ error: 'File or folder not found.' }, { status: 404 })

        const share = await prisma.shareLink.findFirst({
            where: { ...(type === 'file' ? { fileId: id } : { folderId: id }), isPublic: true },
            select: { token: true, expiresAt: true, passwordHash: true, maxDownloads: true, downloadCount: true, viewCount: true },
        })
        return NextResponse.json({
            enabled: Boolean(share),
            token: share?.token ?? null,
            expiresAt: share?.expiresAt?.toISOString() ?? null,
            passwordProtected: Boolean(share?.passwordHash),
            maxDownloads: share?.maxDownloads ?? null,
            downloadCount: share?.downloadCount ?? 0,
            viewCount: share?.viewCount ?? 0,
        })
    } catch (error) {
        console.error('Unable to load share link:', error)
        return NextResponse.json({ error: 'Unable to load sharing settings.' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json() as Record<string, unknown>
        const resource = getResource(body)
        if (!resource || typeof body.enabled !== 'boolean') {
            return NextResponse.json({ error: 'A valid file or folder and link status are required.' }, { status: 400 })
        }

        const record = resource.type === 'file'
            ? await prisma.file.findFirst({ where: { id: resource.id, userId: session.user.id, isTrash: false }, select: { id: true } })
            : await prisma.folder.findFirst({ where: { id: resource.id, userId: session.user.id, isTrash: false }, select: { id: true } })
        if (!record) return NextResponse.json({ error: 'File or folder not found.' }, { status: 404 })
        if (typeof body.passwordEnabled !== 'boolean') {
            return NextResponse.json({ error: 'Password protection setting is required.' }, { status: 400 })
        }

        const where = resource.type === 'file' ? { fileId: resource.id } : { folderId: resource.id }
        const existing = await prisma.shareLink.findFirst({
            where,
            select: { id: true, passwordHash: true },
        })
        if (!body.enabled) {
            if (existing) await prisma.shareLink.delete({ where: { id: existing.id } })
            return NextResponse.json({ enabled: false })
        }

        if (body.expiresAt !== null && body.expiresAt !== undefined && typeof body.expiresAt !== 'string') {
            return NextResponse.json({ error: 'Expiry must be a valid date or never.' }, { status: 400 })
        }
        const expiresAtValue = typeof body.expiresAt === 'string' && body.expiresAt ? new Date(body.expiresAt) : null
        if (expiresAtValue && (!Number.isFinite(expiresAtValue.getTime()) || expiresAtValue <= new Date())) {
            return NextResponse.json({ error: 'Expiry must be a future date.' }, { status: 400 })
        }
        const maxDownloads = body.maxDownloads === null || body.maxDownloads === undefined
            ? null
            : typeof body.maxDownloads === 'number' ? body.maxDownloads : Number.NaN
        if (maxDownloads !== null && (!Number.isInteger(maxDownloads) || ![1, 5, 10].includes(maxDownloads))) {
            return NextResponse.json({ error: 'Download limit must be 1, 5, 10, or unlimited.' }, { status: 400 })
        }
        const passwordEnabled = body.passwordEnabled === true
        const password = typeof body.password === 'string' ? body.password : ''
        const changingPassword = passwordEnabled && password.length > 0
        if (passwordEnabled && (!existing?.passwordHash || changingPassword) && [...password].length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
        }
        if (Buffer.byteLength(password, 'utf8') > 72) {
            return NextResponse.json({ error: 'Password must be 72 UTF-8 bytes or fewer.' }, { status: 400 })
        }

        const passwordHash = passwordEnabled
            ? (password ? await bcrypt.hash(password, 10) : existing?.passwordHash ?? null)
            : null
        const passwordChanged = passwordEnabled !== Boolean(existing?.passwordHash) || changingPassword
        const data = {
            expiresAt: expiresAtValue,
            passwordHash,
            maxDownloads,
            isPublic: true,
            ...(passwordChanged ? { token: randomUUID() } : {}),
        }
        const share = existing
            ? await prisma.shareLink.update({ where: { id: existing.id }, data, select: { token: true, expiresAt: true, passwordHash: true, maxDownloads: true, downloadCount: true, viewCount: true } })
            : await prisma.shareLink.create({
                data: { ...data, ...(resource.type === 'file' ? { fileId: resource.id } : { folderId: resource.id }) },
                select: { token: true, expiresAt: true, passwordHash: true, maxDownloads: true, downloadCount: true, viewCount: true },
            })

        return NextResponse.json({
            enabled: true,
            token: share.token,
            expiresAt: share.expiresAt?.toISOString() ?? null,
            passwordProtected: Boolean(share.passwordHash),
            maxDownloads: share.maxDownloads,
            downloadCount: share.downloadCount,
            viewCount: share.viewCount,
        })
    } catch (error) {
        console.error('Unable to update share link:', error)
        return NextResponse.json({ error: 'Unable to update this share link.' }, { status: 500 })
    }
}