import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFolderPermission, isInVaultFolder } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import s3Client, { BUCKET_NAME, initiateMultipartUpload } from '@/lib/s3'
import { enforceRateLimit, parseJsonBody, uploadDetailsSchema } from '@/lib/security'
import { MULTIPART_MAX_BYTES, MULTIPART_MIN_BYTES } from '@/lib/upload-constraints'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited
        const parsed = await parseJsonBody(request, uploadDetailsSchema)
        if (parsed.response) return parsed.response
        const { name, size, encrypted } = parsed.data
        const mimeType = parsed.data.mimeType || 'application/octet-stream'
        const folderId = parsed.data.folderId ?? null
        if (size < MULTIPART_MIN_BYTES || size > MULTIPART_MAX_BYTES) {
            return NextResponse.json({ error: 'Invalid multipart upload details.' }, { status: 400 })
        }
        if (!BUCKET_NAME) return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })

        if (folderId) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
            if (!canEditFolder(permission)) return NextResponse.json({ error: 'You need Editor access to upload here.' }, { status: 403 })
            if (await isInVaultFolder(folderId) !== (encrypted === true)) {
                return NextResponse.json({ error: 'Files in the Vault must be encrypted in the browser.' }, { status: 400 })
            }
        } else if (encrypted === true) {
            return NextResponse.json({ error: 'Encrypted uploads require a Vault folder.' }, { status: 400 })
        }

        const existingFile = await prisma.file.findFirst({
            where: { ...(folderId ? {} : { userId: session.user.id }), name, folderId, isTrash: false },
            select: { id: true, userId: true },
        })
        const quotaOwner = await prisma.user.findUnique({
            where: { id: existingFile?.userId ?? session.user.id },
            select: { storageUsed: true, storageLimit: true },
        })
        if (!quotaOwner) return NextResponse.json({ error: 'Storage owner not found.' }, { status: 404 })
        if (quotaOwner.storageUsed + BigInt(size) > quotaOwner.storageLimit) {
            return NextResponse.json({ error: 'Storage limit exceeded' }, { status: 400 })
        }

        const fileId = existingFile?.id ?? randomUUID()
        const versionId = randomUUID()
        const s3Key = `${session.user.id}/${fileId}/${versionId}`
        const s3UploadId = await initiateMultipartUpload(s3Key, mimeType)
        let uploadSession
        try {
            uploadSession = await prisma.uploadSession.create({
                data: { userId: session.user.id, fileId, versionId, folderId, s3Key, s3UploadId, name, size: BigInt(size), mimeType },
                select: { id: true },
            })
        } catch (error) {
            await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: s3Key, UploadId: s3UploadId })).catch(() => undefined)
            throw error
        }
        return NextResponse.json({ sessionId: uploadSession.id, uploadId: s3UploadId, fileId, versionId }, { status: 201 })
    } catch (error) {
        console.error('Unable to initiate multipart upload:', error)
        return NextResponse.json({ error: 'Unable to prepare this multipart upload.' }, { status: 500 })
    }
}