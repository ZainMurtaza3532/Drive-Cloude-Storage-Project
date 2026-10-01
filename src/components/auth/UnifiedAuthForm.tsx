'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn, getProviders, type ClientSafeProvider } from 'next-auth/react'
import { Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react'

interface UnifiedAuthFormProps {
  initialMode?: 'signin' | 'signup'
  onModeChange?: (mode: 'signin' | 'signup') => void
}

const oauthErrorMessages: Record<string, string> = {
  AccessDenied: 'Sign-in was denied. Check that your account is authorized.',
  Callback: 'Authentication could not be completed. Check the redirect URI configuration.',
  Configuration: 'Sign-in provider is not configured properly on the server.',
  OAuthAccountNotLinked: 'This email is already registered with another provider. Sign in with your original method.',
  OAuthCallback: 'The provider callback could not finish. Check network connectivity and OAuth settings.',
  OAuthSignin: 'Could not reach the OAuth provider. Check your network connection and OAuth client settings.',
}

export function UnifiedAuthForm({
  initialMode = 'signin',
  onModeChange,
}: UnifiedAuthFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFactorCode, setTwoFactorCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({})
  const [providersLoaded, setProvidersLoaded] = useState(false)

  // Sync mode if initialMode prop changes
  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  // Load configured NextAuth providers
  useEffect(() => {
    let active = true
    getProviders()
      .then((res) => {
        if (active && res) setProviders(res)
      })
      .catch(() => {
        if (active) setProviders({})
      })
      .finally(() => {
        if (active) setProvidersLoaded(true)
      })

    return () => {
      active = false
    }
  }, [])

  // Check URL query error
  useEffect(() => {
    const authError = searchParams.get('error')
    if (authError) {
      setError(oauthErrorMessages[authError] ?? 'Authentication failed. Please try again.')
    }
  }, [searchParams])

  const switchMode = (newMode: 'signin' | 'signup') => {
    setMode(newMode)
    setError(null)
    setSuccess(null)
    setTwoFactorCode('')
    if (onModeChange) {
      onModeChange(newMode)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    // Basic frontend validations
    if (!email || !password) {
      setError('Please provide all required fields.')
      setIsLoading(false)
      return
    }

    if (mode === 'signup') {
      if (password.length < 12) {
        setError('Password must be at least 12 characters long.')
        setIsLoading(false)
        return
      }

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to create account')
        }

        setSuccess('Account created successfully! Signing you in...')

        // Auto sign-in with credentials
        const signInRes = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (signInRes?.error) {
          setError('Account created, but sign in failed. Please sign in manually.')
          switchMode('signin')
        } else {
          router.push('/dashboard')
          router.refresh()
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An error occurred during signup.')
      } finally {
        setIsLoading(false)
      }
    } else {
      // Sign In mode
      try {
        const res = await signIn('credentials', {
          email,
          password,
          twoFactorCode,
          redirect: false,
        })

        if (res?.error) {
          setError('Invalid email, password, or authenticator code.')
        } else {
          router.push('/dashboard')
          router.refresh()
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleOAuthSignIn = (providerId: 'google' | 'github') => {
    setError(null)

    if (!providers[providerId]) {
      setError(`${providerId === 'google' ? 'Google' : 'GitHub'} sign-in is not configured yet on this server.`)
      return
    }

    signIn(providerId, { callbackUrl: '/dashboard' })
  }

  const isSignIn = mode === 'signin'

  return (
    <div className="w-full">
      {/* Heading & Subtitle */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-[#1e2229] sm:text-[32px] dark:text-slate-100">
          {isSignIn ? 'Welcome back' : 'Create an account'}
        </h2>
        <p className="mt-2 text-sm text-[#878e9c] dark:text-slate-400">
          {isSignIn
            ? 'Enter your credentials to access your Drive'
            : 'Enter your details to create your Drive account'}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200/80 bg-red-50 p-3.5 text-sm text-red-700 animate-in fade-in duration-200 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm leading-relaxed">{error}</div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200/80 bg-emerald-50 p-3.5 text-sm text-emerald-800 animate-in fade-in duration-200 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs sm:text-sm leading-relaxed">{success}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Full Name Field (Signup only) */}
        {!isSignIn && (
          <div className="space-y-1.5">
            <label
              htmlFor="auth-name"
              className="block text-xs font-medium text-[#2f3542] sm:text-sm dark:text-slate-200"
            >
              Full Name <span className="text-[#f15a24]">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                <User className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
              </div>
              <input
                id="auth-name"
                name="name"
                type="text"
                required={!isSignIn}
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-[#e2e8f0] bg-white py-3 pl-10 pr-4 text-sm text-[#1e2229] placeholder-[#9ca3af] transition-all duration-150 focus:border-[#f15a24] focus:outline-none focus:ring-4 focus:ring-[#f15a24]/10 sm:pl-11 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {/* Email Address Field */}
        <div className="space-y-1.5">
          <label
            htmlFor="auth-email"
            className="block text-xs font-medium text-[#2f3542] sm:text-sm dark:text-slate-200"
          >
            Email Address <span className="text-[#f15a24]">*</span>
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            </div>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[#e2e8f0] bg-white py-3 pl-10 pr-4 text-sm text-[#1e2229] placeholder-[#9ca3af] transition-all duration-150 focus:border-[#f15a24] focus:outline-none focus:ring-4 focus:ring-[#f15a24]/10 sm:pl-11 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="auth-password"
              className="block text-xs font-medium text-[#2f3542] sm:text-sm dark:text-slate-200"
            >
              Password <span className="text-[#f15a24]">*</span>
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
              <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
            </div>
            <input
              id="auth-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={isSignIn ? undefined : 12}
              maxLength={72}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#e2e8f0] bg-white py-3 pl-10 pr-11 text-sm text-[#1e2229] placeholder-[#9ca3af] transition-all duration-150 focus:border-[#f15a24] focus:outline-none focus:ring-4 focus:ring-[#f15a24]/10 sm:pl-11 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
              ) : (
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              )}
            </button>
          </div>
          {!isSignIn && (
            <p className="mt-1 text-[11px] text-[#878e9c] dark:text-slate-400">
              Must be at least 12 characters long.
            </p>
          )}
        </div>

        {isSignIn && (
          <div className="space-y-1.5">
            <label htmlFor="auth-two-factor-code" className="block text-xs font-medium text-[#2f3542] sm:text-sm dark:text-slate-200">
              Authenticator code <span className="text-[#878e9c]">(if enabled)</span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <input
                id="auth-two-factor-code"
                name="twoFactorCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                placeholder="6-digit code"
                className="w-full rounded-xl border border-[#e2e8f0] bg-white py-3 pl-10 pr-4 text-sm text-[#1e2229] placeholder-[#9ca3af] transition-all duration-150 focus:border-[#f15a24] focus:outline-none focus:ring-4 focus:ring-[#f15a24]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {/* Primary CTA Button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center py-3.5 px-4 bg-[#f15a24] hover:bg-[#d94e1b] active:scale-[0.99] text-white font-medium text-sm sm:text-base rounded-xl shadow-[0_4px_14px_rgba(241,90,36,0.28)] hover:shadow-[0_6px_20px_rgba(241,90,36,0.38)] disabled:opacity-60 transition-all duration-200 cursor-pointer"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{isSignIn ? 'Signing In...' : 'Creating Account...'}</span>
              </span>
            ) : isSignIn ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </div>
      </form>

      {/* Social Logins Divider */}
      {providersLoaded && (providers.google || providers.github) && (
        <div className="mt-7">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e2e8f0] dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 font-normal text-[#94a3b8] dark:bg-[#0b0f17] dark:text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          {/* Social Buttons */}
          <div className={`mt-5 grid gap-2.5 ${providers.google && providers.github ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {/* Google */}
            {providers.google && <button
              type="button"
              onClick={() => handleOAuthSignIn('google')}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-xs font-medium text-[#334155] shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-[#f8fafc] sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              title="Sign in with Google"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span className="hidden xs:inline sm:inline">Google</span>
            </button>}

            {/* GitHub */}
            {providers.github && <button
              type="button"
              onClick={() => handleOAuthSignIn('github')}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 text-xs font-medium text-[#334155] shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-[#f8fafc] sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              title="Sign in with GitHub"
            >
              <svg className="h-4 w-4 shrink-0 fill-current text-[#24292f] dark:text-slate-100" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span className="hidden xs:inline sm:inline">GitHub</span>
            </button>}
          </div>
        </div>
      )}

      {/* Switcher Footer */}
      <div className="mt-8 text-center text-xs text-[#878e9c] sm:text-sm dark:text-slate-400">
        {isSignIn ? (
          <>
            Don&apos;t have an account yet?{' '}
            <Link
              href="/signup"
              onClick={(e) => {
                if (onModeChange) {
                  e.preventDefault()
                  switchMode('signup')
                  window.history.pushState(null, '', '/signup')
                }
              }}
              className="font-semibold text-[#f15a24] hover:text-[#d94e1b] transition-colors hover:underline"
            >
              Create account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link
              href="/login"
              onClick={(e) => {
                if (onModeChange) {
                  e.preventDefault()
                  switchMode('signin')
                  window.history.pushState(null, '', '/login')
                }
              }}
              className="font-semibold text-[#f15a24] hover:text-[#d94e1b] transition-colors hover:underline"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
