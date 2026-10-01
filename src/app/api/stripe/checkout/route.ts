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

    const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
    if (!secretKey) {
      console.error('Stripe Checkout configuration error: STRIPE_SECRET_KEY is missing.')
      return NextResponse.json({ error: 'Stripe configuration is incomplete: STRIPE_SECRET_KEY is missing.' }, { status: 503 })
    }

    const priceId = process.env.STRIPE_PRICE_ID_100GB?.trim()
    if (!priceId || !priceId.startsWith('price_')) {
      console.error('Stripe Checkout configuration error: STRIPE_PRICE_ID_100GB is missing or invalid.')
      return NextResponse.json({ error: 'Stripe configuration is incomplete: set STRIPE_PRICE_ID_100GB to a valid Price ID.' }, { status: 503 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, stripeCustomerId: true, stripeSubscriptionId: true },
    })
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    if (user.stripeSubscriptionId) {
      return NextResponse.json({ error: 'A Pro subscription is already attached to this account.' }, { status: 409 })
    }

    const stripe = getStripe()
    const appUrl = getAppUrl()
    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        ...(user.email ? { email: user.email } : {}),
        ...(user.name ? { name: user.name } : {}),
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/dashboard?billing=success&success=true`,
      cancel_url: `${appUrl}/dashboard?billing=cancelled`,
    })

    if (!checkout.url) {
      return NextResponse.json({ error: 'Stripe did not return a checkout URL.' }, { status: 502 })
    }
    return NextResponse.json({ url: checkout.url })
  } catch (error) {
    console.error('Unable to create Stripe Checkout session:', error)
    const message = error instanceof Error ? error.message : ''
    const status = message.includes('not configured') ? 503 : 500
    return NextResponse.json({ error: status === 503 ? message : 'Unable to start checkout.' }, { status })
  }
}