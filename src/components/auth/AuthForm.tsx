'use client'

import { useEffect, useState } from 'react'
import { getProviders, signIn, type ClientSafeProvider } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'

const oauthErrorMessages: Record<string, string> = {
  AccessDenied: 'Sign-in was denied. Check that your Google account is allowed by the OAuth consent screen.',
  Callback: 'Google sign-in could not be completed. Check the configured redirect URI and server logs.',
  Configuration: 'Google sign-in is not configured correctly on the server.',
  OAuthAccountNotLinked: 'This email is already registered. Sign in with your original method; accounts are not linked automatically.',
  OAuthCallback: 'Google rejected the sign-in callback. Check the OAuth client and redirect URI.',
  OAuthSignin: 'Could not start Google sign-in. Verify the OAuth client configuration.',
}

export function AuthForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider>>({})
  const [providersLoaded, setProvidersLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getProviders()
      .then((configuredProviders) => {
        if (active) setProviders(configuredProviders ?? {})
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

  useEffect(() => {
    const authError = searchParams.get('error')
    if (authError) setError(oauthErrorMessages[authError] ?? 'Sign-in failed. Check your provider settings and try again.')
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'signup') {
        // Register new user
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || 'Failed to create account')
        }

        setSuccess('Account created! Signing you in...')

        // Auto sign-in after successful registration
        const signInRes = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (signInRes?.error) {
          setError('Invalid email or password.')
        } else {
          router.push('/dashboard')
          router.refresh()
        }
      } else {
        // Sign in existing user
        const res = await signIn('credentials', {
          email,
          password,
          redirect: false,
        })

        if (res?.error) {
          setError('Invalid email or password.')
        } else {
          router.push('/dashboard')
          router.refresh()
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthSignIn = (provider: 'google' | 'github') => {
    setError(null)
    signIn(provider, { callbackUrl: '/dashboard' })
  }

  return (
    <div className="mt-6">
      {/* Mode toggle tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          type="button"
          onClick={() => {
            setMode('signin')
            setError(null)
            setSuccess(null)
          }}
          className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${mode === 'signin'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signup')
            setError(null)
            setSuccess(null)
          }}
          className={`flex-1 py-3 text-center text-sm font-medium border-b-2 transition-colors ${mode === 'signup'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
        >
          Create Account
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
          <p className="font-medium">Authentication Error</p>
          <p className="text-xs mt-1">{error}</p>
        </div>
      )}

      {/* Success alert */}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-sm text-green-700 dark:text-green-300">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Full Name
            </label>
            <div className="mt-1">
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Email address
          </label>
          <div className="mt-1">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <div className="mt-1">
            <input
              type="password"
              required
              minLength={12}
              maxLength={72}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900 dark:text-white"
            />
          </div>
          {mode === 'signup' && (
            <p className="text-xs text-gray-500 mt-1">Use at least 12 characters (maximum 72 bytes).</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            {isLoading
              ? mode === 'signup'
                ? 'Creating account...'
                : 'Signing in...'
              : mode === 'signup'
                ? 'Create Account'
                : 'Sign in'}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500">
              Or continue with
            </span>
          </div>
        </div>

        {providersLoaded && (providers.google || providers.github) && (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {providers.google && (
              <button
                type="button"
                onClick={() => handleOAuthSignIn('google')}
                className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z" />
                </svg>
                Google
              </button>
            )}

            {providers.github && (
              <button
                type="button"
                onClick={() => handleOAuthSignIn('github')}
                className="w-full inline-flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </button>
            )}
          </div>
        )}

        {providersLoaded && !providers.google && (
          <p className="mt-4 text-center text-xs text-gray-500">Google sign-in is not configured on this server.</p>
        )}
      </div>
    </div>
  )
}
