import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFolderPermission, isInVaultFolder } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { BUCKET_NAME, generateUploadUrl } from '@/lib/s3'
import { enforceRateLimit, parseJsonBody, uploadDetailsSchema, SINGLE_PUT_MAX_BYTES } from '@/lib/security'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited
        const parsed = await parseJsonBody(request, uploadDetailsSchema)
        if (parsed.response) return parsed.response
        const { name, size, encrypted } = parsed.data
        const mimeType = parsed.data.mimeType || 'application/octet-stream'
        const folderId = parsed.data.folderId ?? null
        if (size > SINGLE_PUT_MAX_BYTES) {
            return NextResponse.json({ error: 'Files larger than 5 GB must use multipart upload.' }, { status: 400 })
        }

        if (!BUCKET_NAME) {
            return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })
        }

        if (folderId) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) {
                return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
            }
            if (!canEditFolder(permission)) {
                return NextResponse.json({ error: 'You need Editor access to upload here.' }, { status: 403 })
            }
            if (await isInVaultFolder(folderId) !== (encrypted === true)) {
                return NextResponse.json({ error: 'Files in the Vault must be encrypted in the browser.' }, { status: 400 })
            }
        } else if (encrypted === true) {
            return NextResponse.json({ error: 'Encrypted uploads require a Vault folder.' }, { status: 400 })
        }

        const existingFile = await prisma.file.findFirst({
            where: {
                ...(folderId ? {} : { userId: session.user.id }),
                name,
                folderId,
                isTrash: false,
            },
            select: { id: true, userId: true },
        })

        const quotaOwner = await prisma.user.findUnique({
            where: { id: existingFile?.userId ?? session.user.id },
            select: { storageUsed: true, storageLimit: true },
        })

        if (!quotaOwner) {
            return NextResponse.json({ error: 'Storage owner not found.' }, { status: 404 })
        }

        if (quotaOwner.storageUsed + BigInt(size) > quotaOwner.storageLimit) {
            return NextResponse.json({ error: 'Storage limit exceeded' }, { status: 400 })
        }

        const fileId = existingFile?.id ?? randomUUID()
        const versionId = randomUUID()
        const key = `${session.user.id}/${fileId}/${versionId}`

        let uploadUrl: string
        try {
            uploadUrl = await generateUploadUrl(key, mimeType)
        } catch (s3Error: unknown) {
            console.error('Storage service error generating upload URL:', s3Error)
            const err = s3Error as Error
            return NextResponse.json({
                error: 'Storage service error',
                details: err.message || String(s3Error),
            }, { status: 500 })
        }

        return NextResponse.json({
            uploadUrl,
            key,
            fileId,
            versionId,
            isNewVersion: Boolean(existingFile),
        })
    } catch (error: unknown) {
        console.error('Unable to create upload URL:', error)
        const err = error as Error
        return NextResponse.json({
            error: 'Storage service error',
            details: err.message || String(error),
        }, { status: 500 })
    }
}
