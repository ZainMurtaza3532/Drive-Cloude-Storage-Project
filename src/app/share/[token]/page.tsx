import { PublicShare } from '@/components/files/PublicShare'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Shared File',
    robots: { index: false, follow: false },
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    return <PublicShare token={token} />
}