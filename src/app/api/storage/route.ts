import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { PRO_STORAGE_LIMIT } from '@/lib/stripe'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            storageUsed: true,
            storageLimit: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            _count: { select: { files: true } },
        },
    })

    if (!user) {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    const isPro = Boolean(user.stripeSubscriptionId) || user.storageLimit >= PRO_STORAGE_LIMIT
    return NextResponse.json(
        {
            storageUsed: Number(user.storageUsed),
            storageLimit: Number(isPro ? PRO_STORAGE_LIMIT : user.storageLimit),
            fileCount: user._count.files,
            isPro,
            hasBillingCustomer: Boolean(user.stripeCustomerId),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
}
