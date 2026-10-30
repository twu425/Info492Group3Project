'use client'

import { ChevronDown, ChevronRight, ChevronUp, Download, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BidItem } from '@/lib/bidgrid/build-tools'
import { quantityBand, vsTypical, type PriceEstimate } from '@/lib/bidgrid/estimate'
import { FAMILY_COLORS, formatQty, formatUnitPrice, formatUsd, formatUsdWhole, itemLabel } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

export interface PricedBidItem extends BidItem {
  estimate: PriceEstimate | null
}

interface BidItemsProps {
  rows: PricedBidItem[]
  expanded: boolean
  onToggleExpanded: () => void
  onQuantityChange: (id: string, quantity: number) => void
  onUnitPriceChange: (id: string, unitPrice: number) => void
  onUnitPriceReset: (id: string) => void
  onDeleteItem: (id: string) => void
  onOpenContract: (ea: string) => void
  onOpenFamily: (row: PricedBidItem) => void
}

const dash = <span className="text-muted-foreground">{'—'}</span>

const round2 = (n: number) => Math.round(n * 100) / 100

/** Short label for where a quantity came from, shown under the quantity cell. */
const QTY_SOURCE_LABEL: Record<NonNullable<PricedBidItem['quantitySource']>, string> = {
  user: 'you',
  similar: 'from similar',
  assumed: 'assumed',
}

/** Current unit price: the user's override if set, otherwise the comparable P50, rounded to the cent. */
function effectivePrice(r: PricedBidItem): number | null {
  if (r.unitPrice != null) return round2(r.unitPrice)
  return r.estimate?.p50 != null ? round2(r.estimate.p50) : null
}

/** qty × the rounded displayed unit price, so the total always matches what's shown. */
function rowTotal(r: PricedBidItem): number | null {
  const price = effectivePrice(r)
  return price != null ? price * r.quantity : null
}

function totals(rows: PricedBidItem[]) {
  let estimate = 0
  let p25Total = 0
  let p75Total = 0
  for (const r of rows) {
    const price = effectivePrice(r)
    if (price != null) estimate += price * r.quantity
    if (r.estimate?.p25 != null) p25Total += round2(r.estimate.p25) * r.quantity
    if (r.estimate?.p75 != null) p75Total += round2(r.estimate.p75) * r.quantity
  }
  return { estimate, p25Total, p75Total }
}

function exportCsv(rows: PricedBidItem[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const fixed = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2))
  const lines = [
    ['Item code', 'Description', 'Quantity', 'Unit', 'Unit price', 'P25', 'P75', 'Total', 'Comparables'],
    ...rows.map((r) => [
      r.itemCode,
      r.description,
      r.quantity,
      r.unit,
      fixed(effectivePrice(r)),
      fixed(r.estimate?.p25),
      fixed(r.estimate?.p75),
      fixed(rowTotal(r)),
      r.estimate?.comparables.length ?? 0,
    ]),
  ]
  const blob = new Blob([lines.map((l) => l.map(esc).join(',')).join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bidgrid-estimate.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Display text and the edit input share identical typography (font, size, line
 * height, right alignment) with no border and zero padding, so switching to edit
 * mode never changes the row height or column width. Focus shows as an outline.
 */
const EDIT_INPUT =
  'w-full border-0 bg-transparent p-0 text-right font-mono text-xs tabular-nums leading-tight text-foreground outline-offset-2'

function useCellEdit(onCommit: (text: string) => void) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)
  const start = (raw: string) => {
    setDraft(raw)
    setEditing(true)
  }
  const inputProps = {
    autoFocus: true,
    value: draft,
    inputMode: 'decimal' as const,
    onFocus: (e: React.FocusEvent<HTMLInputElement>) => e.currentTarget.select(),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => {
      if (cancelled.current) cancelled.current = false
      else onCommit(draft)
      setEditing(false)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        cancelled.current = true
        e.currentTarget.blur()
      }
    },
  }
  return { editing, start, inputProps }
}

function QuantityCell({ value, onCommit, label }: { value: number; onCommit: (n: number) => void; label: string }) {
  const { editing, start, inputProps } = useCellEdit((text) => {
    const n = Number(text.replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n)
  })
  if (editing) return <input aria-label={label} {...inputProps} className={EDIT_INPUT} />
  return (
    <button
      type="button"
      onClick={() => start(String(value))}
      aria-label={`${label}: ${formatQty(value)}. Click to edit.`}
      className="flex w-full cursor-text items-center justify-end font-mono text-xs leading-tight tabular-nums text-foreground"
    >
      <span className="whitespace-nowrap">{formatQty(value)}</span>
    </button>
  )
}

