'use client'

import dynamic from 'next/dynamic'
import { ChevronDown } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import {
  bidHistory,
  bidderBids,
  bidderInfo,
  bidderStats,
  headToHead,
  pricingPositions,
} from '@/lib/bidgrid/bidder'
import { DISTRICT_NAMES, type ItemFamily } from '@/lib/bidgrid/data'
import { CATEGORY_COLORS, formatDistrict, formatQty, formatUsdCompact } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'
import { BidHistoryChart } from './bid-history-chart'
import { BidderBidsTable } from './bidder-bids-table'
import { BidderLink } from './bidder-link'
import { MapSkeleton } from './map-skeleton'

const BidderMap = dynamic(() => import('./bidder-map').then((m) => m.BidderMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const pct0 = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 })

interface BidderViewProps {
  name: string
  /** Hidden history views skip the map so only visible views hold a WebGL context. */
  active: boolean
  onOpenContract: (ea: string) => void
  onOpenFamily: (family: ItemFamily) => void
  onOpenBidder: (name: string) => void
}

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

export function BidderView({ name, active, onOpenContract, onOpenFamily, onOpenBidder }: BidderViewProps) {
  const ids = useId()
  const info = useMemo(() => bidderInfo(name), [name])
  const bids = useMemo(() => bidderBids(name), [name])
  const stats = useMemo(() => bidderStats(bids), [bids])
  const positions = useMemo(() => pricingPositions(name), [name])
  const history = useMemo(() => bidHistory(bids), [bids])
  const rivals = useMemo(() => headToHead(name), [name])
  const [h2hOpen, setH2hOpen] = useState(true)

  const maxDeviation = useMemo(
    () => Math.max(0.01, ...positions.map((p) => Math.abs(p.deviation))),
    [positions],
  )
  const maxShared = useMemo(() => Math.max(1, ...rivals.map((r) => r.shared)), [rivals])

  return (
    <div className="flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Specialties">
            {info.specialties.map((category) => (
              <li
                key={category}
                className="inline-flex items-center gap-1.5 rounded-md border bg-surface px-2 py-0.5 text-xs text-subtle-foreground"
              >
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: CATEGORY_COLORS[category] }} />
                {category}
              </li>
            ))}
            {info.isGeneral && (
              <li className="inline-flex items-center rounded-md border bg-surface px-2 py-0.5 text-xs text-subtle-foreground">
                General contractor
              </li>
            )}
          </ul>
          <p className="shrink-0 text-sm text-subtle-foreground">
            Home district{' '}
            <span className="font-mono text-foreground">
              {`${formatDistrict(info.home)} · ${DISTRICT_NAMES[info.home]}`}
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Contracts bid" hint="In the dataset">
            {formatQty(stats.contractsBid)}
          </StatCard>
          <StatCard label="Contracts won" hint="Ranked low bidder">
            {formatQty(stats.contractsWon)}
          </StatCard>
          <StatCard label="Win rate" hint="Share of bids won">
            {pct.format(stats.winRate)}
          </StatCard>
          <StatCard label="Total value won" hint="Sum of winning bids">
            {stats.totalValueWon > 0 ? formatUsdCompact(stats.totalValueWon) : <span className="text-muted-foreground">—</span>}
          </StatCard>
          <StatCard label="Avg above low" hint="When they don't win">
            {stats.avgPctAboveLowWhenLose === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              `+${pct.format(stats.avgPctAboveLowWhenLose)}`
            )}
          </StatCard>
        </div>

        <section aria-labelledby={`${ids}-map`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id={`${ids}-map`} className="eyebrow">
              Where they bid
            </h2>
            <ul className="flex items-center gap-x-4 gap-y-1 text-xs text-subtle-foreground">
              <li className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: 'var(--primary)' }} />
                Won
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full border-[1.5px]"
                  style={{ borderColor: 'color-mix(in srgb, var(--primary) 60%, transparent)' }}
                />
                Lost
              </li>
            </ul>
          </div>
          <div className="h-72">
            {active ? <BidderMap bids={bids} onOpenContract={onOpenContract} /> : <MapSkeleton />}
          </div>
        </section>

        <section aria-labelledby={`${ids}-history`} className="rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id={`${ids}-history`} className="eyebrow">
              Bids per quarter
            </h2>
            <p className="text-xs text-muted-foreground">Won bids highlighted</p>
          </div>
          <div className="h-56 px-2 pb-3 pt-4 md:pr-4">
            {history.length > 0 ? (
              <BidHistoryChart quarters={history} />
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No bids on record.</p>
            )}
          </div>
        </section>

        {positions.length > 0 && (
          <section aria-labelledby={`${ids}-pricing`} className="overflow-hidden rounded-lg border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id={`${ids}-pricing`} className="eyebrow">
                Pricing position
              </h2>
              <p className="text-xs text-muted-foreground">
                Typical unit price vs. market median · families bid 5+ times
              </p>
            </div>
            <ul className="flex flex-col gap-0.5 p-2">
              {positions.map((position) => {
                const below = position.deviation < 0
                const width = Math.min(50, (Math.abs(position.deviation) / maxDeviation) * 50)
                const magnitude = pct0.format(Math.abs(position.deviation))
                return (
                  <li key={position.family}>
                    <button
                      type="button"
                      data-morph-host=""
                      onClick={() => onOpenFamily(position.family)}
                      aria-label={`${position.family}: ${magnitude} ${below ? 'below' : 'above'} median across ${position.count} bids. Open item family.`}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.05] focus-visible:outline-none"
                    >
                      <span className="flex w-40 shrink-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: CATEGORY_COLORS[position.category] }}
                        />
                        <span data-morph="" className="truncate text-sm text-foreground">
                          {position.family}
                        </span>
                      </span>
                      <span className="relative h-5 min-w-0 flex-1 rounded-sm bg-foreground/[0.03]">
                        <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                        <span
                          aria-hidden="true"
                          className="absolute inset-y-1 rounded-[3px]"
                          style={{
                            left: below ? `${50 - width}%` : '50%',
                            width: `${width}%`,
                            background: below ? 'var(--down)' : 'var(--up)',
                          }}
                        />
                      </span>
                      <span className="w-40 shrink-0 text-right text-xs">
                        <span className={cn('font-mono font-medium', below ? 'text-down' : 'text-up')}>{magnitude}</span>
                        <span className="text-muted-foreground">{` ${below ? 'below' : 'above'} · ${position.count} bids`}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby={`${ids}-bids`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id={`${ids}-bids`} className="eyebrow">
              All bids
            </h2>
          </div>
          <BidderBidsTable bids={bids} onOpenContract={onOpenContract} />
        </section>

        {rivals.length > 0 && (
          <section aria-labelledby={`${ids}-h2h`} className="overflow-hidden rounded-lg border bg-surface">
            <button
              type="button"
              onClick={() => setH2hOpen((o) => !o)}
              aria-expanded={h2hOpen}
              aria-controls={`${ids}-h2h-body`}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
            >
              <span className="flex items-baseline gap-2">
                <span id={`${ids}-h2h`} className="eyebrow">
                  Head-to-head
                </span>
                <span className="text-xs text-muted-foreground">Most frequent competitors</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
                  !h2hOpen && '-rotate-90',
                )}
              />
            </button>
            {h2hOpen && (
              <ul id={`${ids}-h2h-body`} className="divide-y divide-border/60 border-t">
                {rivals.map((rival) => (
                  <li key={rival.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <BidderLink
                      name={rival.name}
                      onOpen={onOpenBidder}
                      className="min-w-0 flex-1 truncate font-medium text-foreground"
                    />
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <span className="font-mono text-subtle-foreground">{rival.shared}</span> shared
                    </span>
                    <span
                      aria-hidden="true"
                      className="hidden h-2 w-24 shrink-0 overflow-hidden rounded-full bg-border sm:flex"
                      title={`Won ${rival.wins}, lost ${rival.losses}`}
                    >
                      <span className="h-full bg-primary" style={{ width: `${(rival.wins / rival.shared) * 100}%` }} />
                    </span>
                    <span className="w-20 shrink-0 text-right font-mono text-xs">
                      <span className={cn(rival.wins >= rival.losses ? 'text-primary' : 'text-subtle-foreground')}>
                        {rival.wins}
                      </span>
                      <span className="text-muted-foreground">{`–${rival.losses}`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
