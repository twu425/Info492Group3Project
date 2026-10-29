import { SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  filtersOpen?: boolean
  onToggleFilters?: () => void
  actions?: React.ReactNode
  search?: React.ReactNode
}

export function AppHeader({ filtersOpen = false, onToggleFilters, actions, search }: AppHeaderProps) {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:gap-4">
      <div className="flex min-w-0 shrink items-center gap-3">
        <Link href="/" className="flex items-center gap-3 rounded-md">
          <span aria-hidden="true" className="grid size-6 shrink-0 grid-cols-2 gap-0.5 rounded-md bg-surface p-1 ring-1 ring-border">
            <span className="rounded-[1px] bg-primary" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">BidGrid</span>
        </Link>
        <span aria-hidden="true" className="hidden h-4 w-px bg-border lg:block" />
        <p className="hidden truncate text-sm text-subtle-foreground lg:block">
          Caltrans contract cost explorer · 12 districts
        </p>
      </div>
      {search && <div className="flex min-w-0 flex-1 justify-end sm:justify-center">{search}</div>}
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
          Mock data
        </span>
        {actions}
        {onToggleFilters && (
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            aria-expanded={filtersOpen}
            aria-controls="filter-sidebar"
            onClick={onToggleFilters}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
          </Button>
        )}
      </div>
    </header>
  )
}
