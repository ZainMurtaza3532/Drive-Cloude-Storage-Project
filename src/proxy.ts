import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'
import { applySecurityHeaders, createContentSecurityPolicy } from '@/lib/security'

export default withAuth(
    () => {
        const contentSecurityPolicy = createContentSecurityPolicy()
        const response = NextResponse.next()
        applySecurityHeaders(response.headers, contentSecurityPolicy)
        return response
    },
    {
        pages: { signIn: '/login' },
        callbacks: {
            authorized: ({ req, token }) => !req.nextUrl.pathname.startsWith('/dashboard') || Boolean(token),
        },
    },
)

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}