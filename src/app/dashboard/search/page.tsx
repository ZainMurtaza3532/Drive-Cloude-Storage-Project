import { Suspense } from 'react'
import { SearchResultsPage } from '@/components/files/SearchResultsPage'

export default function DashboardSearchPage() {
    return (
        <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Loading search...</p>}>
            <SearchResultsPage />
        </Suspense>
    )
}