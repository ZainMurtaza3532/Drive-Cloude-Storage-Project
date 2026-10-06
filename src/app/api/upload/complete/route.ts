import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { canEditFolder, getFilePermission, getFolderPermission, isInVaultFolder } from '@/lib/folder-access'
import { fileListSelect, toDriveFilePayload } from '@/lib/files'
import prisma from '@/lib/prisma'
import { BUCKET_NAME } from '@/lib/s3'
import s3Client from '@/lib/s3'
import { enforceRateLimit, parseJsonBody, uploadCompletionSchema } from '@/lib/security'
import { enqueueUploadProcessing } from '@/lib/queue/uploadQueue'

class StorageLimitError extends Error { }
class UploadConflictError extends Error { }

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let key = ''

    try {
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited
        const parsed = await parseJsonBody(request, uploadCompletionSchema)
        if (parsed.response) return parsed.response
        const { fileId, versionId, name, size, encrypted, originalSize, encryptionChunkSize, fileHash } = parsed.data
        const folderId = parsed.data.folderId ?? null
        const mimeType = parsed.data.mimeType || 'application/octet-stream'
        const originalMimeType = parsed.data.originalMimeType ?? null

        if (!BUCKET_NAME) {
            return NextResponse.json({
                error: 'Storage service error',
                details: 'S3 storage bucket is not configured on the server.',
            }, { status: 500 })
        }

        const destinationIsVault = folderId ? await isInVaultFolder(folderId) : false
        if (destinationIsVault !== encrypted || (encrypted && (
            !originalMimeType || originalMimeType.length > 255 || !Number.isSafeInteger(originalSize) || originalSize < 0 ||
            (encryptionChunkSize !== null && (!Number.isSafeInteger(encryptionChunkSize) || encryptionChunkSize < 1))
        ))) {
            return NextResponse.json({ error: 'Encrypted upload metadata does not match the destination.' }, { status: 400 })
        }

        key = `${session.user.id}/${fileId}/${versionId}`

        const existingVersion = await prisma.fileVersion.findUnique({
            where: { id: versionId },
            select: { id: true, s3Key: true, fileId: true, file: { select: { isTrash: true } } },
        })
        if (existingVersion) {
            const permission = await getFilePermission(fileId, session.user.id)
            if (!permission || !canEditFolder(permission) || existingVersion.file.isTrash || existingVersion.s3Key !== key || existingVersion.fileId !== fileId) {
                return NextResponse.json({ error: 'Upload not found.' }, { status: 404 })
            }

            const existingFile = await prisma.file.findUnique({
                where: { id: fileId },
                select: fileListSelect,
            })
            if (!existingFile) {
                return NextResponse.json({ error: 'Upload not found.' }, { status: 404 })
            }

            return NextResponse.json({
                file: toDriveFilePayload(existingFile, session.user.name || 'You'),
            })
        }

        if (folderId) {
            const permission = await getFolderPermission(folderId, session.user.id)
            if (!permission) {
                return NextResponse.json({ error: 'Destination folder not found.' }, { status: 404 })
            }
            if (!canEditFolder(permission)) {
                return NextResponse.json({ error: 'You need Editor access to upload here.' }, { status: 403 })
            }
        }

        let uploadedObject
        try {
            uploadedObject = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
        } catch (s3Error: unknown) {
            console.error('Storage access error during HeadObject:', s3Error)
            const err = s3Error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } }
            if (err.name === 'NotFound' || err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
                return NextResponse.json({
                    error: 'Uploaded object was not found in storage.',
                    details: err.message || 'Object not found in S3 bucket.',
                }, { status: 404 })
            }
            return NextResponse.json({
                error: 'Storage service error',
                details: err.message || String(s3Error),
            }, { status: 500 })
        }

        const cleanMime = (val?: string | null) => val?.split(';')[0].trim().toLowerCase() ?? ''
        const s3Mime = cleanMime(uploadedObject.ContentType)
        const expectedMime = cleanMime(mimeType)
        const isMimeCompatible =
            !s3Mime ||
            !expectedMime ||
            s3Mime === expectedMime ||
            s3Mime === 'application/octet-stream' ||
            expectedMime === 'application/octet-stream'

        if (uploadedObject.ContentLength !== size || !isMimeCompatible) {
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })).catch(() => undefined)
            return NextResponse.json({
                error: 'Uploaded object does not match the requested file.',
                details: `Expected size: ${size}, got ${uploadedObject.ContentLength}. Expected MIME: ${mimeType}, got: ${uploadedObject.ContentType}`,
            }, { status: 400 })
        }

        const file = await prisma.$transaction(async (transaction) => {
            const existingFile = await transaction.file.findFirst({
                where: {
                    ...(folderId ? {} : { userId: session.user.id }),
                    name,
                    folderId,
                    isTrash: false,
                },
                select: {
                    id: true,
                    userId: true,
                    versions: { select: { versionNumber: true }, orderBy: { versionNumber: 'desc' }, take: 1 },
                },
            })

            const storageOwnerId = existingFile?.userId ?? session.user.id
            const user = await transaction.user.findUnique({
                where: { id: storageOwnerId },
                select: { storageLimit: true },
            })

            if (!user) throw new Error('Storage owner not found.')

            const quotaUpdate = await transaction.user.updateMany({
                where: {
                    id: storageOwnerId,
                    storageUsed: { lte: user.storageLimit - BigInt(size) },
                },
                data: { storageUsed: { increment: BigInt(size) } },
            })

            if (quotaUpdate.count !== 1) {
                throw new StorageLimitError('Storage limit exceeded')
            }

            let parentFile: { id: string }
            try {
                parentFile = existingFile
                    ? await transaction.file.update({
                        where: { id: existingFile.id },
                        data: { updatedAt: new Date(), fileHash: fileHash ?? null },
                        select: { id: true },
                    })
                    : await transaction.file.create({
                        data: {
                            id: fileId,
                            name,
                            fileHash: fileHash ?? null,
                            ...(folderId ? { folder: { connect: { id: folderId } } } : {}),
                            user: { connect: { id: session.user.id } },
                        },
                        select: { id: true },
                    })
            } catch (err: unknown) {
                const dbErr = err as { code?: string }
                // Fallback if fileHash column was temporarily missing (P2022)
                if (dbErr.code === 'P2022') {
                    parentFile = existingFile
                        ? await transaction.file.update({
                            where: { id: existingFile.id },
                            data: { updatedAt: new Date() },
                            select: { id: true },
                        })
                        : await transaction.file.create({
                            data: {
                                id: fileId,
                                name,
                                ...(folderId ? { folder: { connect: { id: folderId } } } : {}),
                                user: { connect: { id: session.user.id } },
                            },
                            select: { id: true },
                        })
                } else {
                    throw err
                }
            }

            if (existingFile) {
                await transaction.fileVersion.updateMany({
                    where: { fileId: parentFile.id, isCurrent: true },
                    data: { isCurrent: false },
                })
            }

            await transaction.fileVersion.create({
                data: {
                    id: versionId,
                    fileId: parentFile.id,
                    versionNumber: (existingFile?.versions[0]?.versionNumber ?? 0) + 1,
                    size: BigInt(size),
                    mimeType,
                    isEncrypted: encrypted,
                    originalMimeType,
                    originalSize: encrypted ? BigInt(originalSize) : null,
                    encryptionChunkSize,
                    s3Key: key,
                    url: `s3://${BUCKET_NAME}/${key}`,
                    isCurrent: true,
                },
            })

            const listed = await transaction.file.findUniqueOrThrow({
                where: { id: parentFile.id },
                select: fileListSelect,
            })

            return listed
        })

        await prisma.uploadSession.deleteMany({ where: { userId: session.user.id, fileId, versionId } })
        await enqueueUploadProcessing({
            kind: 'file.uploaded',
            userId: session.user.id,
            fileId,
            versionId,
            s3Key: key,
            mimeType,
            sizeBytes: size,
        }).catch((error) => console.warn('Unable to enqueue background processing job:', error))

        return NextResponse.json({
            file: toDriveFilePayload(file, session.user.name || 'You'),
        }, { status: 201 })
    } catch (error: unknown) {
        console.error('Unable to complete upload:', error)
        const err = error as { message?: string; name?: string; code?: string; stack?: string }

        if (error instanceof StorageLimitError) {
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })).catch(() => undefined)
            return NextResponse.json({ error: error.message, details: err.message }, { status: 400 })
        }

        if (error instanceof UploadConflictError) {
            await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key })).catch(() => undefined)
            return NextResponse.json({ error: error.message, details: err.message }, { status: 409 })
        }

        if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
            return NextResponse.json({ error: 'Uploaded object was not found in storage.', details: err.message }, { status: 404 })
        }

        return NextResponse.json({
            error: 'Storage service error',
            details: err.message || String(error),
        }, { status: 500 })
    }
}
