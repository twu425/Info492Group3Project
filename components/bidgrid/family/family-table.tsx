'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { quantityBand, vsTypical, type QuantityBand } from '@/lib/bidgrid/estimate'
import type { PricePoint } from '@/lib/bidgrid/family'
import { formatDistrict, formatQty, formatUsd } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'
import { BidderLink } from '../detail/bidder-link'

type SortKey =
  | 'ea'
  | 'bidDate'
  | 'district'
  | 'bidder'
  | 'itemCode'
  | 'description'
  | 'quantity'
  | 'unitPrice'
  | 'vsTypical'
type ColumnKey = SortKey | 'itemRank' | 'contractRank'
type SortDir = 'asc' | 'desc'

const COLUMNS: {
  key: ColumnKey
  label: string
  numeric?: boolean
  sortable?: boolean
  tooltip?: string
}[] = [
  { key: 'ea', label: 'EA' },
  { key: 'bidDate', label: 'Bid date' },
  { key: 'district', label: 'Dist.' },
  { key: 'bidder', label: 'Bidder' },
  { key: 'itemCode', label: 'Item' },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty', numeric: true },
  { key: 'unitPrice', label: 'Unit price', numeric: true },
  {
    key: 'vsTypical',
    label: 'vs. typical',
    numeric: true,
    tooltip: "Price compared to what's typical for this quantity.",
  },
  { key: 'itemRank', label: 'Item rank', numeric: true, sortable: false },
  {
    key: 'contractRank',
    label: 'Contract rank',
    numeric: true,
    sortable: false,
    tooltip: 'Overall rank on this contract by total bid, not this item.',
  },
]

type Row = PricePoint & { band: QuantityBand; vs: number | null }

interface FamilyTableProps {
  rows: PricePoint[]
  highlightBidder?: string | null
  onOpenContract: (ea: string) => void
  onOpenBidder: (name: string) => void
}

/** Percent vs. typical, e.g. "+12%" / "-6%". */
function formatVs(vs: number) {
  return `${vs >= 0 ? '+' : ''}${Math.round(vs * 100)}%`
}

export function FamilyTable({ rows, highlightBidder, onOpenContract, onOpenBidder }: FamilyTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'bidDate', dir: 'desc' })

  const augmented: Row[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        band: quantityBand(r.itemCode, r.quantity),
        vs: vsTypical(r.itemCode, r.quantity, r.escalatedPrice),
      })),
    [rows],
  )

  const sorted = useMemo(() => {
    const factor = sort.dir === 'asc' ? 1 : -1
    const val = (r: Row) => (sort.key === 'vsTypical' ? r.vs : r[sort.key])
    return [...augmented].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      // Rows with no value (e.g. vs. typical for thin item codes) always sort last.
      if (av == null && bv == null) return a.rank - b.rank
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return cmp * factor || a.rank - b.rank
    })
  }, [augmented, sort])

  const toggle = (key: SortKey, numeric?: boolean) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: numeric ? 'desc' : 'asc' }))

  return (
    <div className="max-h-[560px] overflow-auto">
      {/* Fixed layout + colgroup: column widths come from here, never from the rows shown,
          so switching the unit filter, the band filter, sorting, or filtering never moves a column. */}
      <table className="w-full min-w-[1458px] table-fixed border-collapse text-[13px]">
        <colgroup>
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 88 }} />
          <col />
          <col style={{ width: 180 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 112 }} />
        </colgroup>
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const sortable = col.sortable !== false
              const active = sortable && sort.key === (col.key as SortKey)
              const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  title={col.tooltip}
                  className={cn(
                    'sticky top-0 z-[1] h-9 border-b bg-surface font-medium',
                    // The rank columns are narrow and not sortable; tighter padding keeps
                    // their longer labels from ever truncating.
                    sortable ? 'px-3' : 'px-2',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(col.key as SortKey, col.numeric)}
                      className={cn(
                        'flex w-full items-center whitespace-nowrap rounded-sm text-[11px] uppercase tracking-wider transition-colors hover:text-foreground',
                        active ? 'text-foreground' : 'text-muted-foreground',
                        col.numeric ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <span className="min-w-0 truncate">{col.label}</span>
                      {/* Fixed 16px icon slot on the right of every sortable header, so the
                          label never shifts whether or not the column is the active sort. */}
                      <span className="flex w-4 shrink-0 items-center justify-center">
                        <Icon aria-hidden="true" className={cn('size-3', !active && 'opacity-50')} />
                      </span>
                    </button>
                  ) : (
                    <span
                      className={cn(
                        'flex w-full items-center whitespace-nowrap text-[11px] uppercase tracking-wider text-muted-foreground',
                        col.numeric ? 'justify-end' : 'justify-start',
                      )}
                    >
                      {col.label}
                    </span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const highlighted = highlightBidder != null && row.bidder === highlightBidder
            return (
              <tr
                key={row.id}
                tabIndex={0}
                aria-label={`Open contract ${row.ea}`}
                onClick={() => onOpenContract(row.ea)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpenContract(row.ea)
                  }
                }}
                className={cn(
                  'cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.05] focus-visible:shadow-[inset_2px_0_0_var(--primary)] focus-visible:outline-none',
                  highlighted && 'bg-primary/[0.07]',
                )}
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-foreground">
                  <span data-morph="">{row.ea}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-subtle-foreground">{row.bidDate}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-subtle-foreground">
                  {formatDistrict(row.district)}
                </td>
                <td className="px-3 py-1.5">
                  <BidderLink
                    name={row.bidder}
                    onOpen={onOpenBidder}
                    title={row.bidder}
                    className={cn('block w-full truncate', highlighted ? 'text-foreground' : 'text-subtle-foreground')}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-subtle-foreground">{row.itemCode}</td>
                <td className="px-3 py-1.5 leading-snug text-foreground">
                  <span className="block truncate" title={row.description}>
                    {row.description}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-subtle-foreground">
                  {formatQty(row.quantity)}
                  <span className="ml-1 text-muted-foreground">{row.unit}</span>
                  <span className="ml-1.5 text-[11px] text-muted-foreground">{`· ${row.band}`}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-medium text-foreground">
                  {formatUsd(row.unitPrice)}
                </td>
                <td
                  className={cn(
                    'whitespace-nowrap px-3 py-1.5 text-right font-mono',
                    row.vs == null || Math.abs(row.vs) <= 0.1
                      ? 'text-muted-foreground'
                      : row.vs > 0.1
                        ? 'text-up'
                        : 'text-down',
                  )}
                >
                  {row.vs == null ? '—' : formatVs(row.vs)}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">
                  <span className={row.itemRank === 1 ? 'text-primary' : 'text-subtle-foreground'}>{`#${row.itemRank}`}</span>
                  <span className="text-muted-foreground">{` of ${row.itemRankOf}`}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-muted-foreground">
                  {`#${row.rank} of ${row.contractBidders}`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No line items match these filters.</p>
      )}
    </div>
  )
}
