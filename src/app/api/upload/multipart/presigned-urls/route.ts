import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { generateMultipartPartUrl, listMultipartParts } from '@/lib/s3'
import { enforceRateLimit, multipartPartRequestSchema, parseJsonBody } from '@/lib/security'
import { MULTIPART_CHUNK_SIZE } from '@/lib/upload-constraints'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited
        const parsed = await parseJsonBody(request, multipartPartRequestSchema)
        if (parsed.response) return parsed.response
        const { fileId, uploadId, partNumbers } = parsed.data

        const upload = await prisma.uploadSession.findFirst({ where: { userId: session.user.id, fileId, s3UploadId: uploadId } })
        if (!upload) return NextResponse.json({ error: 'Upload session not found.' }, { status: 404 })
        const maxPart = Math.ceil(Number(upload.size) / MULTIPART_CHUNK_SIZE)
        if (partNumbers.some((partNumber: number) => partNumber > maxPart)) {
            return NextResponse.json({ error: 'Part number exceeds the file size.' }, { status: 400 })
        }

        const completedParts = await listMultipartParts(upload.s3Key, upload.s3UploadId)
        const completedByNumber = new Map(completedParts.map((part) => [part.PartNumber, part.ETag]))
        const urls = await Promise.all(partNumbers
            .filter((partNumber) => !completedByNumber.has(partNumber))
            .map(async (partNumber) => ({
                partNumber,
                url: await generateMultipartPartUrl(upload.s3Key, upload.s3UploadId, partNumber),
            })))
        return NextResponse.json({ urls, completedParts: completedParts.map((part) => ({ partNumber: part.PartNumber, etag: part.ETag })) })
    } catch (error) {
        console.error('Unable to prepare multipart part URLs:', error)
        return NextResponse.json({ error: 'Unable to prepare upload parts.' }, { status: 500 })
    }
}