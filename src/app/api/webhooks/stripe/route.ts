import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { FREE_STORAGE_LIMIT, PRO_STORAGE_LIMIT, getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

function getStripeId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id ?? null
}

async function activateSubscription(
  subscription: Stripe.Subscription,
  customerId: string,
  userId?: string | null,
  customerEmail?: string | null,
) {
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return

  let user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    : null
  user ??= await prisma.user.findFirst({
    where: {
      OR: [
        { stripeCustomerId: customerId },
        ...(customerEmail ? [{ email: { equals: customerEmail, mode: 'insensitive' as const } }] : []),
      ],
    },
    select: { id: true },
  })

  if (!user) {
    const customer = await getStripe().customers.retrieve(customerId)
    if (!('deleted' in customer)) {
      const customerUserId = customer.metadata.userId
      user = customerUserId
        ? await prisma.user.findUnique({ where: { id: customerUserId }, select: { id: true } })
        : null
      user ??= customer.email
        ? await prisma.user.findFirst({
          where: { email: { equals: customer.email, mode: 'insensitive' } },
          select: { id: true },
        })
        : null
    }
  }

  if (!user) {
    console.error('Unable to match active Stripe subscription to a user:', { customerId, userId })
    return
  }

  const periodEnd = Math.max(0, ...subscription.items.data.map((item) => item.current_period_end))
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id ?? null,
      stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      storageLimit: PRO_STORAGE_LIMIT,
    },
  })
}

async function removeSubscription(subscription: Stripe.Subscription) {
  await prisma.user.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      stripeSubscriptionId: null,
      stripePriceId: null,
      stripeCurrentPeriodEnd: null,
      storageLimit: FREE_STORAGE_LIMIT,
    },
  })
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }, { status: 503 })
  }
  if (!signature) {
    return NextResponse.json({ error: 'Stripe webhook signature configuration is missing.' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    const rawBody = await request.text()
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid Stripe webhook signature.' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const checkout = event.data.object as Stripe.Checkout.Session
      if (checkout.mode === 'subscription' && (checkout.payment_status === 'paid' || checkout.payment_status === 'no_payment_required')) {
        const subscriptionId = getStripeId(checkout.subscription)
        const customerId = getStripeId(checkout.customer)
        if (subscriptionId && customerId) {
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
          await activateSubscription(
            subscription,
            customerId,
            checkout.metadata?.userId ?? checkout.client_reference_id,
            checkout.customer_details?.email ?? checkout.customer_email ?? checkout.metadata?.userEmail,
          )
        }
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionValue = invoice.parent?.subscription_details?.subscription
      const subscriptionId = getStripeId(subscriptionValue)
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
        const customerId = getStripeId(subscription.customer)
        if (customerId) {
          await activateSubscription(
            subscription,
            customerId,
            subscription.metadata.userId ?? invoice.parent?.subscription_details?.metadata?.userId,
          )
        }
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = getStripeId(subscription.customer)
      if (customerId) {
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          await activateSubscription(
            subscription,
            customerId,
            subscription.metadata.userId,
            subscription.metadata.userEmail,
          )
        } else if (subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'incomplete_expired') {
          await removeSubscription(subscription)
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      await removeSubscription(event.data.object as Stripe.Subscription)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Unable to process Stripe webhook:', error)
    return NextResponse.json({ error: 'Unable to process Stripe webhook event.' }, { status: 500 })
  }
}