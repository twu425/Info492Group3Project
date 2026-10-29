'use client'

import dynamic from 'next/dynamic'
import { useId, useMemo, useState } from 'react'
import { CONTRACTS, type ItemFamily, type Unit } from '@/lib/bidgrid/data'
import { quantityBand, type QuantityBand } from '@/lib/bidgrid/estimate'
import {
  DATA_DOMAIN_END,
  familyPoints,
  itemStats,
  quarterSeries,
  rangeStart,
  type DistrictFilter,
  type RangeKey,
} from '@/lib/bidgrid/family'
import { FAMILY_COLORS, formatDistrict, shortItemName } from '@/lib/bidgrid/format'
import { DistrictSelect } from '../district-select'
import { MapSkeleton } from '../detail/map-skeleton'
import { FamilyItemsTable, type FamilyItemSummary } from './family-items-table'
import { FamilyTable } from './family-table'
import { StatCards } from './stat-cards'
import { TrendChart } from './trend-chart'

const FamilyMap = dynamic(() => import('./family-map').then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '3y', label: '3Y' },
  { value: '5y', label: '5Y' },
  { value: 'all', label: 'All' },
]
type BandFilter = 'all' | QuantityBand
const BAND_OPTIONS: { value: BandFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Small', label: 'Small' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Large', label: 'Large' },
]

interface FamilyViewProps {
  family: ItemFamily
  initialItem: string | null
  highlightId: string | null
  highlightBidder: string | null
  /** Hidden history views skip the map so only visible views hold a WebGL context. */
  active: boolean
  onOpenContract: (ea: string) => void
  onOpenBidder: (name: string) => void
  /** Open another item in this family as a new view (keeps this one in the stack). */
  onOpenItem: (itemCode: string, label: string) => void
}