function UnitPriceCell({
  value,
  overridden,
  needsPrice,
  onCommit,
  onReset,
  label,
}: {
  value: number | null
  overridden: boolean
  /** Lump-sum item with no comparable price for a project this size — prompt for a figure. */
  needsPrice: boolean
  onCommit: (n: number) => void
  onReset: () => void
  label: string
}) {
  const { editing, start, inputProps } = useCellEdit((text) => {
    const n = Number(text.replace(/[,$\s]/g, ''))
    if (Number.isFinite(n) && n > 0) onCommit(round2(n))
  })
  if (editing) return <input aria-label={label} {...inputProps} className={EDIT_INPUT} />
  const showNeedsPrice = value == null && needsPrice
  return (
    <div className="flex w-full items-center justify-end gap-1">
      {overridden && <span aria-hidden="true" title="Edited" className="size-1.5 shrink-0 rounded-full bg-primary" />}
      <button
        type="button"
        onClick={() => start(value != null ? String(value) : '')}
        title={showNeedsPrice ? 'No comparable lump-sum price for a project this size. Click to enter one.' : undefined}
        aria-label={`${label}: ${value != null ? formatUsd(value) : showNeedsPrice ? 'needs a price' : 'not set'}. Click to edit.`}
        className={cn(
          'cursor-text whitespace-nowrap font-mono text-xs leading-tight tabular-nums',
          showNeedsPrice ? 'font-medium text-up' : 'text-foreground',
        )}
      >
        {value != null ? formatUsd(value) : showNeedsPrice ? 'Needs price' : '—'}
      </button>
    </div>
  )
}

const LUMP_SUM_NOTE = 'Lump sum: based on similar-sized projects.'

