import { AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { BUCKET_NAME } from '@/lib/s3'
import s3Client from '@/lib/s3'
import { enforceRateLimit, multipartSessionSchema, parseJsonBody } from '@/lib/security'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const limited = await enforceRateLimit(session.user.id, 'upload')
        if (limited) return limited
        const parsed = await parseJsonBody(request, multipartSessionSchema)
        if (parsed.response) return parsed.response
        const { fileId, uploadId } = parsed.data
        const upload = await prisma.uploadSession.findFirst({ where: { userId: session.user.id, fileId, s3UploadId: uploadId } })
        if (!upload) return NextResponse.json({ error: 'Upload session not found.' }, { status: 404 })
        await s3Client.send(new AbortMultipartUploadCommand({ Bucket: BUCKET_NAME, Key: upload.s3Key, UploadId: upload.s3UploadId }))
        await prisma.uploadSession.delete({ where: { id: upload.id } })
        return NextResponse.json({ aborted: true })
    } catch (error) {
        console.error('Unable to abort multipart upload:', error)
        return NextResponse.json({ error: 'Unable to cancel multipart upload.' }, { status: 500 })
    }
}