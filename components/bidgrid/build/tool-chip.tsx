import { ITEM_CATALOG } from '@/lib/bidgrid/data'
import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import { formatQty, itemLabel } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

type Part = BuildUIMessage['parts'][number]

function catalogLabel(code: string | undefined, fallback: string) {
  const item = code ? ITEM_CATALOG.find((i) => i.code === code) : undefined
  return item ? itemLabel(item.description) : fallback
}

function readSummary(output: Record<string, unknown> | undefined, key: string) {
  const s = output?.[key] as Record<string, unknown> | undefined
  if (!s) return undefined
  return {
    name: typeof s.name === 'string' ? s.name : undefined,
    qty: typeof s.qty === 'number' ? s.qty : undefined,
    unit: typeof s.unit === 'string' ? s.unit : undefined,
  }
}

function describe(part: Part): { label: string; pending: boolean; failed: boolean } | null {
  if (!('toolCallId' in part) || !part.type.startsWith('tool-')) return null
  const pending = part.state === 'input-streaming' || part.state === 'input-available'
  const raw = part.state === 'output-available' ? (part.output as Record<string, unknown> | undefined) : undefined
  const failed = part.state === 'output-error' || (!!raw && 'error' in raw)
  const output = raw && !('error' in raw) ? raw : undefined
  const input = part.input as Record<string, unknown> | undefined
  const qtyUnit = (s: { qty?: number; unit?: string } | undefined) =>
    s?.qty != null ? ` · ${formatQty(s.qty)} ${s.unit ?? ''}`.trimEnd() : ''

  switch (part.type) {
    case 'tool-searchComparables': {
      const desc = output && typeof output.description === 'string' ? itemLabel(output.description) : undefined
      const name = desc ?? catalogLabel(input?.itemCode as string | undefined, String(input?.itemFamily ?? 'items'))
      const qty = input?.quantity ? ` · ${formatQty(Number(input.quantity))}` : ''
      const unit = output?.unit ? ` ${output.unit}` : ''
      const count = output ? ` · ${output.comparableCount ?? 0} comps` : ''
      return { label: `${pending ? 'Searching' : 'Searched'} · ${name}${qty}${unit}${count}`, pending, failed }
    }
    case 'tool-addLineItem': {
      const item = readSummary(output, 'item')
      const name = item?.name ?? catalogLabel(input?.itemCode as string | undefined, String(input?.itemFamily ?? 'item'))
      const fallbackQty = input?.quantity ? ` · ${formatQty(Number(input.quantity))} ${String(input.unit ?? '')}`.trimEnd() : ''
      const verb = pending ? 'Adding' : output?.status === 'already_exists' ? 'Already on list' : 'Added'
      return { label: `${verb} · ${name}${item ? qtyUnit(item) : fallbackQty}`, pending, failed }
    }
    case 'tool-updateLineItem': {
      if (output?.status === 'not_found') return { label: 'Item not found', pending, failed }
      const after = readSummary(output, 'after')
      return { label: `${pending ? 'Updating' : 'Updated'} · ${after?.name ?? 'item'}${qtyUnit(after)}`, pending, failed }
    }
    case 'tool-removeLineItem': {
      if (output?.status === 'not_found') return { label: 'Item not found', pending, failed }
      const item = readSummary(output, 'item')
      return { label: `${pending ? 'Removing' : 'Removed'} · ${item?.name ?? 'item'}`, pending, failed }
    }
  }
  return null
}

export function ToolChip({ part }: { part: Part }) {
  const info = describe(part)
  if (!info) return null
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-sm bg-foreground/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground',
        info.failed && 'text-subtle-foreground line-through decoration-muted-foreground/60',
      )}
    >
      {info.pending && <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
      <span className="truncate">{info.label}</span>
    </span>
  )
}
