'use client'

import { ExternalLink, FileText } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useId, useState } from 'react'
import type { Contract, LineItem } from '@/lib/bidgrid/data'
import { FAMILY_COLORS, FAMILY_SHORT, formatLocation, formatUsdWhole } from '@/lib/bidgrid/format'
import { LineItemsTable } from '../line-items-table'
import { BidderLink } from './bidder-link'
import { MapSkeleton } from './map-skeleton'

function MapPlaceholder() {
  return <MapSkeleton />
}

const ContractMiniMap = dynamic(() => import('./contract-mini-map').then((m) => m.ContractMiniMap), {
  ssr: false,
  loading: MapPlaceholder,
})

type BidView = 'low' | 'all'

const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'always' })

interface ContractViewProps {
  contract: Contract
  /** Hidden history views skip the map so only visible views hold a WebGL context. */
  active: boolean
  onOpenItem: (item: LineItem) => void
  onOpenBidder: (name: string) => void
}

export function ContractView({ contract, active, onOpenItem, onOpenBidder }: ContractViewProps) {
  const [view, setView] = useState<BidView>('low')
  const ids = useId()
  const low = contract.bidders[0]
  const shownBidders = view === 'low' ? [low] : contract.bidders
  const color = FAMILY_COLORS[contract.primaryFamily]

  return (
    <div className="flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby={`${ids}-summary`} className="rounded-lg border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id={`${ids}-summary`} className="eyebrow">
                Summary
              </h2>
              <ul className="flex flex-wrap gap-1.5" aria-label="Item families">
                {contract.families.map((f) => (
                  <li
                    key={f}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs text-subtle-foreground"
                  >
                    <span aria-hidden="true" className="size-2 rounded-full" style={{ background: FAMILY_COLORS[f] }} />
                    {FAMILY_SHORT[f]}
                  </li>
                ))}
              </ul>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 text-sm">
              <div className="col-span-2 flex flex-col gap-1">
                <dt className="eyebrow">Location</dt>
                <dd className="font-mono text-foreground">{formatLocation(contract)}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <dt className="eyebrow">Type of work</dt>
                <dd className="text-pretty leading-relaxed text-foreground">{contract.typeOfWork}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="eyebrow">Bid open</dt>
                <dd className="font-mono text-foreground">{contract.bidOpenDate}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="eyebrow">Low bid</dt>
                <dd className="font-mono text-foreground">{formatUsdWhole(low.total)}</dd>
              </div>
            </dl>
            {contract.pdfUrl && (
              <div className="border-t px-4 py-3">
                <a
                  href={contract.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-foreground/[0.06]"
                >
                  <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
                  Bid summary PDF
                  <ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </a>
              </div>
            )}
          </section>

          <section aria-labelledby={`${ids}-map`} className="flex flex-col overflow-hidden rounded-lg border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 id={`${ids}-map`} className="eyebrow">
                Map
              </h2>
              <p className="text-xs text-muted-foreground">{`${contract.county} County · Route ${contract.route}`}</p>
            </div>
            <div className="h-56 lg:h-auto lg:min-h-56 lg:flex-1">
              {active ? (
                <ContractMiniMap
                  lat={contract.lat}
                  lng={contract.lng}
                  color={color}
                  label={`Map showing contract ${contract.ea} in ${contract.county} County`}
                />
              ) : (
                <MapPlaceholder />
              )}
            </div>
          </section>
        </div>

        <section aria-labelledby={`${ids}-bidders`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id={`${ids}-bidders`} className="eyebrow">
              Bidders
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono text-subtle-foreground">{contract.bidders.length}</span>
              {' bids, ranked by total'}
            </p>
          </div>
          <ol className="divide-y divide-border/60">
            {contract.bidders.map((b) => (
              <li key={b.name} className="flex items-baseline gap-3 px-4 py-2.5 text-sm">
                <span className="w-6 shrink-0 font-mono text-muted-foreground">{`#${b.rank}`}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <BidderLink name={b.name} onOpen={onOpenBidder} className="truncate font-medium text-foreground" />
                  {b.rank === 1 && (
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">Low</span>
                  )}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs text-muted-foreground">
                  {b.rank === 1 ? '—' : pct.format(b.total / low.total - 1)}
                </span>
                <span className="w-28 shrink-0 text-right font-mono text-foreground">{formatUsdWhole(b.total)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={`${ids}-items`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <h2 id={`${ids}-items`} className="eyebrow">
              Line items
            </h2>
            <div className="segmented w-48" role="group" aria-label="Bidder view">
              <button type="button" aria-pressed={view === 'low'} onClick={() => setView('low')}>
                Low bidder
              </button>
              <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
                All bidders
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-6 p-4">
            {shownBidders.map((bidder) => (
              <section key={bidder.name} className="flex flex-col gap-2" aria-label={`Bid from ${bidder.name}`}>
                {view === 'all' && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-foreground">
                      <span className="font-mono text-muted-foreground">{`#${bidder.rank}`}</span>
                      <BidderLink name={bidder.name} onOpen={onOpenBidder} className="font-medium" />
                    </span>
                    <span className="font-mono text-subtle-foreground">{formatUsdWhole(bidder.total)}</span>
                  </div>
                )}
                <LineItemsTable
                  items={contract.lineItems.filter((li) => li.bidder === bidder.name)}
                  onSelectItem={onOpenItem}
                />
              </section>
            ))}
          </div>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Click a line item to open its item family price trend
          </p>
        </section>
      </div>
    </div>
  )
}
