import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { completeMultipartUpload } from '@/lib/s3'
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

        await completeMultipartUpload(upload.s3Key, upload.s3UploadId, Number(upload.size), upload.mimeType)
        return NextResponse.json({ completed: true })
    } catch (error) {
        console.error('Unable to complete multipart upload:', error)
        return NextResponse.json({ error: 'Unable to assemble uploaded parts.' }, { status: 500 })
    }
}