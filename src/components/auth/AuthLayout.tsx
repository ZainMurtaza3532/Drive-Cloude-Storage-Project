'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { DriveaLogo } from './DriveaLogo'
import { UnifiedAuthForm } from './UnifiedAuthForm'

interface AuthLayoutProps {
  initialMode: 'signin' | 'signup'
}

export function AuthLayout({ initialMode }: AuthLayoutProps) {
  const [currentMode, setCurrentMode] = useState<'signin' | 'signup'>(initialMode)

  return (
    <div className="relative flex min-h-screen w-full overflow-x-hidden bg-white font-sans selection:bg-[#f15a24]/10 selection:text-[#f15a24] dark:bg-[#0b0f17]">
      {/* Main Container: Split 2-column layout on Desktop */}
      <div className="flex-1 flex flex-col lg:flex-row w-full min-h-screen">
        
        {/* LEFT COLUMN: Hero & Branding */}
        <section className="relative flex w-full flex-col justify-between border-b border-[#f1f1f0] bg-[#faf9f8]/60 p-8 sm:p-12 lg:w-[48%] lg:border-b-0 lg:border-r lg:bg-[#fcfbf9]/40 lg:p-16 xl:w-[50%] xl:p-24 dark:border-slate-800 dark:bg-[#111827] lg:dark:bg-[#111827]">
          
          {/* Top Brand Logo */}
          <div className="flex items-center">
            <Link href="/" className="inline-block transition-opacity hover:opacity-90">
              <DriveaLogo iconSize={36} textSize="text-2xl" />
            </Link>
          </div>

          {/* Middle Value Proposition Headline */}
          <div className="my-12 lg:my-0 py-4 max-w-lg">
            <h1 className="text-3xl font-bold leading-[1.12] text-[#1e2229] sm:text-4xl lg:text-[50px] xl:text-[54px] dark:text-white">
              Secure, Simple &amp; Fast
              <br />
              <span className="text-[#f15a24]">Cloud Storage.</span>
            </h1>
            <p className="mt-5 max-w-[430px] text-base leading-relaxed text-[#64748b] lg:text-[17px] dark:text-slate-300">
              Store your files securely in our drive, organize into folders, share with permissions and access anywhere.
            </p>
          </div>

          {/* Bottom Copyright Notice */}
          <div className="text-xs font-normal tracking-wide text-[#94a3b8] sm:text-sm dark:text-slate-500">
            &copy; 2026 Zain Murtaza. All rights reserved.
          </div>
        </section>

        {/* RIGHT COLUMN: Auth Form Panel */}
        <main className="flex w-full items-center justify-center bg-white p-6 sm:p-10 lg:w-[52%] lg:p-16 xl:w-[50%] xl:p-20 dark:bg-[#0b0f17]">
          <div className="w-full max-w-[420px]">
            <UnifiedAuthForm
              initialMode={currentMode}
              onModeChange={(mode) => setCurrentMode(mode)}
            />
          </div>
        </main>

      </div>
    </div>
  )
}
