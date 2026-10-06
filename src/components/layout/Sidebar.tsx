'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plus,
  HardDrive,
  Clock,
  Star,
  Trash2,
  FolderPlus,
  FileUp,
  FolderUp,
  Database,
  UsersRound,
  X,
} from 'lucide-react'
import { StorageMeter } from '@/components/StorageMeter'
import { useEffect, useRef, useState } from 'react'
import { DriveaLogo } from '@/components/auth/DriveaLogo'
import { useMobileNav } from '@/context/MobileNavContext'

const navItems = [
  { name: 'My Drive', href: '/dashboard', icon: HardDrive },
  { name: 'Recent', href: '/dashboard/recent', icon: Clock },
  { name: 'Starred', href: '/dashboard/starred', icon: Star },
  { name: 'Shared with me', href: '/dashboard/shared', icon: UsersRound },
  { name: 'Trash', href: '/dashboard/trash', icon: Trash2 },
  { name: 'Storage', href: '/dashboard/storage', icon: Database },
]

export function Sidebar() {
  const pathname = usePathname()
  const { isMobileMenuOpen, closeMobileMenu } = useMobileNav()
  const [isNewOpen, setIsNewOpen] = useState(false)
  const [storage, setStorage] = useState({
    storageUsed: 0,
    storageLimit: 5368709120,
    isPro: false,
    hasBillingCustomer: false,
  })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const mobileMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetch('/api/storage')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setStorage(data)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setIsNewOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function renderNewButton(refContainer?: React.RefObject<HTMLDivElement | null>, isMobile = false) {
    return (
      <div className="relative px-4 pt-5 pb-2" ref={refContainer}>
        <button
          type="button"
          onClick={() => setIsNewOpen((open) => !open)}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#f15a24] hover:bg-[#d94e1b] active:scale-[0.98] px-4 py-3 text-sm font-semibold text-white shadow-md shadow-[#f15a24]/25 hover:shadow-lg hover:shadow-[#f15a24]/35 transition-all duration-200 cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>New</span>
        </button>

        {isNewOpen && (
          <div className="absolute left-4 right-4 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => {
                setIsNewOpen(false)
                if (isMobile) closeMobileMenu()
                const btn = document.getElementById('trigger-new-folder')
                if (btn) btn.click()
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FolderPlus className="h-4 w-4" />
              </div>
              <span>New Folder</span>
            </button>
            <button
              onClick={() => {
                setIsNewOpen(false)
                if (isMobile) closeMobileMenu()
                const btn = document.getElementById('trigger-upload-files')
                if (btn) btn.click()
              }}
              className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-[#f15a24]/10 text-[#f15a24]">
                <FileUp className="h-4 w-4" />
              </div>
              <span>File Upload</span>
            </button>
            <button
              onClick={() => {
                setIsNewOpen(false)
                if (isMobile) closeMobileMenu()
                const btn = document.getElementById('trigger-upload-folder')
                if (btn) btn.click()
              }}
              className="mt-0.5 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FolderUp className="h-4 w-4" />
              </div>
              <span>Folder Upload</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderNavLinks(onLinkClick?: () => void) {
    return (
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onLinkClick}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[#f15a24]/10 text-[#f15a24] dark:bg-[#f15a24]/15 dark:text-[#ff7847] font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <item.icon
                className={`h-4 w-4 transition-colors ${
                  isActive
                    ? 'text-[#f15a24] dark:text-[#ff7847]'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span>{item.name}</span>
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <>
      {/* ============================================================ */}
      {/* DESKTOP SIDEBAR (Visible on md and larger)                     */}
      {/* ============================================================ */}
      <aside className="hidden w-64 lg:w-72 flex-col border-r border-slate-200/90 dark:border-slate-800/80 bg-white/95 dark:bg-[#0f141c]/95 shadow-sm backdrop-blur-md md:flex select-none z-30 shrink-0">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-slate-800/60">
          <Link href="/dashboard" className="transition-opacity hover:opacity-90">
            <DriveaLogo iconSize={32} textSize="text-xl" />
          </Link>
        </div>

        {/* Primary Action Button (+ New) */}
        {renderNewButton(menuRef, false)}

        {/* Navigation Links */}
        {renderNavLinks()}

        {/* Storage Meter Widget at bottom */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80">
          <StorageMeter
            storageUsed={storage.storageUsed}
            storageLimit={storage.storageLimit}
            isPro={storage.isPro}
            hasBillingCustomer={storage.hasBillingCustomer}
          />
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MOBILE DRAWER & BACKDROP (Visible on screens < md)            */}
      {/* ============================================================ */}
      {/* Backdrop overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      {/* Mobile Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-200/90 dark:border-slate-800/80 bg-white dark:bg-[#0f141c] shadow-2xl transition-transform duration-300 ease-in-out md:hidden select-none ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
        aria-label="Mobile Navigation"
      >
        {/* Brand Header with Close Button */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800/60">
          <Link href="/dashboard" onClick={closeMobileMenu} className="transition-opacity hover:opacity-90">
            <DriveaLogo iconSize={32} textSize="text-xl" />
          </Link>
          <button
            type="button"
            onClick={closeMobileMenu}
            className="rounded-xl p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Primary Action Button (+ New) */}
        {renderNewButton(mobileMenuRef, true)}

        {/* Navigation Links (automatically close drawer on click) */}
        {renderNavLinks(closeMobileMenu)}

        {/* Storage Meter Widget at bottom */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800/80">
          <StorageMeter
            storageUsed={storage.storageUsed}
            storageLimit={storage.storageLimit}
            isPro={storage.isPro}
            hasBillingCustomer={storage.hasBillingCustomer}
          />
        </div>
      </aside>
    </>
  )
}
