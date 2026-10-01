import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured.')
  stripeClient ??= new Stripe(secretKey)
  return stripeClient
}

export function getAppUrl() {
  const configuredUrl = process.env.NEXTAUTH_URL?.trim()
  if (!configuredUrl) throw new Error('NEXTAUTH_URL is not configured.')

  const url = new URL(configuredUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('NEXTAUTH_URL must use HTTP or HTTPS.')
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('NEXTAUTH_URL must use HTTPS in production.')
  }

  return url.origin
}

export const FREE_STORAGE_LIMIT = BigInt(5) * BigInt(1024) ** BigInt(3)
export const PRO_STORAGE_LIMIT = BigInt(100) * BigInt(1024) ** BigInt(3)