import { GetObjectCommand } from '@aws-sdk/client-s3'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission } from '@/lib/folder-access'
import { contentDispositionFilename } from '@/lib/files'
import prisma from '@/lib/prisma'
import s3Client, { BUCKET_NAME } from '@/lib/s3'

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const { id } = await params
        const permission = await getFilePermission(id, session.user.id)
        if (!permission) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }

        const file = await prisma.file.findFirst({
            where: { id, isTrash: false },
            select: {
                name: true,
                versions: {
                    where: { isCurrent: true },
                    select: { mimeType: true, isEncrypted: true, s3Key: true },
                    take: 1,
                },
            },
        })
        const version = file?.versions[0]
        if (!file || !version) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }
        if (version.isEncrypted || version.mimeType !== 'application/pdf') {
            return NextResponse.json({ error: 'Only unencrypted PDF files can use this preview route.' }, { status: 415 })
        }
        if (!BUCKET_NAME) {
            return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })
        }

        const object = await s3Client.send(new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: version.s3Key,
            Range: request.headers.get('range') ?? undefined,
        }))
        if (!object.Body) {
            return NextResponse.json({ error: 'Storage returned an empty PDF stream.' }, { status: 502 })
        }

        const headers = new Headers({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename*=UTF-8''${contentDispositionFilename(file.name)}`,
            'Cache-Control': 'private, no-store, max-age=0',
            'Accept-Ranges': 'bytes',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Content-Security-Policy': "frame-ancestors 'self'",
        })
        if (object.ContentLength !== undefined) headers.set('Content-Length', String(object.ContentLength))
        if (object.ContentRange) headers.set('Content-Range', object.ContentRange)
        if (object.ETag) headers.set('ETag', object.ETag)

        return new NextResponse(object.Body.transformToWebStream(), {
            status: object.ContentRange ? 206 : 200,
            headers,
        })
    } catch (error) {
        console.error('Unable to stream PDF preview:', error)
        return NextResponse.json({ error: 'Unable to preview this PDF.' }, { status: 500 })
    }
}
