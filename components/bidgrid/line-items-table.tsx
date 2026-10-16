'use client'

import { cn } from '@/lib/utils'
import type { LineItem } from '@/lib/bidgrid/data'
import { FAMILY_COLORS, formatQty, formatUsd } from '@/lib/bidgrid/format'

interface LineItemsTableProps {
  items: LineItem[]
  onSelectItem: (item: LineItem) => void
}

const TH = 'h-8 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground'

export function LineItemsTable({ items, onSelectItem }: LineItemsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full min-w-[480px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b text-left">
            <th scope="col" className={TH}>Code</th>
            <th scope="col" className={TH}>Description</th>
            <th scope="col" className={cn(TH, 'text-right')}>Qty</th>
            <th scope="col" className={TH}>Unit</th>
            <th scope="col" className={cn(TH, 'text-right')}>Unit price</th>
            <th scope="col" className={cn(TH, 'text-right')}>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            return (
              <tr
                key={item.itemCode}
                tabIndex={0}
                aria-label={`Open ${item.family} price trend for item ${item.itemCode}`}
                onClick={() => onSelectItem(item)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectItem(item)
                  }
                }}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.05] focus-visible:shadow-[inset_2px_0_0_var(--primary)] focus-visible:outline-none"
              >
                <td className="px-2.5 py-1.5 align-top">
                  <span data-morph="" className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: FAMILY_COLORS[item.family] }}
                    />
                    <span className="font-mono text-subtle-foreground">{item.itemCode}</span>
                  </span>
                </td>
                <td className="px-2.5 py-1.5 align-top leading-snug text-foreground">{item.description}</td>
                <td className="px-2.5 py-1.5 text-right align-top font-mono text-subtle-foreground">
                  {formatQty(item.quantity)}
                </td>
                <td className="px-2.5 py-1.5 align-top text-muted-foreground">{item.unit}</td>
                <td className="px-2.5 py-1.5 text-right align-top font-mono font-medium text-foreground">
                  {formatUsd(item.unitPrice)}
                </td>
                <td className="px-2.5 py-1.5 text-right align-top font-mono text-subtle-foreground">
                  {formatUsd(item.totalPrice)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