export function FamilyView({
  family,
  initialItem,
  highlightId,
  highlightBidder,
  active,
  onOpenContract,
  onOpenBidder,
  onOpenItem,
}: FamilyViewProps) {
  const ids = useId()
  const color = FAMILY_COLORS[family]
  const allPoints = useMemo(() => familyPoints(family), [family])
  // Items are derived from the real bid data for this family (code/description/unit),
  // not a fixed catalog, so every family — including 'Other' — has a populated list.
  const items = useMemo(() => {
    const seen = new Map<string, { code: string; description: string; unit: Unit }>()
    for (const p of allPoints) {
      if (!seen.has(p.itemCode)) {
        seen.set(p.itemCode, { code: p.itemCode, description: p.description, unit: p.unit })
      }
    }
    return [...seen.values()]
  }, [allPoints])

  const mostBidItem = (pool: typeof items, bidder: string | null) => {
    const counts = new Map<string, number>()
    const add = (filterBidder: boolean) =>
      allPoints.forEach((p) => {
        if (filterBidder && bidder && p.bidder !== bidder) return
        if (pool.some((i) => i.code === p.itemCode)) counts.set(p.itemCode, (counts.get(p.itemCode) ?? 0) + 1)
      })
    add(true)
    if (counts.size === 0) add(false)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? pool[0]?.code
  }

  const [itemCode, setItemCode] = useState(() => {
    if (initialItem && items.some((i) => i.code === initialItem)) return initialItem
    return mostBidItem(items, highlightBidder)
  })
  const [district, setDistrict] = useState<DistrictFilter>('all')
  const [range, setRange] = useState<RangeKey>('all')
  const [tableBand, setTableBand] = useState<BandFilter>('all')

  // Each item code has exactly one unit, so there's no unit to switch — the item is
  // the whole subject of the view.
  const item =
    items.find((i) => i.code === itemCode) ?? items[0] ?? { code: '', description: '—', unit: 'EA' as Unit }
  const from = rangeStart(range)

  // Opening a different item is a *new* view (keeps this one in the stack), so each
  // view stays about a single item and its header never goes stale.
  const openItem = (code: string) => {
    if (!code || code === item.code) return
    onOpenItem(code, items.find((i) => i.code === code)?.description ?? code)
  }

  const itemPoints = useMemo(() => allPoints.filter((p) => p.itemCode === item.code), [allPoints, item.code])
  const stats = useMemo(() => itemStats(itemPoints), [itemPoints])
  const chartPoints = useMemo(
    () => itemPoints.filter((p) => (district === 'all' || p.district === district) && p.time >= from),
    [itemPoints, district, from],
  )
  const quarters = useMemo(() => quarterSeries(chartPoints), [chartPoints])

  // Fit the chart's x-axis to the actual data — the individual bids and the
  // quarterly-average points — with a little padding on each side so nothing sits
  // flush against the edges.
  const chartDomain = useMemo<[number, number]>(() => {
    if (chartPoints.length === 0) return [from, DATA_DOMAIN_END]
    let lo = Infinity
    let hi = -Infinity
    for (const p of chartPoints) {
      if (p.time < lo) lo = p.time
      if (p.time > hi) hi = p.time
    }
    for (const q of quarters) {
      if (q.time < lo) lo = q.time
      if (q.time > hi) hi = q.time
    }
    const pad = Math.max((hi - lo) * 0.06, 10 * 86_400_000)
    return [lo - pad, hi + pad]
  }, [chartPoints, quarters, from])

  // The table shows the selected item's bids — same scope as the stats/chart/map —
  // so the item dropdown drives the whole view consistently.
  const tableRows = useMemo(
    () =>
      itemPoints.filter(
        (p) =>
          (district === 'all' || p.district === district) &&
          p.time >= from &&
          (tableBand === 'all' || quantityBand(p.itemCode, p.quantity) === tableBand),
      ),
    [itemPoints, district, from, tableBand],
  )
  const mapContracts = useMemo(
    () =>
      CONTRACTS.filter(
        (c) =>
          c.families.includes(family) &&
          (district === 'all' || c.district === district) &&
          Date.parse(c.bidOpenDate) >= from,
      ).map((c) => ({
        ea: c.ea,
        lat: c.lat,
        lng: c.lng,
        year: c.bidOpenDate.slice(0, 4),
        quantity: c.lineItems.find((li) => li.itemCode === item.code)?.quantity ?? null,
      })),
    [family, district, from, item.code],
  )

  // Every item in the family (independent of the unit/item in view) for the table
  // that lets you jump to a sibling item.
  const familyItems = useMemo<FamilyItemSummary[]>(() => {
    const by = new Map<
      string,
      { code: string; description: string; unit: Unit; contracts: Set<string>; prices: number[] }
    >()
    for (const p of allPoints) {
      let s = by.get(p.itemCode)
      if (!s) {
        s = { code: p.itemCode, description: p.description, unit: p.unit, contracts: new Set(), prices: [] }
        by.set(p.itemCode, s)
      }
      s.contracts.add(p.ea)
      s.prices.push(p.unitPrice)
    }
    return [...by.values()]
      .map((s) => {
        const sorted = [...s.prices].sort((a, b) => a - b)
        return {
          code: s.code,
          description: s.description,
          unit: s.unit,
          bids: s.prices.length,
          contracts: s.contracts.size,
          median: sorted[Math.floor(sorted.length / 2)] ?? 0,
        }
      })
      .sort((a, b) => b.bids - a.bids)
  }, [allPoints])

  const scopeLabel = `${district === 'all' ? 'All districts' : formatDistrict(district)} · ${
    range === 'all' ? 'all years' : `last ${range === '3y' ? 3 : 5} years`
  }`

  return (
    <div className="flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-relaxed text-subtle-foreground text-pretty">
              Bid prices for <span className="font-mono text-foreground">{item.code}</span>{' '}
              {shortItemName(item.description).toLowerCase()}, per {item.unit}.
            </p>
          </div>
        </div>

        <StatCards stats={stats} unit={item.unit} />

        <section aria-labelledby={`${ids}-trend`} className="rounded-lg border bg-surface">
          <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <h2 id={`${ids}-trend`} className="eyebrow">
                Unit price trend
              </h2>
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle-foreground">
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-[1.5px] w-4" style={{ background: color }} />
                  Weighted avg / quarter
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-4 rounded-sm" style={{ background: color, opacity: 0.22 }} />
                  P25–P75
                </li>
                <li className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: color, opacity: 0.5 }} />
                  Individual bids
                </li>
              </ul>
            </div>
            <div className="flex gap-2">
              <DistrictSelect value={district} onChange={setDistrict} className="w-52" />
            </div>
          </div>
          <div className="h-80 px-2 pb-3 pt-4 md:pr-4">
            {chartPoints.length > 0 ? (
              <TrendChart
                points={chartPoints}
                quarters={quarters}
                domain={chartDomain}
                color={color}
                highlightId={highlightId}
                highlightBidder={highlightBidder}
                onOpenContract={onOpenContract}
              />
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No bids for this item in the selected range.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby={`${ids}-map`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id={`${ids}-map`} className="eyebrow">
              Contracts
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono text-subtle-foreground">{mapContracts.length}</span>
              {` with ${family.toLowerCase()} · size = ${item.unit} of ${item.code} · ring = item not bid · ${scopeLabel}`}
            </p>
          </div>
          <div className="h-72">
            {active ? (
              <FamilyMap contracts={mapContracts} color={color} unit={item.unit} onOpenContract={onOpenContract} />
            ) : (
              <MapSkeleton />
            )}
          </div>
        </section>

        <section aria-labelledby={`${ids}-table`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
            <h2 id={`${ids}-table`} className="eyebrow">
              Bids for {item.code}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="segmented segmented-fit" role="group" aria-label="Quantity band filter">
                {BAND_OPTIONS.map((b) => (
                  <button key={b.value} type="button" aria-pressed={tableBand === b.value} onClick={() => setTableBand(b.value)}>
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-subtle-foreground">{tableRows.length}</span>
                {` bids · ${item.code} · ${scopeLabel}`}
              </p>
            </div>
          </div>
          <FamilyTable
            rows={tableRows}
            highlightBidder={highlightBidder}
            onOpenContract={onOpenContract}
            onOpenBidder={onOpenBidder}
          />
        </section>

        <section aria-labelledby={`${ids}-items`} className="overflow-hidden rounded-lg border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
            <h2 id={`${ids}-items`} className="eyebrow">
              Other items in {family}
            </h2>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono text-subtle-foreground">{familyItems.length}</span>
              {' items · click a row to open it'}
            </p>
          </div>
          <FamilyItemsTable items={familyItems} currentCode={item.code} onOpen={openItem} />
        </section>
      </div>
    </div>
  )
}
