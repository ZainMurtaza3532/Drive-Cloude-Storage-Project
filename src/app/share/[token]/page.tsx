import { PublicShare } from '@/components/files/PublicShare'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params
    return <PublicShare token={token} />
}