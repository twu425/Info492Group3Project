'use client'

import { formatUsd, fullItemName } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

export interface FamilyItemSummary {
  code: string
  description: string
  unit: string
  bids: number
  contracts: number
  /** Median unit price across all bids for this item code. */
  median: number
}

const COLUMNS: { label: string; numeric?: boolean }[] = [
  { label: 'Item' },
  { label: 'Description' },
  { label: 'Unit' },
  { label: 'Bids', numeric: true },
  { label: 'Contracts', numeric: true },
  { label: 'Median unit price', numeric: true },
]

/**
 * Every item in the family (independent of the unit/item currently in view).
 * Clicking a row opens that item as a new view.
 */
export function FamilyItemsTable({
  items,
  currentCode,
  onOpen,
}: {
  items: FamilyItemSummary[]
  currentCode: string
  onOpen: (code: string, description: string) => void
}) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead>
          <tr className="text-left">
            {COLUMNS.map((col) => (
              <th
                key={col.label}
                scope="col"
                className={cn(
                  'sticky top-0 z-[1] h-9 border-b bg-surface px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                  col.numeric && 'text-right',
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const isCurrent = it.code === currentCode
            return (
              <tr
                key={it.code}
                tabIndex={0}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Open item ${it.code}`}
                onClick={() => onOpen(it.code, it.description)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onOpen(it.code, it.description)
                  }
                }}
                className={cn(
                  'cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.05] focus-visible:shadow-[inset_2px_0_0_var(--primary)] focus-visible:outline-none',
                  isCurrent && 'bg-foreground/[0.05]',
                )}
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-foreground">{it.code}</td>
                <td className="px-3 py-1.5 leading-snug text-foreground">{fullItemName(it.description)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-subtle-foreground">{it.unit}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-subtle-foreground">{it.bids}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-subtle-foreground">{it.contracts}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-foreground">{formatUsd(it.median)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
