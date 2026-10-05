import bcrypt from 'bcrypt'
import { decode, encode } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'
import { contentDispositionFilename } from '@/lib/files'
import prisma from '@/lib/prisma'
import { generateDownloadUrl } from '@/lib/s3'

type RouteContext = { params: Promise<{ token: string }> }

const ACCESS_COOKIE = 'vault_access_token'
const ACCESS_TOKEN_TTL = 30 * 60

type SharedFile = {
    id: string
    name: string
    isTrash?: boolean
    versions: Array<{ size: bigint; mimeType: string; s3Key: string }>
}

function sharedFilePayload(file: SharedFile) {
    const version = file.versions[0]
    return {
        id: file.id,
        name: file.name,
        size: Number(version?.size ?? 0),
        mimeType: version?.mimeType || 'application/octet-stream',
        s3Key: version?.s3Key,
    }
}

const sharedFileSelect = {
    id: true,
    name: true,
    isTrash: true,
    versions: {
        where: { isCurrent: true },
        select: { size: true, mimeType: true, s3Key: true },
        take: 1,
    },
} as const

export async function POST(request: NextRequest, { params }: RouteContext) {
    try {
        const { token } = await params
        const body = await request.json().catch(() => ({})) as { password?: unknown; fileId?: unknown; mode?: unknown }
        const share = await prisma.shareLink.findUnique({
            where: { token },
            include: {
                file: { select: sharedFileSelect },
                folder: { select: { id: true, name: true, userId: true, isTrash: true } },
            },
        })

        if (!share || !share.isPublic || (share.expiresAt && share.expiresAt <= new Date())) {
            return NextResponse.json({ error: 'This share link is invalid or has expired.' }, { status: 404 })
        }
        if ((share.file && share.file.isTrash) || (share.folder && share.folder.isTrash) || (!share.file && !share.folder)) {
            return NextResponse.json({ error: 'This shared item is no longer available.' }, { status: 404 })
        }
        let accessToken: string | undefined
        if (share.passwordHash) {
            const rootFileId = share.file?.id ?? share.folder?.id
            const cookieName = `${ACCESS_COOKIE}:${token}`
            const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim()
            if (!secret) {
                console.error('Unable to authorize password-protected share: authentication secret is not configured.')
                return NextResponse.json({ error: 'Unable to authorize this shared item.' }, { status: 500 })
            }

            const existingToken = request.cookies.get(ACCESS_COOKIE)?.value
            let verified = false
            if (existingToken) {
                try {
                    const claims = await decode({ token: existingToken, secret, salt: cookieName })
                    verified = claims?.shareId === share.id &&
                        claims.fileId === rootFileId &&
                        claims.verified === true
                } catch {
                    verified = false
                }
            }

            if (!verified) {
                const password = typeof body.password === 'string' ? body.password : ''
                if (!password || !(await bcrypt.compare(password, share.passwordHash))) {
                    return NextResponse.json({ error: 'Enter the password to open this link.', requiresPassword: true }, { status: 401 })
                }

                accessToken = await encode({
                    token: { fileId: rootFileId, verified: true, shareId: share.id },
                    secret,
                    salt: cookieName,
                    maxAge: ACCESS_TOKEN_TTL,
                })
            }
        }

        if (typeof body.fileId === 'string') {
            const files = share.file
                ? [sharedFilePayload(share.file)]
                : (await getFolderFiles(share.folder!.id, share.folder!.userId)).map(sharedFilePayload)
            const file = files.find((item) => item.id === body.fileId)
            if (!file?.s3Key) return NextResponse.json({ error: 'This file is not part of the shared item.' }, { status: 404 })

            const download = body.mode === 'download'
            const disposition = `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${contentDispositionFilename(file.name)}`
            const url = await generateDownloadUrl(file.s3Key, 300, {
                responseContentDisposition: disposition,
                responseContentType: file.mimeType,
            })
            if (download) {
                await prisma.shareLink.update({
                    where: { id: share.id },
                    data: { downloadCount: { increment: 1 } },
                })
            }
            return createShareResponse({ url }, token, accessToken)
        }

        if (share.file) {
            const file = sharedFilePayload(share.file)
            return createShareResponse({
                type: 'file',
                name: file.name,
                file: { id: file.id, name: file.name, size: file.size, mimeType: file.mimeType },
            }, token, accessToken)
        }

        const folder = share.folder!
        const files = await getFolderFiles(folder.id, folder.userId)
        return createShareResponse({
            type: 'folder',
            name: folder.name,
            files: files.map((file) => {
                const payload = sharedFilePayload(file)
                return { id: payload.id, name: payload.name, size: payload.size, mimeType: payload.mimeType }
            }),
        }, token, accessToken)
    } catch (error) {
        console.error('Unable to access public share:', error)
        return NextResponse.json({ error: 'Unable to open this shared item.' }, { status: 500 })
    }
}

function createShareResponse(data: unknown, shareToken: string, accessToken?: string) {
    const response = NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
    if (accessToken) {
        response.cookies.set(ACCESS_COOKIE, accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: `/api/public/share/${encodeURIComponent(shareToken)}`,
            maxAge: ACCESS_TOKEN_TTL,
        })
    }
    return response
}

async function getFolderFiles(folderId: string, userId: string) {
    const folderIds = [folderId]
    const visited = new Set(folderIds)
    let currentIds = [folderId]

    while (currentIds.length) {
        const children = await prisma.folder.findMany({
            where: { parentId: { in: currentIds }, userId, isTrash: false },
            select: { id: true },
        })
        currentIds = children.map(({ id }) => id).filter((id) => !visited.has(id))
        currentIds.forEach((id) => visited.add(id))
        folderIds.push(...currentIds)
    }

    return prisma.file.findMany({
        where: { folderId: { in: folderIds }, userId, isTrash: false },
        select: sharedFileSelect,
        orderBy: { name: 'asc' },
    })
}
