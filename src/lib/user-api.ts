import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function getAuthenticatedUserId() {
  const session = await getServerSession(authOptions)
  return session?.user?.id ?? null
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site'

  try {
    const expectedOrigin = process.env.NEXTAUTH_URL
      ? new URL(process.env.NEXTAUTH_URL).origin
      : new URL(request.url).origin
    return origin === expectedOrigin
  } catch {
    return false
  }
}