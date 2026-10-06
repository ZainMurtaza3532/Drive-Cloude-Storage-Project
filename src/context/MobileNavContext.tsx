'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

interface MobileNavContextValue {
  isMobileMenuOpen: boolean
  setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>
  closeMobileMenu: () => void
  toggleMobileMenu: () => void
}

const MobileNavContext = createContext<MobileNavContextValue | null>(null)

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // Automatically close mobile menu when navigating to a new route
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false)
      }
    }
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown)
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), [])
  const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen((prev) => !prev), [])

  return (
    <MobileNavContext.Provider
      value={{
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        closeMobileMenu,
        toggleMobileMenu,
      }}
    >
      {children}
    </MobileNavContext.Provider>
  )
}

export function useMobileNav() {
  const context = useContext(MobileNavContext)
  if (!context) {
    throw new Error('useMobileNav must be used within a MobileNavProvider.')
  }
  return context
}
