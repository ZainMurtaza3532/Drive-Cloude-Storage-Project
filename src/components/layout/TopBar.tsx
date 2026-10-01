'use client'

import {
  Search,
  LayoutGrid,
  List,
  Menu,
  LogOut,
  Settings,
  User,
  ChevronDown,
  X,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'

export function TopBar() {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchValue, setSearchValue] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [searchType, setSearchType] = useState('')
  const [dateRange, setDateRange] = useState('')
  const [minSizeMb, setMinSizeMb] = useState('')
  const [maxSizeMb, setMaxSizeMb] = useState('')
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)
  const { data: session } = useSession()

  function getSearchHref() {
    const params = new URLSearchParams()
    const query = searchValue.trim()
    if (query) params.set('q', query)
    if (searchType) params.set('type', searchType)
    if (dateRange) params.set('dateRange', dateRange)
    if (minSizeMb) params.set('minSize', String(Math.round(Number(minSizeMb) * 1024 * 1024)))
    if (maxSizeMb) params.set('maxSize', String(Math.round(Number(maxSizeMb) * 1024 * 1024)))
    const queryString = params.toString()
    return `/dashboard/search${queryString ? `?${queryString}` : ''}`
  }

  function submitSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    router.push(getSearchHref())
    setIsSearchOpen(false)
  }

  useEffect(() => {
    let active = true
    fetch('/api/user/settings', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && (data?.defaultView === 'GRID' || data?.defaultView === 'LIST')) {
          setViewMode(data.defaultView.toLowerCase())
        }
      })
      .catch(() => undefined)

    function handleViewPreference(event: Event) {
      const preference = (event as CustomEvent<string>).detail
      if (preference === 'grid' || preference === 'list') setViewMode(preference)
    }

    window.addEventListener('drivea:view-preference', handleViewPreference)
    return () => {
      active = false
      window.removeEventListener('drivea:view-preference', handleViewPreference)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function selectViewMode(nextView: 'grid' | 'list') {
    setViewMode(nextView)
    window.dispatchEvent(new CustomEvent('drivea:view-preference', { detail: nextView }))
    await fetch('/api/user/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultView: nextView.toUpperCase() }),
    }).catch(() => undefined)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="flex h-18 items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-[#0f141c]/80 px-4 lg:px-8 backdrop-blur-md sticky top-0 z-20">
      {/* Left: Mobile Menu & Search */}
      <div className="flex flex-1 items-center gap-3">
        <button
          type="button"
          className="rounded-xl p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
          aria-label="Toggle Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative w-full max-w-xl group" ref={searchRef}>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="h-4 w-4 text-slate-400 group-focus-within:text-[#f15a24] transition-colors" />
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onFocus={() => setIsSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitSearch()
              if (event.key === 'Escape') setIsSearchOpen(false)
            }}
            className="block w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/60 py-2.5 pl-10 pr-9 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#f15a24] focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-[#f15a24]/10 transition-all duration-150"
            placeholder="Search files and folders..."
            aria-label="Search files and folders"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => setSearchValue('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {!searchValue && (
            <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-200/50 dark:bg-slate-700/60 rounded border border-slate-200 dark:border-slate-600">
              ⌘K
            </kbd>
          )}

          {isSearchOpen && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Search Drive</span>
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen((open) => !open)}
                  aria-expanded={isAdvancedOpen}
                  className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-[#f15a24] hover:bg-[#f15a24]/10"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Advanced search
                </button>
              </div>

              {isAdvancedOpen ? (
                <form onSubmit={submitSearch} className="space-y-4 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      File type
                      <select value={searchType} onChange={(event) => setSearchType(event.target.value)} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                        <option value="">Any type</option>
                        <option value="image">Images</option>
                        <option value="video">Videos</option>
                        <option value="document">Documents and spreadsheets</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Modified
                      <select value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                        <option value="">Any time</option>
                        <option value="today">Today</option>
                        <option value="last7days">Last 7 days</option>
                      </select>
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Minimum size (MB)
                      <input type="number" min="0" step="0.1" value={minSizeMb} onChange={(event) => setMinSizeMb(event.target.value)} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="space-y-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Maximum size (MB)
                      <input type="number" min="0" step="0.1" value={maxSizeMb} onChange={(event) => setMaxSizeMb(event.target.value)} className="block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                    <button type="button" onClick={() => { setSearchType(''); setDateRange(''); setMinSizeMb(''); setMaxSizeMb('') }} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">Clear filters</button>
                    <button type="submit" className="inline-flex items-center gap-2 rounded-md bg-[#f15a24] px-3 py-2 text-sm font-semibold text-white hover:bg-[#d94e1b]">
                      <Search className="h-4 w-4" /> Search
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => submitSearch()} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60">
                  <Search className="h-4 w-4 text-slate-400" />
                  Search {searchValue.trim() ? `for “${searchValue.trim()}”` : 'all files'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: View Toggle & Profile */}
      <div className="ml-4 flex items-center gap-3">
        {/* Grid/List Segmented Toggle */}
        <div className="hidden items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 sm:flex border border-slate-200/50 dark:border-slate-700/50">
          <button
            type="button"
            onClick={() => void selectViewMode('grid')}
            className={`rounded-lg p-1.5 transition-all cursor-pointer ${viewMode === 'grid'
                ? 'bg-white dark:bg-slate-700 text-[#f15a24] dark:text-[#ff7847] shadow-xs font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void selectViewMode('list')}
            className={`rounded-lg p-1.5 transition-all cursor-pointer ${viewMode === 'list'
                ? 'bg-white dark:bg-slate-700 text-[#f15a24] dark:text-[#ff7847] shadow-xs font-medium'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setIsProfileOpen((open) => !open)}
            className="flex items-center gap-2.5 rounded-full border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 py-1.5 pr-2.5 transition-all hover:border-[#f15a24]/30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer shadow-2xs"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-[#f15a24] to-[#f97316] text-xs font-bold text-white shadow-xs">
              {session?.user?.image ? (
                <img src={session.user.image} alt="" className="h-full w-full object-cover" />
              ) : (
                session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'
              )}
            </span>
            <span className="hidden text-xs font-semibold text-slate-700 sm:block dark:text-slate-200 max-w-[120px] truncate">
              {session?.user?.name || 'User'}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
              <div className="border-b border-slate-100 dark:border-slate-700/80 px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {session?.user?.name || 'User'}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {session?.user?.email || 'user@example.com'}
                </p>
              </div>

              <div className="p-1.5 space-y-0.5">
                <Link
                  href="/dashboard/profile"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                >
                  <User className="h-4 w-4 text-slate-400" />
                  Profile
                </Link>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
                >
                  <Settings className="h-4 w-4 text-slate-400" />
                  Settings
                </Link>
              </div>

              <div className="p-1.5 border-t border-slate-100 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="flex w-full items-center gap-3 px-3 py-2 rounded-xl text-left text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
