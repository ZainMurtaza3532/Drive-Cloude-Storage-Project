import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { BUCKET_NAME, generateDownloadUrl } from '@/lib/s3'

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await request.json()
        const fileIds = Array.isArray(body?.fileIds) ? [...new Set(body.fileIds.filter((id: unknown) => typeof id === 'string'))] as string[] : []

        if (fileIds.length === 0 || fileIds.length > 20 || !BUCKET_NAME) {
            return NextResponse.json({ error: 'Select between 1 and 20 files to download.' }, { status: 400 })
        }

        const files = await prisma.file.findMany({
            where: { id: { in: fileIds }, isTrash: false },
            select: {
                id: true,
                name: true,
                versions: {
                    where: { isCurrent: true },
                    select: { mimeType: true, s3Key: true },
                    take: 1,
                },
            },
        })

        if (files.length !== fileIds.length) {
            return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
        }

        for (const file of files) {
            if (!await getFilePermission(file.id, session.user.id)) {
                return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
            }
        }

        const downloads = await Promise.all(files.map(async (file) => {
            const currentVersion = file.versions[0]
            if (!currentVersion) throw new Error('A selected file has no current version.')
            const filename = encodeURIComponent(file.name).replace(/[!'()*]/g, (character) =>
                `%${character.charCodeAt(0).toString(16).toUpperCase()}`
            )
            const url = await generateDownloadUrl(currentVersion.s3Key, 300, {
                responseContentDisposition: `attachment; filename*=UTF-8''${filename}`,
                responseContentType: currentVersion.mimeType,
            })
            return { id: file.id, name: file.name, url }
        }))

        return NextResponse.json({ downloads })
    } catch (error) {
        console.error('Unable to prepare bulk downloads:', error)
        return NextResponse.json({ error: 'Unable to prepare selected downloads.' }, { status: 500 })
    }
}
