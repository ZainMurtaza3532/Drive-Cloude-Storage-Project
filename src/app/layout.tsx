import type { Metadata } from 'next'
import { Outfit, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'
import { SITE_URL } from '@/lib/site'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-outfit',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: 'DRIVEA | Secure Cloud Storage',
    template: '%s | DRIVEA',
  },
  description: 'Store and organize files in cloud storage, then share them with controlled access.',
  applicationName: 'DRIVEA',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'DRIVEA',
    title: 'DRIVEA | Secure Cloud Storage',
    description: 'Store and organize files in cloud storage, then share them with controlled access.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DRIVEA | Secure Cloud Storage',
    description: 'Store and organize files in cloud storage, then share them with controlled access.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
      <body className={`${outfit.className} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}

