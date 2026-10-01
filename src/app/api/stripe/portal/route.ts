import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { getAppUrl, getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)
    const userId = session?.user?.id
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    })
    if (!user?.stripeCustomerId) {
      return NextResponse.json({ error: 'No Stripe billing account is linked to this user.' }, { status: 404 })
    }

    const portal = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${getAppUrl()}/dashboard`,
    })
    return NextResponse.json({ url: portal.url })
  } catch (error) {
    console.error('Unable to create Stripe Billing Portal session:', error)
    const message = error instanceof Error ? error.message : ''
    const status = message.includes('not configured') ? 503 : 500
    return NextResponse.json({ error: status === 503 ? message : 'Unable to open billing management.' }, { status })
  }
}