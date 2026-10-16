import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Unit } from '@/lib/bidgrid/data'
import type { ItemStats } from '@/lib/bidgrid/family'
import { formatQty, formatUsd } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

function StatCard({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <div className="flex items-baseline gap-1.5 font-mono text-2xl font-medium tracking-tight text-foreground">
        {children}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1', up ? 'text-up' : 'text-down')}>
      <Icon aria-hidden="true" className="size-5" />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {`${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  )
}

export function StatCards({ stats, unit }: { stats: ItemStats; unit: Unit }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Current avg unit price" hint="Qty-weighted, trailing 12 months">
        {stats.current === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            {formatUsd(stats.current)}
            <span className="text-sm font-normal text-muted-foreground">{`/ ${unit}`}</span>
          </>
        )}
      </StatCard>
      <StatCard label="1-year change" hint="vs. prior 12 months">
        <Change value={stats.change1y} />
      </StatCard>
      <StatCard label="5-year change" hint="vs. same 12 months, 5 years ago">
        <Change value={stats.change5y} />
      </StatCard>
      <StatCard label="Data points" hint={`Bids across ${stats.contracts} contracts`}>
        {formatQty(stats.count)}
      </StatCard>
    </div>
  )
}
