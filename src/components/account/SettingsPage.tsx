'use client'

import { FormEvent, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Grid2X2,
  KeyRound,
  List,
  LockKeyhole,
  ShieldCheck,
  ShieldOff,
  Sun,
  Monitor,
  Moon,
} from 'lucide-react'

type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM'
type DefaultView = 'GRID' | 'LIST'
type UserSettings = {
  defaultView: DefaultView
  themePreference: ThemePreference
  notifications: boolean
  twoFactorEnabled: boolean
  hasPassword: boolean
}
type Enrollment = { secret: string; otpauthUrl: string }

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'LIGHT', label: 'Light', icon: Sun },
  { value: 'DARK', label: 'Dark', icon: Moon },
  { value: 'SYSTEM', label: 'System', icon: Monitor },
]

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [authenticatorCode, setAuthenticatorCode] = useState('')
  const [isCopying, setIsCopying] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/user/settings', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error ?? 'Unable to load settings.')
        if (active) setSettings(data)
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load settings.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  async function savePreference(patch: Partial<Pick<UserSettings, 'defaultView' | 'themePreference' | 'notifications'>>) {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to save settings.')
      setSettings((current) => current ? { ...current, ...data } : current)
      if (patch.themePreference) {
        window.dispatchEvent(new CustomEvent('drivea:theme-preference', { detail: patch.themePreference }))
      }
      if (patch.defaultView) {
        window.dispatchEvent(new CustomEvent('drivea:view-preference', { detail: patch.defaultView.toLowerCase() }))
      }
      setMessage('Settings saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save settings.')
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to update password.')
      setSettings((current) => current ? { ...current, ...data } : current)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Password updated.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to update password.')
    } finally {
      setSaving(false)
    }
  }

  async function startTwoFactor() {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/user/two-factor', { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to start authenticator setup.')
      setEnrollment(data)
      setAuthenticatorCode('')
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Unable to start authenticator setup.')
    } finally {
      setSaving(false)
    }
  }

  async function verifyTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/user/two-factor', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authenticatorCode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to verify authenticator code.')
      setSettings((current) => current ? { ...current, twoFactorEnabled: true } : current)
      setEnrollment(null)
      setAuthenticatorCode('')
      setMessage('Two-factor sign-in is enabled.')
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'Unable to verify authenticator code.')
    } finally {
      setSaving(false)
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/user/two-factor', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authenticatorCode }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Unable to disable two-factor sign-in.')
      setSettings((current) => current ? { ...current, twoFactorEnabled: false } : current)
      setAuthenticatorCode('')
      setMessage('Two-factor sign-in is disabled.')
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : 'Unable to disable two-factor sign-in.')
    } finally {
      setSaving(false)
    }
  }

  async function copySecret() {
    if (!enrollment) return
    try {
      await navigator.clipboard.writeText(enrollment.secret)
      setIsCopying(true)
      window.setTimeout(() => setIsCopying(false), 1500)
    } catch {
      setError('Clipboard access is unavailable. Select and copy the authenticator key.')
    }
  }

  if (isLoading) return <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Loading settings...</p>
  if (!settings) return <p role="alert" className="break-words text-sm text-rose-700 dark:text-rose-300">{error || 'Unable to load settings.'}</p>

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#f15a24]">Account</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
      </header>

      {error && <p role="alert" className="break-words rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {message && <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{message}</p>}

      <section className="space-y-5 border-b border-slate-200 pb-8 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Appearance</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Choose how Drivea looks on this device.</p>
        </div>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Theme</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Theme preference">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={saving}
                  aria-pressed={settings.themePreference === value}
                  onClick={() => void savePreference({ themePreference: value })}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${settings.themePreference === value ? 'border-[#f15a24] bg-[#f15a24]/5 text-[#d94e1b] dark:text-[#ff7847]' : 'border-slate-300 text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'} disabled:opacity-60`}
                >
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Default file view</p>
            <div className="inline-flex rounded-lg border border-slate-300 p-1 dark:border-slate-700" role="group" aria-label="Default file view">
              {(['GRID', 'LIST'] as const).map((value) => {
                const Icon = value === 'GRID' ? Grid2X2 : List
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={saving}
                    aria-pressed={settings.defaultView === value}
                    onClick={() => void savePreference({ defaultView: value })}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${settings.defaultView === value ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'} disabled:opacity-60`}
                  >
                    <Icon className="h-4 w-4" />{value === 'GRID' ? 'Grid' : 'List'}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-8 dark:border-slate-800">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Notifications</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Email updates about your account and shared files.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={settings.notifications}
            disabled={saving}
            onChange={(event) => void savePreference({ notifications: event.target.checked })}
            className="h-4 w-4 accent-[#f15a24]"
          />
          Email notifications
        </label>
      </section>

      <section className="space-y-5 border-b border-slate-200 pb-8 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-slate-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Password</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use at least 12 characters. Existing passwords are rechecked before changes.</p>
          </div>
        </div>
        <form onSubmit={savePassword} className="grid gap-3 sm:grid-cols-2">
          {settings.hasPassword && (
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Current password</span>
              <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#f15a24] dark:border-slate-700 dark:bg-slate-900" />
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">New password</span>
            <input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#f15a24] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Confirm new password</span>
            <input type="password" autoComplete="new-password" minLength={12} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#f15a24] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <LockKeyhole className="h-4 w-4" />{settings.hasPassword ? 'Update password' : 'Set password'}
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-5">
        <div className="flex items-start gap-3">
          {settings.twoFactorEnabled ? <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" /> : <ShieldOff className="mt-0.5 h-5 w-5 text-slate-500" />}
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Two-factor authentication</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Authenticator codes are required for password sign-in while enabled.</p>
          </div>
        </div>

        {!settings.hasPassword && <p className="text-sm text-amber-700 dark:text-amber-300">Set a password before enabling authenticator-based sign-in.</p>}

        {enrollment ? (
          <form onSubmit={verifyTwoFactor} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-sm text-slate-700 dark:text-slate-300">Add this account to your authenticator app using the setup key or URI, then verify a current six-digit code.</p>
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold tracking-wider text-slate-800 dark:bg-slate-800 dark:text-slate-100">{enrollment.secret}</code>
              <button type="button" onClick={() => void copySecret()} title="Copy authenticator key" aria-label="Copy authenticator key" className="shrink-0 rounded-md p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                {isCopying ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Show authenticator URI</summary>
              <code className="mt-2 block break-all rounded-md bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">{enrollment.otpauthUrl}</code>
            </details>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Authenticator code</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tracking-[0.2em] outline-none focus:border-[#f15a24] dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <button type="submit" disabled={saving} className="rounded-lg bg-[#f15a24] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#d94e1b] disabled:opacity-60">{saving ? 'Verifying...' : 'Verify and enable'}</button>
          </form>
        ) : settings.twoFactorEnabled ? (
          <form onSubmit={disableTwoFactor} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 space-y-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Current authenticator code to disable</span>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" maxLength={8} required value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm tracking-[0.2em] outline-none focus:border-[#f15a24] dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <button type="submit" disabled={saving} className="rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30">{saving ? 'Disabling...' : 'Disable 2FA'}</button>
          </form>
        ) : (
          <button type="button" onClick={() => void startTwoFactor()} disabled={saving || !settings.hasPassword} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            <ShieldCheck className="h-4 w-4" />{saving ? 'Preparing...' : 'Set up authenticator'}
          </button>
        )}
      </section>
    </div>
  )
}