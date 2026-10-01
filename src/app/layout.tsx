import type { Metadata } from 'next'
import { Outfit, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/Providers'

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
  title: 'DRIVEA - Secure, Simple & Fast Cloud Storage',
  description: 'Store your files securely in our drive, organize into folders, share with permissions and access anywhere.',
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

