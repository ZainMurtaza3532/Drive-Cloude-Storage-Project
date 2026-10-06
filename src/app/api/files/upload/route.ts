import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFolderPermission } from '@/lib/folder-access'
import { fileListSelect, toDriveFilePayload } from '@/lib/files'
import prisma from '@/lib/prisma'
import { BUCKET_NAME } from '@/lib/s3'
import s3Client from '@/lib/s3'
import { enforceRateLimit } from '@/lib/security'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        // Rate limiting with safe fallback (bypasses if Redis/Upstash is down or unconfigured)
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited

        if (!BUCKET_NAME) {
            return NextResponse.json({
                error: 'Storage service error',
                details: 'S3 storage bucket is not configured on the server.',
            }, { status: 500 })
        }

        const formData = await request.formData().catch(() => null)
        if (!formData) {
            return NextResponse.json({ error: 'Invalid form data in request body.' }, { status: 400 })
        }

        const file = formData.get('file') as File | null
        if (!file || !(file instanceof Blob)) {
            return NextResponse.json({ error: 'A file is required for upload.' }, { status: 400 })
        }

        const rawFolderId = formData.get('folderId')
        const folderId = typeof rawFolderId === 'string' && rawFolderId.trim() ? rawFolderId.trim() : null

        if (folderId) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) {
                return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
            }
            if (!canEditFolder(permission)) {
                return NextResponse.json({ error: 'You need Editor access to upload here.' }, { status: 403 })
            }
        }

        const size = file.size
        const mimeType = file.type || 'application/octet-stream'
        const name = file.name || 'uploaded-file'

        // Check quota
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { storageUsed: true, storageLimit: true },
        })

        if (!user) {
            return NextResponse.json({ error: 'User account not found.' }, { status: 404 })
        }

        if (user.storageUsed + BigInt(size) > user.storageLimit) {
            return NextResponse.json({ error: 'Storage limit exceeded' }, { status: 400 })
        }

        const fileId = randomUUID()
        const versionId = randomUUID()
        const key = `${session.user.id}/${fileId}/${versionId}`

        const buffer = Buffer.from(await file.arrayBuffer())

        // Explicit try-catch on storage upload
        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
            }))
        } catch (s3Error: unknown) {
            console.error('Storage upload failed:', s3Error)
            const err = s3Error as Error
            return NextResponse.json({
                error: 'Storage service error',
                details: err.message || String(s3Error),
            }, { status: 500 })
        }

        // Database record creation
        const createdFile = await prisma.$transaction(async (tx) => {
            const existingFile = await tx.file.findFirst({
                where: {
                    ...(folderId ? {} : { userId: session.user.id }),
                    name,
                    folderId,
                    isTrash: false,
                },
                select: { id: true, userId: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: 'desc' }, take: 1 } },
            })

            const storageOwnerId = existingFile?.userId ?? session.user.id

            await tx.user.update({
                where: { id: storageOwnerId },
                data: { storageUsed: { increment: BigInt(size) } },
            })

            const parentFile = existingFile
                ? await tx.file.update({
                    where: { id: existingFile.id },
                    data: { updatedAt: new Date() },
                    select: { id: true },
                })
                : await tx.file.create({
                    data: {
                        id: fileId,
                        name,
                        ...(folderId ? { folder: { connect: { id: folderId } } } : {}),
                        user: { connect: { id: session.user.id } },
                    },
                    select: { id: true },
                })

            if (existingFile) {
                await tx.fileVersion.updateMany({
                    where: { fileId: parentFile.id, isCurrent: true },
                    data: { isCurrent: false },
                })
            }

            await tx.fileVersion.create({
                data: {
                    id: versionId,
                    fileId: parentFile.id,
                    versionNumber: (existingFile?.versions[0]?.versionNumber ?? 0) + 1,
                    size: BigInt(size),
                    mimeType,
                    isEncrypted: false,
                    s3Key: key,
                    url: `s3://${BUCKET_NAME}/${key}`,
                    isCurrent: true,
                },
            })

            return tx.file.findUniqueOrThrow({
                where: { id: parentFile.id },
                select: fileListSelect,
            })
        })

        return NextResponse.json({
            file: toDriveFilePayload(createdFile, session.user.name || 'You'),
        }, { status: 201 })
    } catch (error: unknown) {
        console.error('Direct file upload error:', error)
        const err = error as Error
        return NextResponse.json({
            error: 'Storage service error',
            details: err.message || String(error),
        }, { status: 500 })
    }
}
