import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Unit } from '@/lib/bidgrid/data'
import { MIN_BIDS, type ItemStatCards } from '@/lib/bidgrid/item-stats'
import { formatQty, formatUnitPrice } from '@/lib/bidgrid/format'
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

const NotEnough = () => <span className="text-base font-normal text-muted-foreground">Not enough data</span>

/** Signed percentage with a direction arrow (used for winners-vs-field and the trend cards). */
function Delta({ value }: { value: number | null }) {
  if (value === null) return <NotEnough />
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1', up ? 'text-up' : 'text-down')}>
      <Icon aria-hidden="true" className="size-5" />
      <span className="sr-only">{up ? 'Up' : 'Down'}</span>
      {`${up ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`}
    </span>
  )
}

function LoadingCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {['Winning price', 'Typical range', 'Winners vs. field', 'Data points'].map((label) => (
        <StatCard key={label} label={label} hint="Loading…">
          <span className="h-7 w-20 animate-pulse rounded bg-foreground/[0.08]" />
        </StatCard>
      ))}
    </div>
  )
}

export function StatCards({ cards, unit }: { cards: ItemStatCards | null; unit: Unit }) {
  if (!cards) return <LoadingCards />
  const perUnit = <span className="text-sm font-normal text-muted-foreground">{`/ ${unit}`}</span>
  const { winningPrice, typicalRange, winnersVsField, dataPoints, shareOfContract, change1y, change5y } = cards

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Winning price" hint={`Median of winning bids${cards.dateRange ? `, ${cards.dateRange}` : ''}`}>
        {winningPrice.value === null || winningPrice.bids < MIN_BIDS ? (
          <NotEnough />
        ) : (
          <>
            {formatUnitPrice(winningPrice.value)}
            {perUnit}
          </>
        )}
      </StatCard>

      <StatCard label="Typical range" hint="Half of all bids fall in this range">
        {typicalRange.p25 === null || typicalRange.p75 === null || typicalRange.bids < MIN_BIDS ? (
          <NotEnough />
        ) : (
          <>
            <span className="text-xl">{`${formatUnitPrice(typicalRange.p25)}–${formatUnitPrice(typicalRange.p75)}`}</span>
            {perUnit}
          </>
        )}
      </StatCard>

      <StatCard label="Winners vs. field" hint="Winning bids vs. all bidders">
        {winnersVsField.bids < MIN_BIDS ? <NotEnough /> : <Delta value={winnersVsField.value} />}
      </StatCard>

      <StatCard label="Data points" hint={`Bids across ${dataPoints.contracts} contract${dataPoints.contracts === 1 ? '' : 's'}`}>
        {formatQty(dataPoints.bids)}
      </StatCard>

      {shareOfContract && (
        <StatCard label="Share of contract total" hint="Median across winning bids">
          {shareOfContract.value === null || shareOfContract.bids < MIN_BIDS ? (
            <NotEnough />
          ) : (
            <>
              {`${(shareOfContract.value * 100).toFixed(shareOfContract.value < 0.01 ? 2 : 1)}%`}
              <span className="text-sm font-normal text-muted-foreground">of total</span>
            </>
          )}
        </StatCard>
      )}

      {change1y.show && (
        <StatCard label="1-year change" hint="vs. prior 12 months">
          <Delta value={change1y.value} />
        </StatCard>
      )}
      {change5y.show && (
        <StatCard label="5-year change" hint="vs. same 12 months, 5 years ago">
          <Delta value={change5y.value} />
        </StatCard>
      )}
    </div>
  )
}
