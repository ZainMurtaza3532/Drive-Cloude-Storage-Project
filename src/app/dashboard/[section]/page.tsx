import { notFound } from 'next/navigation'
import { DashboardSectionView, type DashboardSection } from '@/components/files/DashboardSectionView'

const validSections = new Set<DashboardSection>(['recent', 'starred', 'trash', 'storage'])

export default async function DashboardSectionPage({
    params,
}: {
    params: Promise<{ section: string }>
}) {
    const { section } = await params

    if (!validSections.has(section as DashboardSection)) {
        notFound()
    }

    return <DashboardSectionView section={section as DashboardSection} />
}