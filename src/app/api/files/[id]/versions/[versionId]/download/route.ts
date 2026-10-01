import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission } from '@/lib/folder-access'
import { contentDispositionFilename } from '@/lib/files'
import prisma from '@/lib/prisma'
import { BUCKET_NAME, generateDownloadUrl } from '@/lib/s3'

type RouteContext = { params: Promise<{ id: string; versionId: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!BUCKET_NAME) return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })

    try {
        const { id, versionId } = await params
        if (!await getFilePermission(id, session.user.id)) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }

        const version = await prisma.fileVersion.findFirst({
            where: { id: versionId, fileId: id, file: { isTrash: false } },
            select: { s3Key: true, mimeType: true, file: { select: { name: true } } },
        })
        if (!version) return NextResponse.json({ error: 'File version not found.' }, { status: 404 })

        const filename = contentDispositionFilename(version.file.name)
        const url = await generateDownloadUrl(version.s3Key, 300, {
            responseContentDisposition: `attachment; filename*=UTF-8''${filename}`,
            responseContentType: version.mimeType,
        })
        return NextResponse.redirect(url, 307)
    } catch (error) {
        console.error('Unable to download file version:', error)
        return NextResponse.json({ error: 'Unable to download this version.' }, { status: 500 })
    }
}