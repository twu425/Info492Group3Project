import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Unit } from '@/lib/bidgrid/data'
import {
  formatTypicalRange,
  MIN_BIDS,
  statCardKeys,
  type ItemStatCards,
  type StatCardKey,
} from '@/lib/bidgrid/item-stats'
import { formatUnitPrice } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

const LABELS: Record<StatCardKey, string> = {
  winningPrice: 'Winning price',
  typicalRange: 'Typical range',
  winnersVsField: 'Winners vs. field',
  dataPoints: 'Data points',
  shareOfContract: 'Share of contract total',
}

/**
 * Fixed-geometry card: the label, a 2rem value row, and a 1rem subtitle row are always the same
 * height, so the skeleton and the loaded content occupy identical space — nothing shifts when the
 * data arrives. `min-h` plus the grid's stretch keep all four cards the same height.
 */
function StatCard({ label, loading, hint, children }: { label: string; loading: boolean; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[7.25rem] flex-col gap-2 rounded-lg border bg-surface p-4">
      <p className="eyebrow">{label}</p>
      <div className="flex h-8 items-baseline gap-1.5 overflow-hidden font-mono text-2xl font-medium tracking-tight tabular-nums text-foreground">
        {loading ? <span className="h-6 w-24 self-center animate-pulse rounded bg-foreground/[0.08]" /> : children}
      </div>
      <div className="h-4">
        {loading ? (
          <span className="block h-3 w-28 animate-pulse rounded bg-foreground/[0.08]" />
        ) : (
          <p className="truncate text-xs text-muted-foreground" title={hint}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

/** Primary value as a single truncating line with the full text in a tooltip. */
function Value({ main, suffix, title, className }: { main: string; suffix?: ReactNode; title?: string; className?: string }) {
  return (
    <>
      <span className={cn('min-w-0 truncate', className)} title={title ?? main}>
        {main}
      </span>
      {suffix}
    </>
  )
}

const NotEnough = () => <span className="truncate text-base font-normal text-muted-foreground">Not enough data</span>

/** Signed percentage with a direction arrow (winners-vs-field). */
function Delta({ value }: { value: number | null }) {
  if (value === null) return <NotEnough />
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1', up ? 'text-up' : 'text-down')}>
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {`${up ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  )
}

/** Always exactly 4 columns, equal widths; on narrow screens the single row scrolls. */
function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="grid min-w-[40rem] grid-cols-4 items-stretch gap-3">{children}</div>
    </div>
  )
}

export function StatCards({ cards, unit }: { cards: ItemStatCards | null; unit: Unit }) {
  // The card set comes from the catalog unit (known immediately), not the stats response, so the
  // layout is final before the data loads.
  const keys = statCardKeys(unit === 'LS')
  const perUnit = <span className="text-sm font-normal text-muted-foreground">{`/ ${unit}`}</span>

  const hint = (key: StatCardKey): string => {
    if (!cards) return ''
    switch (key) {
      case 'winningPrice':
        return `Median of winning bids${cards.dateRange ? `, ${cards.dateRange}` : ''}`
      case 'typicalRange':
        return 'Half of all bids fall in this range'
      case 'winnersVsField':
        return 'Winning bids vs. all bidders'
      case 'dataPoints':
        return `Bids across ${cards.dataPoints.contracts} contract${cards.dataPoints.contracts === 1 ? '' : 's'}`
      case 'shareOfContract':
        return 'Median across winning bids'
    }
  }

  const value = (key: StatCardKey): ReactNode => {
    if (!cards) return null
    switch (key) {
      case 'winningPrice': {
        const v = cards.winningPrice
        if (v.value === null || v.bids < MIN_BIDS) return <NotEnough />
        return <Value main={formatUnitPrice(v.value)} suffix={perUnit} title={`${formatUnitPrice(v.value)} / ${unit}`} />
      }
      case 'typicalRange': {
        const r = cards.typicalRange
        if (r.p25 === null || r.p75 === null || r.bids < MIN_BIDS) return <NotEnough />
        return <Value main={formatTypicalRange(r.p25, r.p75)} className="text-xl" />
      }
      case 'winnersVsField':
        return cards.winnersVsField.bids < MIN_BIDS ? <NotEnough /> : <Delta value={cards.winnersVsField.value} />
      case 'dataPoints':
        return <Value main={cards.dataPoints.bids.toLocaleString()} />
      case 'shareOfContract': {
        const s = cards.shareOfContract
        if (!s || s.value === null || s.bids < MIN_BIDS) return <NotEnough />
        const pct = `${(s.value * 100).toFixed(s.value < 0.01 ? 2 : 1)}%`
        return <Value main={pct} suffix={<span className="text-sm font-normal text-muted-foreground">of total</span>} title={`${pct} of contract total`} />
      }
    }
  }

  return (
    <Grid>
      {keys.map((key) => (
        <StatCard key={key} label={LABELS[key]} loading={!cards} hint={hint(key)}>
          {value(key)}
        </StatCard>
      ))}
    </Grid>
  )
}
