import type { Metadata } from 'next'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { UploadProvider } from '@/context/UploadContext'
import { GlobalUploadWidget } from '@/components/GlobalUploadWidget'

export const metadata: Metadata = {
  title: 'My Drive',
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      <div className="flex h-screen bg-[#f8fafc] dark:bg-[#0b0f17] font-sans text-slate-900 dark:text-slate-100 antialiased overflow-hidden">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#fafafa]/80 dark:bg-[#0b0f17]">
            <div className="max-w-7xl mx-auto h-full">
              {children}
            </div>
          </main>
        </div>
      </div>
      <GlobalUploadWidget />
    </UploadProvider>
  )
}