function MarketRange({
  p25,
  p75,
  price,
  lumpSum,
}: {
  p25: number | null
  p75: number | null
  price: number | null
  lumpSum: boolean
}) {
  if (p25 == null || p75 == null)
    return lumpSum ? (
      <span title={`${LUMP_SUM_NOTE} No comparable range for a project this size.`} className="text-muted-foreground">
        {'—'}
      </span>
    ) : (
      dash
    )
  const lo = round2(p25)
  const hi = round2(p75)
  const outside = price != null && (price < lo || price > hi)
  const span = hi - lo
  const pct = price == null || span <= 0 ? 50 : Math.min(100, Math.max(0, ((price - lo) / span) * 100))
  const title = lumpSum
    ? `${LUMP_SUM_NOTE}${outside ? ' Outside typical range.' : ''}`
    : outside
      ? 'Outside typical range.'
      : undefined
  return (
    <div className="flex flex-col gap-1" title={title}>
      <span
        className={cn(
          'whitespace-nowrap font-mono text-[11px] tabular-nums',
          outside ? 'text-up' : 'text-muted-foreground',
        )}
      >
        {`${formatUsd(lo)}–${formatUsd(hi)}`}
      </span>
      <div className="relative h-1 rounded-full bg-foreground/[0.08]">
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
            outside ? 'bg-up' : 'bg-foreground/50',
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function BidItems({
  rows,
  expanded,
  onToggleExpanded,
  onQuantityChange,
  onUnitPriceChange,
  onUnitPriceReset,
  onDeleteItem,
  onOpenContract,
  onOpenFamily,
}: BidItemsProps) {
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())
  const [scrolledX, setScrolledX] = useState(false)
  const [atRightEnd, setAtRightEnd] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevCount = useRef(rows.length)
  const t = totals(rows)
  const toggleRow = (id: string) =>
    setOpenRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Reveal a newly added row (they append to the end) before its highlight fades.
  useEffect(() => {
    if (rows.length > prevCount.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
    prevCount.current = rows.length
  }, [rows.length])

  // Shadows on the sticky columns only while content is hidden under them.
  const updateShadows = () => {
    const el = scrollRef.current
    if (!el) return
    setScrolledX(el.scrollLeft > 0)
    setAtRightEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1)
  }
  useEffect(updateShadows, [expanded, rows])
  const leftShadow = scrolledX ? 'shadow-[8px_0_12px_-8px_rgba(0,0,0,0.55)]' : ''
  const rightShadow = !atRightEnd ? 'shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.55)]' : ''

  return (
    <section aria-labelledby="bid-items-heading" className="flex shrink-0 flex-col border-t bg-surface">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 id="bid-items-heading" className="eyebrow">
            Bid items
          </h3>
          <span className="font-mono text-xs text-muted-foreground">{rows.length}</span>
          {!expanded && rows.length > 0 && (
            <span className="flex items-baseline gap-1.5 truncate text-xs text-muted-foreground">
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              Est
              <span className="font-mono text-foreground">{formatUsdWhole(t.estimate)}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={rows.length === 0}
            onClick={(e) => {
              exportCsv(rows)
              if (e.detail) e.currentTarget.blur()
            }}
          >
            <Download aria-hidden="true" />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              onToggleExpanded()
              if (e.detail) e.currentTarget.blur()
            }}
            aria-label={expanded ? 'Collapse bid items' : 'Expand bid items'}
          >
            {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </Button>
        </div>
      </header>

      {expanded && rows.length === 0 && (
        <p className="px-4 py-6 text-center text-sm leading-relaxed text-muted-foreground">
          No bid items yet. Describe the work in the chat and items will appear here.
        </p>
      )}

      {expanded && rows.length > 0 && (
        <div ref={scrollRef} onScroll={updateShadows} className="bidgrid-scroll min-h-0 max-h-[40dvh] overflow-auto border-t">
          <table className="min-w-full border-collapse text-xs">
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 72 }} />
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 64 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr className="text-[11px] text-muted-foreground">
                <th scope="col" className="sticky left-0 top-0 z-[3] border-b bg-surface py-1.5 pl-2">
                  <span className="sr-only">Expand</span>
                </th>
                <th
                  scope="col"
                  className={cn('sticky left-[28px] top-0 z-[3] border-b bg-surface px-2 py-1.5 text-left font-medium', leftShadow)}
                >
                  Code
                </th>
                <th scope="col" className="sticky top-0 z-[2] min-w-[240px] whitespace-nowrap border-b bg-surface px-2 py-1.5 text-left font-medium">
                  Description
                </th>
                <th scope="col" className="sticky top-0 z-[2] border-b bg-surface px-2 py-1.5 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="sticky top-0 z-[2] border-b bg-surface px-2 py-1.5 text-left font-medium">
                  Unit
                </th>
                <th scope="col" className="sticky top-0 z-[2] border-b bg-surface px-2 py-1.5 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="sticky top-0 z-[2] border-b bg-surface px-2 py-1.5 text-left font-medium">
                  Market range
                </th>
                <th
                  scope="col"
                  className={cn('sticky right-[40px] top-0 z-[3] border-b bg-surface px-2 py-1.5 text-right font-medium', rightShadow)}
                >
                  Total
                </th>
                <th scope="col" className="sticky right-0 top-0 z-[3] border-b bg-surface">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = openRows.has(r.id)
                const est = r.estimate
                const price = effectivePrice(r)
                const overridden = r.unitPrice != null
                const lumpSum = r.unit === 'LS'
                const needsPrice = lumpSum && price == null
                const total = rowTotal(r)
                return (
                  <Fragment key={r.id}>
                    <tr
                      tabIndex={0}
                      aria-label={`${itemLabel(r.description)} row. Press Delete to remove.`}
                      onKeyDown={(e) => {
                        if ((e.key === 'Delete' || e.key === 'Backspace') && e.target === e.currentTarget) {
                          e.preventDefault()
                          onDeleteItem(r.id)
                        }
                      }}
                      className="group bid-row-new border-b focus-visible:bg-foreground/[0.04] focus-visible:shadow-[inset_2px_0_0_var(--primary)] focus-visible:outline-none"
                    >
                      <td className="sticky left-0 z-[1] bg-surface py-1 pl-2 align-middle">
                        <button
                          type="button"
                          onClick={() => toggleRow(r.id)}
                          aria-expanded={isOpen}
                          aria-label={`${isOpen ? 'Hide' : 'Show'} comparables for ${itemLabel(r.description)}`}
                          className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                        >
                          <ChevronRight aria-hidden="true" className={cn('size-3.5 transition-transform', isOpen && 'rotate-90')} />
                        </button>
                      </td>
                      <td className={cn('sticky left-[28px] z-[1] bg-surface px-2 py-1 align-middle', leftShadow)}>
                        <button
                          type="button"
                          onClick={() => onOpenFamily(r)}
                          className="flex w-full items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                        >
                          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ background: FAMILY_COLORS[r.family] }} />
                          <span className="font-mono text-muted-foreground">{r.itemCode}</span>
                        </button>
                      </td>
                      <td className="min-w-[240px] whitespace-nowrap px-2 py-1 align-middle">
                        <button
                          type="button"
                          onClick={() => onOpenFamily(r)}
                          className="text-left text-subtle-foreground hover:text-foreground"
                        >
                          {itemLabel(r.description)}
                        </button>
                      </td>
                      <td className="cursor-text px-2 py-1 text-right align-middle hover:bg-foreground/[0.07]">
                        <QuantityCell
                          value={r.quantity}
                          label={`Quantity for ${itemLabel(r.description)}`}
                          onCommit={(n) => onQuantityChange(r.id, n)}
                        />
                        {r.quantitySource && (
                          <div className="mt-0.5 text-[10px] leading-none text-muted-foreground" title="Source of this quantity">
                            {QTY_SOURCE_LABEL[r.quantitySource]}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1 align-middle font-mono text-muted-foreground">{r.unit}</td>
                      <td className="cursor-text px-2 py-1 text-right align-middle hover:bg-foreground/[0.07]">
                        <UnitPriceCell
                          value={price}
                          overridden={overridden}
                          needsPrice={needsPrice}
                          label={`Unit price for ${itemLabel(r.description)}`}
                          onCommit={(n) => onUnitPriceChange(r.id, n)}
                          onReset={() => onUnitPriceReset(r.id)}
                        />
                      </td>
                      <td className="px-2 py-1 align-middle">
                        <MarketRange p25={est?.p25 ?? null} p75={est?.p75 ?? null} price={price} lumpSum={lumpSum} />
                      </td>
                      <td className={cn('sticky right-[40px] z-[1] whitespace-nowrap bg-surface px-2 py-1 text-right align-middle font-mono text-foreground', rightShadow)}>
                        {total != null ? formatUsdWhole(total) : dash}
                      </td>
                      <td className="sticky right-0 z-[1] bg-surface px-1 py-1 align-middle">
                        <button
                          type="button"
                          onClick={() => onDeleteItem(r.id)}
                          aria-label={`Remove ${itemLabel(r.description)}`}
                          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b bg-background/60">
                        <td />
                        <td colSpan={8} className="py-2 pr-4">
                          {est && est.comparables.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              <p className="text-[11px] text-muted-foreground">
                                {`${est.comparables.length} comparable bids within 50 mi, last 5 years`}
                                {est.quantityRange &&
                                  `, ${formatQty(est.quantityRange[0])}–${formatQty(est.quantityRange[1])} ${r.unit}`}
                                {'. Prices escalated to the current quarter.'}
                              </p>
                              <ul className="flex flex-col">
                                {est.comparables.map((c) => {
                                  const band = quantityBand(r.itemCode, c.quantity)
                                  const vt = vsTypical(r.itemCode, c.quantity, c.escalatedPrice)
                                  return (
                                  <li key={c.id}>
                                    <button
                                      type="button"
                                      onClick={() => onOpenContract(c.ea)}
                                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-baseline gap-3 rounded-sm px-1.5 py-1 text-left font-mono text-[11px] hover:bg-foreground/[0.05]"
                                    >
                                      <span className="truncate text-foreground">
                                        {c.ea}
                                        <span className="text-muted-foreground">{` · ${c.bidDate} · #${c.rank} · ${Math.round(c.miles)} mi`}</span>
                                      </span>
                                      <span className="text-right text-muted-foreground">{`${formatQty(c.quantity)} ${c.unit} · ${band}`}</span>
                                      <span className="text-right text-muted-foreground">{formatUnitPrice(c.unitPrice)}</span>
                                      <span className="text-right text-foreground">{formatUnitPrice(c.escalatedPrice)}</span>
                                      <span
                                        className={cn(
                                          'w-10 text-right',
                                          vt == null || Math.abs(vt) <= 0.1
                                            ? 'text-muted-foreground'
                                            : vt > 0.1
                                              ? 'text-up'
                                              : 'text-down',
                                        )}
                                      >
                                        {vt == null ? '—' : `${vt >= 0 ? '+' : ''}${Math.round(vt * 100)}%`}
                                      </span>
                                    </button>
                                  </li>
                                  )
                                })}
                              </ul>
                            </div>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">
                              No comparable bids within 50 miles in the last 5 years.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7} className="sticky bottom-0 z-[2] border-t bg-surface px-4 py-2.5">
                  <span className="flex items-baseline gap-2 whitespace-nowrap">
                    <span className="text-xs font-medium text-foreground">Your estimate</span>
                    <span className="text-[11px] text-muted-foreground">
                      {'Market range '}
                      <span className="font-mono text-subtle-foreground">{`${formatUsdWhole(t.p25Total)} – ${formatUsdWhole(t.p75Total)}`}</span>
                    </span>
                  </span>
                </td>
                <td className={cn('sticky bottom-0 right-[40px] z-[3] whitespace-nowrap border-t bg-surface px-2 py-2.5 text-right', rightShadow)}>
                  <span className="font-mono text-base font-medium text-foreground">{formatUsdWhole(t.estimate)}</span>
                </td>
                <td className="sticky bottom-0 right-0 z-[3] border-t bg-surface" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
