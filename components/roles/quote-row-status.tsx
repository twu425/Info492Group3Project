'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatUnitPrice } from '@/lib/bidgrid/format'
import { comparePrice, priceCheckLabel } from '@/lib/roles'
import type { QuoteRequest } from '@/lib/roles-store'
import { cn } from '@/lib/utils'

const copy = {
  waiting: (id: string) => `Quote requested (${id}) · waiting on the subcontractor`,
  question: (id: string) => `The subcontractor has a question on ${id}`,
  reply: 'Reply in Quotes',
  quote: 'Sub’s quote',
  use: 'Use this price',
  decline: 'Decline',
  notQuoted: (id: string) => `Not quoted by the subcontractor (${id})`,
  used: (price: string, id: string) => `Using the sub’s quoted ${price} (${id})`,
  declined: (price: string, id: string) => `Declined the sub’s quoted ${price} (${id})`,
}

interface QuoteRowStatusProps {
  request: QuoteRequest
  itemId: string
  /** Each returns an error message, or null when it worked. */
  onUse: (price: number) => Promise<string | null>
  onDecline: () => Promise<string | null>
}

/** A thin line under a bid row: where its quote request stands, and Use / Decline once a price is back. */
export function QuoteRowStatus({ request: r, itemId, onUse, onDecline }: QuoteRowStatusProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const item = r.items.find((i) => i.itemId === itemId)
  const price = r.quote?.prices[itemId]
  const decision = r.decisions[itemId]

  async function act(run: () => Promise<string | null>) {
    setBusy(true)
    setError(await run())
    setBusy(false)
  }

  let content: React.ReactNode
  if (r.status === 'sent') content = copy.waiting(r.id)
  else if (r.status === 'needs_info')
    content = (
      <>
        <span className="text-primary">{copy.question(r.id)}</span>
        <Link href="/quotes" className="ml-2 font-medium text-foreground underline underline-offset-4">
          {copy.reply}
        </Link>
      </>
    )
  else if (price == null) content = copy.notQuoted(r.id)
  else if (decision === 'used') content = copy.used(formatUnitPrice(price), r.id)
  else if (decision === 'declined') content = copy.declined(formatUnitPrice(price), r.id)
  else {
    const check = comparePrice(price, item?.evidence ?? null)
    content = (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-foreground">
          {copy.quote}: <span className="font-mono">{formatUnitPrice(price)}</span>
        </span>
        <span className={cn(check.kind === 'within' ? 'text-muted-foreground' : 'text-up')}>{priceCheckLabel(check)}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => onUse(price))}
          className="rounded-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-60"
        >
          {copy.use}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(onDecline)}
          className="rounded-sm font-medium text-subtle-foreground underline-offset-4 hover:underline disabled:opacity-60"
        >
          {copy.decline}
        </button>
      </span>
    )
  }

  return (
    <div className="text-[11px] text-muted-foreground">
      {content}
      {error && (
        <span role="alert" className="ml-2 text-up">
          {error}
        </span>
      )}
    </div>
  )
}
