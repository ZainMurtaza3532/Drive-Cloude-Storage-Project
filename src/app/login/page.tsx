import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/auth/AuthLayout'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In | DRIVEA - Cloud Storage',
  description: 'Sign in to access your DRIVEA cloud storage files and folders.',
}

export default async function LoginPage() {
  const session = await getServerSession(authOptions)

  // If the user is already signed in, redirect them to the dashboard
  if (session) {
    redirect('/dashboard')
  }

  return <AuthLayout initialMode="signin" />
}
