import Link from 'next/link'
import type { Metadata } from 'next'
import { DriveaLogo } from '@/components/auth/DriveaLogo'
import { SITE_URL } from '@/lib/site'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
}

export default function Home() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'DRIVEA',
    applicationCategory: 'FileManagementApplication',
    operatingSystem: 'Any',
    url: SITE_URL.toString(),
    description: 'Store and organize files in cloud storage, then share them with controlled access.',
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#fdfcfb] to-white px-4 py-12 dark:from-[#0b0f17] dark:to-[#111827]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
      />
      <main className="flex flex-col items-center justify-center w-full max-w-3xl text-center">
        <DriveaLogo iconSize={48} textSize="text-3xl" className="mb-8" />
        <h1 className="text-4xl font-bold leading-tight text-[#1e2229] sm:text-6xl dark:text-white">
          Secure, Simple &amp; Fast <br />
          <span className="text-[#f15a24]">Cloud Storage.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-[#64748b] sm:text-xl dark:text-slate-300">
          Store your files securely in our drive, organize into folders, share with permissions and access anywhere.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 mt-10">
          <Link
            href="/login"
            className="px-8 py-3.5 text-base font-medium text-white transition-all bg-[#f15a24] rounded-xl hover:bg-[#d94e1b] shadow-md shadow-[#f15a24]/25 hover:shadow-lg hover:shadow-[#f15a24]/35"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-xl border border-[#e2e8f0] bg-white px-8 py-3.5 text-base font-medium text-[#1e2229] shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
          >
            Create Account
          </Link>
        </div>
      </main>
      <footer className="mt-16 text-sm text-[#94a3b8] dark:text-slate-500">
        &copy; 2026 Zain Murtaza. All rights reserved.
      </footer>
    </div>
  )
}
