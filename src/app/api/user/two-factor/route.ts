import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createTotpEnrollment, verifyTotpCode } from '@/lib/totp'
import { getAuthenticatedUserId, isSameOriginRequest } from '@/lib/user-api'

export const dynamic = 'force-dynamic'

function configurationError(error: unknown) {
  if (error instanceof Error && error.message.includes('TWO_FACTOR_ENCRYPTION_KEY')) {
    return NextResponse.json({ error: 'Two-factor setup is not configured on this server.' }, { status: 503 })
  }
  console.error('Two-factor operation failed.')
  return NextResponse.json({ error: 'Unable to complete the two-factor operation.' }, { status: 500 })
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, twoFactorEnabled: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  if (!user.passwordHash) {
    return NextResponse.json({ error: 'Set a password before enabling authenticator-based two-factor sign-in.' }, { status: 409 })
  }
  if (user.twoFactorEnabled) return NextResponse.json({ error: 'Two-factor authentication is already enabled.' }, { status: 409 })

  try {
    const enrollment = createTotpEnrollment(user.email ?? '')
    await prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: enrollment.encryptedSecret } })
    return NextResponse.json({ secret: enrollment.secret, otpauthUrl: enrollment.otpauthUrl })
  } catch (error) {
    return configurationError(error)
  }
}

export async function PUT(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : ''
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  })
  if (!user?.twoFactorSecret) return NextResponse.json({ error: 'Start authenticator setup before verifying a code.' }, { status: 409 })
  if (user.twoFactorEnabled) return NextResponse.json({ error: 'Two-factor authentication is already enabled.' }, { status: 409 })

  try {
    if (!verifyTotpCode(user.twoFactorSecret, code)) {
      return NextResponse.json({ error: 'The authenticator code is invalid or expired.' }, { status: 400 })
    }
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } })
    return NextResponse.json({ twoFactorEnabled: true })
  } catch (error) {
    return configurationError(error)
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = await request.json().catch(() => null) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : ''
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  })
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return NextResponse.json({ error: 'Two-factor authentication is not enabled.' }, { status: 409 })
  }

  try {
    if (!verifyTotpCode(user.twoFactorSecret, code)) {
      return NextResponse.json({ error: 'The authenticator code is invalid or expired.' }, { status: 400 })
    }
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } })
    return NextResponse.json({ twoFactorEnabled: false })
  } catch (error) {
    return configurationError(error)
  }
}