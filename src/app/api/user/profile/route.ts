import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedUserId, isSameOriginRequest } from '@/lib/user-api'

export const dynamic = 'force-dynamic'

const privateHeaders = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: privateHeaders })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404, headers: privateHeaders })

  return NextResponse.json({ user }, { headers: privateHeaders })
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 })
  }

  const userId = await getAuthenticatedUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body.name !== 'string' || ('image' in body && typeof body.image !== 'string')) {
    return NextResponse.json({ error: 'Invalid profile data.' }, { status: 400 })
  }
  const name = body.name.trim()
  const imageValue = typeof body.image === 'string' ? body.image.trim() : ''
  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Name must be between 1 and 100 characters.' }, { status: 400 })
  }

  let image: string | null = null
  if (imageValue) {
    if (imageValue.length > 2048) {
      return NextResponse.json({ error: 'Avatar URL must be 2048 characters or fewer.' }, { status: 400 })
    }
    try {
      const parsedImage = new URL(imageValue)
      if (parsedImage.protocol !== 'https:') throw new Error('Unsupported URL protocol.')
      image = parsedImage.toString()
    } catch {
      return NextResponse.json({ error: 'Enter a valid HTTPS avatar URL.' }, { status: 400 })
    }
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name, image },
    select: { id: true, name: true, email: true, image: true, createdAt: true },
  })

  return NextResponse.json({ user }, { headers: privateHeaders })
}