'use client'

import { useEffect } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { ThemeProvider } from '@/components/theme-provider'

type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM'

function ThemePreferenceSync() {
  const { status } = useSession()
  const { setTheme } = useTheme()

  useEffect(() => {
    if (status !== 'authenticated') return

    let active = true
    fetch('/api/user/settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && (data?.themePreference === 'LIGHT' || data?.themePreference === 'DARK' || data?.themePreference === 'SYSTEM')) {
          setTheme(data.themePreference.toLowerCase())
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [setTheme, status])

  useEffect(() => {
    function handlePreferenceChange(event: Event) {
      const nextPreference = (event as CustomEvent<ThemePreference>).detail
      if (nextPreference === 'LIGHT' || nextPreference === 'DARK' || nextPreference === 'SYSTEM') {
        setTheme(nextPreference.toLowerCase())
      }
    }
    window.addEventListener('drivea:theme-preference', handlePreferenceChange)
    return () => window.removeEventListener('drivea:theme-preference', handlePreferenceChange)
  }, [setTheme])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="drivea-theme">
      <SessionProvider>
        <ThemePreferenceSync />
        {children}
      </SessionProvider>
    </ThemeProvider>
  )
}
