'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BidRecord } from '@/lib/bidgrid/bidder'
import { DISTRICTS, type District } from '@/lib/bidgrid/data'
import { formatDistrict, formatUsdWhole } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

type SortKey = 'ea' | 'bidDate' | 'district' | 'projectType' | 'total' | 'lowTotal' | 'pctAboveLow' | 'rank'
type SortDir = 'asc' | 'desc'
type WonFilter = 'all' | 'won' | 'lost'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'ea', label: 'EA' },
  { key: 'bidDate', label: 'Bid date' },
  { key: 'district', label: 'Dist.' },
  { key: 'projectType', label: 'Project type' },
  { key: 'total', label: 'Their total', numeric: true },
  { key: 'lowTotal', label: 'Low bid', numeric: true },
  { key: 'pctAboveLow', label: '% above low', numeric: true },
  { key: 'rank', label: 'Rank', numeric: true },
]

const pct = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })

interface BidderBidsTableProps {
  bids: BidRecord[]
  onOpenContract: (ea: string) => void
}

export function BidderBidsTable({ bids, onOpenContract }: BidderBidsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'bidDate', dir: 'desc' })
  const [won, setWon] = useState<WonFilter>('all')
  const [district, setDistrict] = useState<District | 'all'>('all')

  const districtsPresent = useMemo(
    () => DISTRICTS.filter((d) => bids.some((b) => b.district === d)),
    [bids],
  )

  const filtered = useMemo(
    () =>
      bids.filter(
        (b) =>
          (won === 'all' || (won === 'won') === b.won) && (district === 'all' || b.district === district),
      ),
    [bids, won, district],
  )

  const sorted = useMemo(() => {
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[sort.key]
      const bv = b[sort.key]
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return cmp * factor || a.rank - b.rank
    })
  }, [filtered, sort])

  const toggle = (key: SortKey, numeric?: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: numeric ? 'desc' : 'asc' }))

  const wonOptions: { value: WonFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
  ]

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <div className="segmented w-44" role="group" aria-label="Won or lost">
          {wonOptions.map((o) => (
            <button key={o.value} type="button" aria-pressed={won === o.value} onClick={() => setWon(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="eyebrow">District</span>
          <select
            value={district}
            onChange={(e) => setDistrict(e.target.value === 'all' ? 'all' : (Number(e.target.value) as District))}
            className="h-8 rounded-md border bg-surface pl-2 text-sm text-foreground"
          >
            <option value="all">All</option>
            {districtsPresent.map((d) => (
              <option key={d} value={d}>
                {formatDistrict(d)}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto text-xs text-muted-foreground">
          <span className="font-mono text-subtle-foreground">{sorted.length}</span>
          {sorted.length === 1 ? ' contract' : ' contracts'}
        </p>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left">
              {COLUMNS.map((col) => {
                const active = sort.key === col.key
                const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className="sticky top-0 z-[1] h-9 border-b bg-surface px-3 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggle(col.key, col.numeric)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm text-[11px] uppercase tracking-wider transition-colors hover:text-foreground',
                        active ? 'text-foreground' : 'text-muted-foreground',
                        col.numeric && 'w-full flex-row-reverse justify-start',
                      )}
                    >
                      {col.label}
                      <Icon aria-hidden="true" className={cn('size-3', !active && 'opacity-50')} />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.ea}
                tabIndex={0}
                aria-label={`Open contract ${row.ea}`}
                onClick={() => onOpenContract(row.ea)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenContract(row.ea)
                  }
                }}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.05] focus-visible:shadow-[inset_2px_0_0_var(--primary)] focus-visible:outline-none"
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-foreground">
                  <span data-morph="">{row.ea}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-subtle-foreground">{row.bidDate}</td>
                <td className="px-3 py-1.5 font-mono text-subtle-foreground">{formatDistrict(row.district)}</td>
                <td className="px-3 py-1.5 leading-snug text-foreground">{row.projectType}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-foreground">
                  {formatUsdWhole(row.total)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-subtle-foreground">
                  {formatUsdWhole(row.lowTotal)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-subtle-foreground">
                  {row.won ? '—' : `+${pct.format(row.pctAboveLow)}`}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 font-mono',
                      row.won ? 'text-primary' : 'text-subtle-foreground',
                    )}
                  >
                    {`#${row.rank}`}
                    {row.won && (
                      <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        Won
                      </span>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No bids match these filters.</p>
        )}
      </div>
    </>
  )
}
