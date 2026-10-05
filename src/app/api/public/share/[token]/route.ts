import bcrypt from 'bcrypt'
import { decode, encode } from 'next-auth/jwt'
import { Prisma } from '@prisma/client'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest, NextResponse } from 'next/server'
import { contentDispositionFilename } from '@/lib/files'
import prisma from '@/lib/prisma'
import s3Client, { BUCKET_NAME } from '@/lib/s3'

type RouteContext = { params: Promise<{ token: string }> }

const ACCESS_COOKIE = 'vault_access_token'
const ACCESS_TOKEN_TTL = 30 * 60

type SharedFile = {
    id: string
    name: string
    isTrash?: boolean
    versions: Array<{ size: bigint; mimeType: string; s3Key: string }>
}

function isSchemaMismatch(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
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

async function readOptionalShareField<T>(
    query: Promise<{ value: T } | null>,
    field: string,
    fallback: T,
) {
    try {
        return { value: (await query)?.value ?? fallback, available: true }
    } catch (error) {
        if (!isSchemaMismatch(error)) throw error
        console.warn(`Share-link field "${field}" is unavailable in the database.`)
        return { value: fallback, available: false }
    }
}

async function findShare(token: string) {
    try {
        const share = await prisma.shareLink.findUnique({
            where: { token },
            select: {
                id: true,
                token: true,
                isPublic: true,
                passwordHash: true,
                expiresAt: true,
                maxDownloads: true,
                downloadCount: true,
                viewCount: true,
                file: { select: sharedFileSelect },
                folder: { select: { id: true, name: true, userId: true, isTrash: true } },
            },
        })
        return share
            ? {
                ...share,
                advancedSettingsAvailable: true,
                expiresAtAvailable: true,
                maxDownloadsAvailable: true,
                downloadCountAvailable: true,
                viewCountAvailable: true,
            }
            : null
    } catch (error) {
        if (!isSchemaMismatch(error)) throw error
        console.warn('Advanced share columns are unavailable; opening this as a basic public link.')
        const share = await prisma.shareLink.findUnique({
            where: { token },
            select: {
                id: true,
                token: true,
                isPublic: true,
                file: { select: sharedFileSelect },
                folder: { select: { id: true, name: true, userId: true, isTrash: true } },
            },
        })
        if (!share) return null
        const [password, expiry, limit, downloads, views] = await Promise.all([
            readOptionalShareField(
                prisma.shareLink.findUnique({ where: { token }, select: { passwordHash: true } })
                    .then((row) => row ? { value: row.passwordHash } : null),
                'passwordHash',
                null,
            ),
            readOptionalShareField(
                prisma.shareLink.findUnique({ where: { token }, select: { expiresAt: true } })
                    .then((row) => row ? { value: row.expiresAt } : null),
                'expiresAt',
                null,
            ),
            readOptionalShareField(
                prisma.shareLink.findUnique({ where: { token }, select: { maxDownloads: true } })
                    .then((row) => row ? { value: row.maxDownloads } : null),
                'maxDownloads',
                null,
            ),
            readOptionalShareField(
                prisma.shareLink.findUnique({ where: { token }, select: { downloadCount: true } })
                    .then((row) => row ? { value: row.downloadCount } : null),
                'downloadCount',
                0,
            ),
            readOptionalShareField(
                prisma.shareLink.findUnique({ where: { token }, select: { viewCount: true } })
                    .then((row) => row ? { value: row.viewCount } : null),
                'viewCount',
                0,
            ),
        ])
        return {
            ...share,
            passwordHash: password.value,
            expiresAt: expiry.value,
            maxDownloads: limit.value,
            downloadCount: downloads.value,
            viewCount: views.value,
            advancedSettingsAvailable: [
                password.available,
                expiry.available,
                limit.available,
                downloads.available,
                views.available,
            ].every(Boolean),
            expiresAtAvailable: expiry.available,
            maxDownloadsAvailable: limit.available,
            downloadCountAvailable: downloads.available,
            viewCountAvailable: views.available,
        }
    }
}

async function hasValidAccessToken(request: NextRequest, share: NonNullable<Awaited<ReturnType<typeof findShare>>>, token: string) {
    if (!share.passwordHash) return true
    const secret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim()
    if (!secret) throw new Error('Authentication secret is not configured.')
    const accessToken = request.cookies.get(ACCESS_COOKIE)?.value
    if (!accessToken) return false
    try {
        const claims = await decode({ token: accessToken, secret, salt: `${ACCESS_COOKIE}:${token}` })
        return claims?.shareId === share.id &&
            claims.fileId === (share.file?.id ?? share.folder?.id) &&
            claims.verified === true
    } catch {
        return false
    }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
    try {
        const { token } = await params
        const url = new URL(request.url)
        const fileId = url.searchParams.get('fileId')
        const mode = url.searchParams.get('mode') ?? 'view'
        if (!fileId || !['view', 'download'].includes(mode)) {
            return NextResponse.json({ error: 'A valid shared file and access mode are required.' }, { status: 400 })
        }

        const share = await findShare(token)
        if (!share || !share.isPublic || (share.expiresAtAvailable && share.expiresAt && share.expiresAt <= new Date())) {
            return NextResponse.json({ error: 'This share link is invalid or has expired.' }, { status: 404 })
        }
        if ((share.file && share.file.isTrash) || (share.folder && share.folder.isTrash) || (!share.file && !share.folder)) {
            return NextResponse.json({ error: 'This shared item is no longer available.' }, { status: 404 })
        }
        if (!await hasValidAccessToken(request, share, token)) {
            return NextResponse.json({ error: 'Enter the password to open this link.', requiresPassword: true }, { status: 401 })
        }

        const files = share.file
            ? [sharedFilePayload(share.file)]
            : (await getFolderFiles(share.folder!.id, share.folder!.userId)).map(sharedFilePayload)
        const file = files.find((item) => item.id === fileId)
        if (!file?.s3Key) return NextResponse.json({ error: 'This file is not part of the shared item.' }, { status: 404 })
        if (!BUCKET_NAME) return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })
        if (mode === 'download' && share.maxDownloadsAvailable && share.maxDownloads !== null && !share.downloadCountAvailable) {
            return NextResponse.json({ error: 'Download limits are temporarily unavailable. Apply the latest database migration and retry.' }, { status: 503 })
        }

        if (mode === 'download' && share.downloadCountAvailable) {
            const now = new Date()
            const downloadConditions: Prisma.ShareLinkWhereInput[] = []
            if (share.expiresAtAvailable) {
                downloadConditions.push({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] })
            }
            if (share.maxDownloadsAvailable && share.maxDownloads !== null) {
                downloadConditions.push({ downloadCount: { lt: share.maxDownloads } })
            }
            const reserved = await prisma.shareLink.updateMany({
                where: {
                    id: share.id,
                    isPublic: true,
                    ...(share.maxDownloadsAvailable ? { maxDownloads: share.maxDownloads } : {}),
                    ...(downloadConditions.length ? { AND: downloadConditions } : {}),
                },
                data: { downloadCount: { increment: 1 } },
            })
            if (reserved.count !== 1) {
                return NextResponse.json({ error: 'This share link has reached its download limit or has expired.' }, { status: 410 })
            }
        }

        const disposition = `${mode === 'download' ? 'attachment' : 'inline'}; filename*=UTF-8''${contentDispositionFilename(file.name)}`
        const result = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.s3Key,
            Range: request.headers.get('range') ?? undefined,
            ResponseContentDisposition: disposition,
            ResponseContentType: file.mimeType,
        }))
        if (!result.Body) {
            return NextResponse.json({ error: 'Storage returned an empty file stream.' }, { status: 502 })
        }

        const headers = new Headers({
            'Content-Type': result.ContentType ?? file.mimeType,
            'Cache-Control': 'private, no-store, max-age=0',
            'Accept-Ranges': 'bytes',
            'Content-Disposition': disposition,
        })
        if (result.ContentLength !== undefined) headers.set('Content-Length', String(result.ContentLength))
        if (result.ContentRange) headers.set('Content-Range', result.ContentRange)
        if (result.ETag) headers.set('ETag', result.ETag)
        return new NextResponse(result.Body.transformToWebStream(), {
            status: result.ContentRange ? 206 : 200,
            headers,
        })
    } catch (error) {
        console.error('Unable to stream a public shared file:', error)
        return NextResponse.json({ error: 'Unable to stream this shared file.' }, { status: 500 })
    }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
    try {
        const { token } = await params
        const body = await request.json().catch(() => ({})) as { password?: unknown; fileId?: unknown; mode?: unknown }
        const share = await findShare(token)

        if (!share || !share.isPublic || (share.expiresAtAvailable && share.expiresAt && share.expiresAt <= new Date())) {
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
            const url = `/api/public/share/${encodeURIComponent(token)}?${new URLSearchParams({ fileId: file.id, mode: download ? 'download' : 'view' })}`
            return createShareResponse({ url }, token, accessToken)
        }

        if (share.viewCountAvailable) {
            await prisma.shareLink.update({
                where: { id: share.id },
                data: { viewCount: { increment: 1 } },
            })
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
