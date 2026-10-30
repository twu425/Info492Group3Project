import { catalogByCode } from '@/lib/bidgrid/catalog'
import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import { formatQty, itemLabel } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

type Part = BuildUIMessage['parts'][number]

function catalogLabel(code: string | undefined, fallback: string) {
  const item = code ? catalogByCode.get(code) : undefined
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

  const count = (key: string) => (Array.isArray(output?.[key]) ? (output![key] as unknown[]).length : undefined)

  switch (part.type) {
    case 'tool-searchSimilarProjects': {
      const n = count('projects')
      if (!pending && (failed || n === 0)) return { label: 'No similar projects nearby', pending: false, failed: true }
      return { label: pending ? 'Finding similar projects' : `Found ${n} similar project${n === 1 ? '' : 's'}`, pending, failed }
    }
    case 'tool-searchCatalog': {
      const desc = input?.description ? itemLabel(String(input.description)) : 'items'
      const n = count('candidates')
      if (!pending && failed) return { label: `No catalog match · ${desc}`, pending: false, failed: true }
      return { label: pending ? `Searching catalog · ${desc}` : `Catalog · ${desc} · ${n} match${n === 1 ? '' : 'es'}`, pending, failed }
    }
    case 'tool-queryBids': {
      const purpose = input?.purpose ? String(input.purpose) : 'the bid data'
      if (!pending && failed) return { label: `Query failed · ${purpose}`, pending: false, failed: true }
      const rows = output && typeof output.rowCount === 'number' ? ` · ${output.rowCount} row${output.rowCount === 1 ? '' : 's'}` : ''
      return { label: `${pending ? 'Querying' : 'Queried'} · ${purpose}${pending ? '' : rows}`, pending, failed }
    }
    case 'tool-computeQuantity': {
      if (!pending && failed) return { label: 'Couldn’t compute', pending: false, failed: true }
      const op = input?.operation ? String(input.operation) : 'quantity'
      const q = output && typeof output.quantity === 'number' ? ` · ${formatQty(output.quantity)} ${output.unit ?? ''}`.trimEnd() : ''
      return { label: `${pending ? 'Computing' : 'Computed'} · ${op}${q}`, pending, failed }
    }
    case 'tool-checkEstimate': {
      if (pending) return { label: 'Reviewing estimate', pending, failed }
      const n = Array.isArray(output?.findings) ? (output!.findings as unknown[]).length : undefined
      if (n === 0) return { label: 'Reviewed · no issues', pending, failed }
      return { label: `Reviewed · ${n} finding${n === 1 ? '' : 's'}`, pending, failed }
    }
    case 'tool-searchBidders': {
      if (!pending && failed) return { label: 'Bidder lookup failed', pending: false, failed: true }
      const n = Array.isArray(output?.bidders) ? (output!.bidders as unknown[]).length : undefined
      return { label: pending ? 'Finding bidders' : `Bidders · ${n ?? 0} firm${n === 1 ? '' : 's'}`, pending, failed }
    }
    case 'tool-locatePostmiles': {
      if (!pending && failed) return { label: 'Postmile lookup unavailable', pending: false, failed: true }
      if (pending) return { label: 'Locating postmiles', pending, failed }
      const route = output && typeof output.route === 'number' && output.route ? `Route ${output.route}` : 'location'
      if (Array.isArray(output?.candidates) && (output.candidates as unknown[]).length > 1)
        return { label: `${route} · multiple routes nearby`, pending, failed }
      const seg = output?.segment as { lengthMi?: number } | undefined
      const detail = seg && typeof seg.lengthMi === 'number' ? ` · ${seg.lengthMi} mi` : ''
      return { label: `Located · ${route}${detail}`, pending, failed }
    }
    case 'tool-showSegment': {
      const label = input?.label ? String(input.label) : 'segment'
      return { label: `${pending ? 'Drawing' : 'Drew'} · ${label}`, pending, failed }
    }
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
      const verb = pending
        ? 'Adding'
        : failed
          ? 'Couldn’t add'
          : output?.status === 'already_exists'
            ? 'Already on list'
            : 'Added'
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
