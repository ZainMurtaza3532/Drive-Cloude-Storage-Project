import type { Metadata } from 'next'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { UploadProvider } from '@/context/UploadContext'
import { MobileNavProvider } from '@/context/MobileNavContext'
import { GlobalUploadWidget } from '@/components/GlobalUploadWidget'

export const metadata: Metadata = {
  title: 'My Drive',
  robots: { index: false, follow: false },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UploadProvider>
      <MobileNavProvider>
        <div className="flex h-screen h-[100dvh] w-full max-w-full bg-[#f8fafc] dark:bg-[#0b0f17] font-sans text-slate-900 dark:text-slate-100 antialiased overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0 max-w-full overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 lg:p-8 bg-[#fafafa]/80 dark:bg-[#0b0f17] w-full min-w-0">
              <div className="max-w-7xl mx-auto h-full w-full min-w-0">
                {children}
              </div>
            </main>
          </div>
        </div>
        <GlobalUploadWidget />
      </MobileNavProvider>
    </UploadProvider>
  )
}
