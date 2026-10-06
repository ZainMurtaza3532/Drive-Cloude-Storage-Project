import { ChevronRight, HardDrive } from 'lucide-react'
import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  href: string
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  // Filter out any duplicate root "My Drive" items from the passed items
  const subItems = items.filter(
    (item) => item.label.toLowerCase() !== 'my drive' && item.href !== '/dashboard'
  )

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs sm:text-sm overflow-x-auto scrollbar-none py-1 max-w-full">
      <Link
        href="/dashboard"
        className={`flex items-center gap-1.5 font-medium transition-colors shrink-0 ${
          subItems.length === 0
            ? 'text-slate-900 dark:text-white font-semibold'
            : 'text-slate-500 dark:text-slate-400 hover:text-[#f15a24] dark:hover:text-[#ff7847]'
        }`}
      >
        <HardDrive className="h-4 w-4 text-[#f15a24]" />
        <span>My Drive</span>
      </Link>

      {subItems.map((item, index) => {
        const isLast = index === subItems.length - 1
        return (
          <div key={`${item.href}-${index}`} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <Link
              href={item.href}
              className={`transition-colors truncate max-w-[120px] sm:max-w-[200px] ${
                isLast
                  ? 'font-semibold text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400 hover:text-[#f15a24] dark:hover:text-[#ff7847]'
              }`}
            >
              {item.label}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}
