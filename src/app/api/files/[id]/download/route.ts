import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { BUCKET_NAME, generateDownloadUrl } from '@/lib/s3'

function isPreviewable(mimeType: string) {
    return (
        mimeType === 'application/pdf' ||
        (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mimeType)) ||
        (/^video\/(mp4|webm|ogg|quicktime)$/.test(mimeType)) ||
        (/^audio\/(mpeg|mp4|ogg|wav|webm|aac|flac)$/.test(mimeType))
    )
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!BUCKET_NAME) {
        return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })
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
                    select: { mimeType: true, s3Key: true },
                    take: 1,
                },
            },
        })

        const currentVersion = file?.versions[0]
        if (!file || !currentVersion) {
            return NextResponse.json({ error: 'File not found.' }, { status: 404 })
        }

        const wantsDownload = new URL(request.url).searchParams.get('download') === '1'
        const disposition = wantsDownload || !isPreviewable(currentVersion.mimeType) ? 'attachment' : 'inline'
        const filename = encodeURIComponent(file.name).replace(/[!'()*]/g, (character) =>
            `%${character.charCodeAt(0).toString(16).toUpperCase()}`
        )
        const url = await generateDownloadUrl(currentVersion.s3Key, 300, {
            responseContentDisposition: `${disposition}; filename*=UTF-8''${filename}`,
            responseContentType: currentVersion.mimeType,
        })

        return NextResponse.redirect(url, 307)
    } catch (error) {
        console.error('Unable to create file download URL:', error)
        return NextResponse.json({ error: 'Unable to open this file.' }, { status: 500 })
    }
}
