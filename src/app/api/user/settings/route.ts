import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId, isSameOriginRequest } from '@/lib/user-api'

export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: privateHeaders })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultView: true,
      themePreference: true,
      notifications: true,
      twoFactorEnabled: true,
      passwordHash: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404, headers: privateHeaders })

  const { passwordHash, ...settings } = user
  return NextResponse.json({ ...settings, hasPassword: Boolean(passwordHash) }, { headers: privateHeaders })
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })

  const update: Prisma.UserUpdateInput = {}
  if ('defaultView' in body) {
    if (body.defaultView !== 'GRID' && body.defaultView !== 'LIST') {
      return NextResponse.json({ error: 'Choose a valid default view.' }, { status: 400 })
    }
    update.defaultView = body.defaultView
  }
  if ('themePreference' in body) {
    if (body.themePreference !== 'LIGHT' && body.themePreference !== 'DARK' && body.themePreference !== 'SYSTEM') {
      return NextResponse.json({ error: 'Choose a valid theme preference.' }, { status: 400 })
    }
    update.themePreference = body.themePreference
  }
  if ('notifications' in body) {
    if (typeof body.notifications !== 'boolean') {
      return NextResponse.json({ error: 'Notification preference must be a boolean.' }, { status: 400 })
    }
    update.notifications = body.notifications
  }

  if ('newPassword' in body) {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''
    if (newPassword.length < 12 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return NextResponse.json({ error: 'Password must be at least 12 characters and no more than 72 bytes.' }, { status: 400 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    })
    if (!currentUser) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    if (currentUser.passwordHash && !(await bcrypt.compare(currentPassword, currentUser.passwordHash))) {
      return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 })
    }

    update.passwordHash = await bcrypt.hash(newPassword, 12)
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No supported settings were provided.' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: {
      defaultView: true,
      themePreference: true,
      notifications: true,
      twoFactorEnabled: true,
      passwordHash: true,
    },
  })

  return NextResponse.json({
    defaultView: user.defaultView,
    themePreference: user.themePreference,
    notifications: user.notifications,
    twoFactorEnabled: user.twoFactorEnabled,
    hasPassword: Boolean(user.passwordHash),
  }, { headers: privateHeaders })
}