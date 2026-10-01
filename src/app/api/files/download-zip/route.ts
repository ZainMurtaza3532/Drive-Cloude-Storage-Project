import * as archiver from 'archiver'
import { Readable, PassThrough } from 'node:stream'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFilePermission, getFolderPermission } from '@/lib/folder-access'
import prisma from '@/lib/prisma'
import { BUCKET_NAME } from '@/lib/s3'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import s3Client from '@/lib/s3'

export const runtime = 'nodejs'

type ZipEntry = { name: string; s3Key: string; encrypted: boolean }

function safeEntryName(name: string) {
    return name.replace(/[\\/\u0000-\u001f]/g, '_').trim() || 'file'
}

async function collectFolder(folderId: string, path: string, userId: string, entries: ZipEntry[], visited: Set<string>) {
    if (visited.has(folderId)) return
    visited.add(folderId)
    const folder = await prisma.folder.findFirst({
        where: { id: folderId, isTrash: false },
        select: { id: true, name: true, files: { where: { isTrash: false }, select: { name: true, versions: { where: { isCurrent: true }, select: { s3Key: true, isEncrypted: true }, take: 1 } } }, children: { where: { isTrash: false }, select: { id: true, name: true } } },
    })
    if (!folder) return
    const folderPath = `${path}${safeEntryName(folder.name)}/`
    for (const file of folder.files) {
        const current = file.versions[0]
        if (current) entries.push({ name: `${folderPath}${safeEntryName(file.name)}`, s3Key: current.s3Key, encrypted: current.isEncrypted })
        if (entries.length > 500) throw new Error('ZIP selection exceeds 500 files.')
    }
    for (const child of folder.children) {
        await collectFolder(child.id, folderPath, userId, entries, visited)
    }
    void userId
}

export async function GET(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!BUCKET_NAME) return NextResponse.json({ error: 'S3 storage is not configured.' }, { status: 500 })

    const params = new URL(request.url).searchParams
    const fileIds = [...new Set((params.get('fileIds') ?? '').split(',').filter(Boolean))]
    const folderIds = [...new Set((params.get('folderIds') ?? '').split(',').filter(Boolean))]
    if (!fileIds.length && !folderIds.length || fileIds.length > 100 || folderIds.length > 20) {
        return NextResponse.json({ error: 'Select up to 100 files and 20 folders to archive.' }, { status: 400 })
    }

    try {
        const entries: ZipEntry[] = []
        const files = await prisma.file.findMany({
            where: { id: { in: fileIds }, isTrash: false },
            select: { id: true, name: true, versions: { where: { isCurrent: true }, select: { s3Key: true, isEncrypted: true }, take: 1 } },
        })
        if (files.length !== fileIds.length) return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
        for (const file of files) {
            if (!await getFilePermission(file.id, session.user.id)) return NextResponse.json({ error: 'Some selected files are unavailable.' }, { status: 404 })
            if (file.versions[0]) entries.push({ name: safeEntryName(file.name), s3Key: file.versions[0].s3Key, encrypted: file.versions[0].isEncrypted })
        }

        const visitedFolders = new Set<string>()
        for (const folderId of folderIds) {
            if (!await getFolderPermission(folderId, session.user.id)) return NextResponse.json({ error: 'Some selected folders are unavailable.' }, { status: 404 })
            await collectFolder(folderId, '', session.user.id, entries, visitedFolders)
        }
        if (entries.some((entry) => entry.encrypted)) {
            return NextResponse.json({ error: 'Vault files must be decrypted in the browser before downloading.' }, { status: 409 })
        }
        if (!entries.length) return NextResponse.json({ error: 'The selected items contain no downloadable files.' }, { status: 404 })
        if (entries.length > 500) return NextResponse.json({ error: 'ZIP selection exceeds 500 files.' }, { status: 413 })

        const output = new PassThrough()
        const archive = new archiver.ZipArchive({ zlib: { level: 1 } })
        archive.on('error', (error) => output.destroy(error))
        archive.pipe(output)
        for (const entry of entries) {
            const source = Readable.from((async function* () {
                const result = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: entry.s3Key }))
                if (!result.Body) throw new Error(`Missing storage object for ${entry.name}.`)
                for await (const chunk of result.Body as AsyncIterable<Uint8Array>) yield chunk
            })())
            archive.append(source, { name: entry.name })
        }
        void archive.finalize().catch((error: unknown) => output.destroy(error instanceof Error ? error : new Error('Unable to create archive.')))

        return new Response(Readable.toWeb(output) as ReadableStream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': 'attachment; filename="drivea-download.zip"',
                'Cache-Control': 'private, no-store',
            },
        })
    } catch (error) {
        console.error('Unable to stream ZIP download:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create ZIP download.' }, { status: 500 })
    }
}