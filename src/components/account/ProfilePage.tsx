'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Check, ImagePlus, Save, UserRound } from 'lucide-react'

type Profile = {
  name: string
  email: string | null
  image: string | null
  createdAt: string
}

export function ProfilePage() {
  const router = useRouter()
  const { update } = useSession()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/user/profile', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Unable to load your profile.')
        if (!active) return
        setProfile(data.user)
        setName(data.user.name ?? '')
        setImage(data.user.image ?? '')
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load your profile.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setSaved(false)

    try {
      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, image }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to save your profile.')

      setProfile(data.user)
      setName(data.user.name ?? '')
      setImage(data.user.image ?? '')
      await update()
      router.refresh()
      setSaved(true)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your profile.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#f15a24]">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Profile</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your account identity and public avatar.</p>
      </header>

      {isLoading ? (
        <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Loading profile...</p>
      ) : !profile ? (
        <p role="alert" className="break-words rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error || 'Unable to load your profile.'}</p>
      ) : (
        <form onSubmit={saveProfile} className="space-y-7">
          <section className="grid gap-6 border-b border-slate-200 pb-7 dark:border-slate-800 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div className="flex flex-col items-start gap-3">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                {image ? (
                  <img src={image} alt="Profile avatar preview" className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-9 w-9" />
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                <ImagePlus className="h-3.5 w-3.5" /> Avatar preview
              </span>
            </div>

            <div className="space-y-5">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Display name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  required
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#f15a24] focus:ring-2 focus:ring-[#f15a24]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Avatar URL</span>
                <input
                  type="url"
                  inputMode="url"
                  value={image}
                  onChange={(event) => setImage(event.target.value)}
                  maxLength={2048}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#f15a24] focus:ring-2 focus:ring-[#f15a24]/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </label>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email address</p>
              <p className="mt-1 break-all text-sm font-medium text-slate-800 dark:text-slate-200">{profile.email ?? 'No email on file'}</p>
              <p className="mt-1 text-xs text-slate-500">Email changes are managed through your sign-in provider.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Member since</p>
              <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(profile.createdAt))}
              </p>
            </div>
          </section>

          {error && <p role="alert" className="break-words rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
          {saved && <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />Profile saved.</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#f15a24] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d94e1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f15a24] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
            >
              <Save className="h-4 w-4" />{isSaving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}