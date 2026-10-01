import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getFolderPermission, isInVaultFolder } from '@/lib/folder-access'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const folderId = new URL(request.url).searchParams.get('folderId')
    if (folderId) {
        if (!await getFolderPermission(folderId, session.user.id)) return NextResponse.json({ error: 'Folder not found.' }, { status: 404 })
        return NextResponse.json({ isVaultDestination: await isInVaultFolder(folderId) })
    }
    const folder = await prisma.folder.findFirst({
        where: { userId: session.user.id, isVault: true, isTrash: false },
        select: { id: true, name: true, vaultSalt: true, vaultCheck: true },
    })
    return NextResponse.json({ vault: folder })
}

export async function POST(request: Request) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const body = await request.json()
        const salt = typeof body?.salt === 'string' ? body.salt : ''
        const check = typeof body?.check === 'string' ? body.check : ''
        if (!/^[A-Za-z0-9+/]{20,64}={0,2}$/.test(salt) || check.length < 24 || check.length > 512) {
            return NextResponse.json({ error: 'Invalid Vault setup details.' }, { status: 400 })
        }
        const existing = await prisma.folder.findFirst({ where: { userId: session.user.id, isVault: true, isTrash: false }, select: { id: true } })
        if (existing) return NextResponse.json({ error: 'A Vault already exists for this account.' }, { status: 409 })
        const folder = await prisma.folder.create({
            data: { name: 'Vault', userId: session.user.id, isVault: true, vaultSalt: salt, vaultCheck: check },
            select: { id: true, name: true },
        })
        return NextResponse.json({ folder }, { status: 201 })
    } catch (error) {
        console.error('Unable to create Vault:', error)
        return NextResponse.json({ error: 'Unable to create the Vault.' }, { status: 500 })
    }
}