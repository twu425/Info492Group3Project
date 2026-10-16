'use client'

import dynamic from 'next/dynamic'
import { useId, useMemo, useState } from 'react'
import { CONTRACTS, DISTRICTS, ITEM_CATALOG, type ItemFamily, type Unit } from '@/lib/bidgrid/data'
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
import { MapSkeleton } from '../detail/map-skeleton'
import { FamilyTable } from './family-table'
import { StatCards } from './stat-cards'
import { TrendChart } from './trend-chart'

const FamilyMap = dynamic(() => import('./family-map').then((m) => m.FamilyMap), {
  ssr: false,
  loading: () => <MapSkeleton />,
})

const DISTRICT_OPTIONS: { value: DistrictFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...DISTRICTS.map((d) => ({ value: d, label: formatDistrict(d) })),
]
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
}

export function FamilyView({
  family,
  initialItem,
  highlightId,
  highlightBidder,
  active,
  onOpenContract,
  onOpenBidder,
}: FamilyViewProps) {
  const ids = useId()
  const color = FAMILY_COLORS[family]
  const items = useMemo(() => ITEM_CATALOG.filter((i) => i.family === family), [family])
  const allPoints = useMemo(() => familyPoints(family), [family])

  // Units present in the family, most-observed first. Stats mix nothing across units: the
  // selector scopes the item dropdown (and so the stats/trend/map) to a single unit.
  const familyUnits = useMemo(() => {
    const counts = new Map<Unit, number>()
    allPoints.forEach((p) => counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1))
    return [...new Set(items.map((i) => i.unit))].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
  }, [items, allPoints])

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
  // Default to the unit of the opening item (which is the most common unit when none was named).
  const [unit, setUnit] = useState<Unit>(() => items.find((i) => i.code === itemCode)?.unit ?? familyUnits[0])
  const [district, setDistrict] = useState<DistrictFilter>('all')
  const [range, setRange] = useState<RangeKey>('all')
  const [tableUnit, setTableUnit] = useState<Unit | 'all'>('all')
  const [tableBand, setTableBand] = useState<BandFilter>('all')

  const unitItems = useMemo(() => items.filter((i) => i.unit === unit), [items, unit])
  const item = unitItems.find((i) => i.code === itemCode) ?? unitItems[0] ?? items[0]
  const from = rangeStart(range)

  const selectItem = (code: string) => setItemCode(code)
  const selectUnit = (u: Unit) => {
    setUnit(u)
    const best = mostBidItem(items.filter((i) => i.unit === u), highlightBidder)
    if (best) setItemCode(best)
  }

  const itemPoints = useMemo(() => allPoints.filter((p) => p.itemCode === item.code), [allPoints, item.code])
  const stats = useMemo(() => itemStats(itemPoints), [itemPoints])
  const chartPoints = useMemo(
    () => itemPoints.filter((p) => (district === 'all' || p.district === district) && p.time >= from),
    [itemPoints, district, from],
  )
  const quarters = useMemo(() => quarterSeries(chartPoints), [chartPoints])
  const tableRows = useMemo(
    () =>
      allPoints.filter(
        (p) =>
          (district === 'all' || p.district === district) &&
          p.time >= from &&
          (tableUnit === 'all' || p.unit === tableUnit) &&
          (tableBand === 'all' || quantityBand(p.itemCode, p.quantity) === tableBand),
      ),
    [allPoints, district, from, tableUnit, tableBand],
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

  const scopeLabel = `${district === 'all' ? 'All districts' : DISTRICT_OPTIONS.find((o) => o.value === district)?.label} · ${
    range === 'all' ? 'all years' : `last ${range === '3y' ? 3 : 5} years`
  }`
  const multiUnit = familyUnits.length > 1

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
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            {multiUnit && (
              <label className="flex flex-col gap-1.5">
                <span className="eyebrow">Unit</span>
                <div className="segmented segmented-fit" role="group" aria-label="Unit">
                  {familyUnits.map((u) => (
                    <button key={u} type="button" aria-pressed={unit === u} onClick={() => selectUnit(u)}>
                      {u}
                    </button>
                  ))}
                </div>
              </label>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Item</span>
              <select
                value={item.code}
                onChange={(e) => selectItem(e.target.value)}
                className="h-9 w-full rounded-md border bg-surface pl-2.5 text-sm text-foreground md:w-80"
              >
                {unitItems.map((i) => (
                  <option key={i.code} value={i.code}>
                    {`${i.code} · ${shortItemName(i.description)} (${i.unit})`}
                  </option>
                ))}
              </select>
            </label>
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
              <div className="segmented w-80" role="group" aria-label="District">
                {DISTRICT_OPTIONS.map((o) => (
                  <button key={o.label} type="button" aria-pressed={district === o.value} onClick={() => setDistrict(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="segmented w-36" role="group" aria-label="Time range">
                {RANGE_OPTIONS.map((o) => (
                  <button key={o.value} type="button" aria-pressed={range === o.value} onClick={() => setRange(o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="h-80 px-2 pb-3 pt-4 md:pr-4">
            {chartPoints.length > 0 ? (
              <TrendChart
                points={chartPoints}
                quarters={quarters}
                domain={[from, DATA_DOMAIN_END]}
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
              Line items
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {multiUnit && (
                <div className="segmented segmented-fit" role="group" aria-label="Unit filter">
                  <button type="button" aria-pressed={tableUnit === 'all'} onClick={() => setTableUnit('all')}>
                    All
                  </button>
                  {familyUnits.map((u) => (
                    <button key={u} type="button" aria-pressed={tableUnit === u} onClick={() => setTableUnit(u)}>
                      {u}
                    </button>
                  ))}
                </div>
              )}
              <div className="segmented segmented-fit" role="group" aria-label="Quantity band filter">
                {BAND_OPTIONS.map((b) => (
                  <button key={b.value} type="button" aria-pressed={tableBand === b.value} onClick={() => setTableBand(b.value)}>
                    {b.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-subtle-foreground">{tableRows.length}</span>
                {` bids · ${multiUnit && tableUnit !== 'all' ? `${tableUnit} items` : `all ${family.toLowerCase()} items`} · ${scopeLabel}`}
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
      </div>
    </div>
  )
}
