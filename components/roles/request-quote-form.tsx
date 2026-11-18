'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { PricedBidItem } from '@/components/bidgrid/build/bid-items'
import { formatQty, itemLabel } from '@/lib/bidgrid/format'
import { draftRequest, sendRequest } from '@/lib/roles-actions'
import type { RequestInput, RequestItem } from '@/lib/roles'

const copy = {
  title: 'Request quotes from a subcontractor',
  privacy: 'Your unit prices are never sent. The sub sees the items, quantities, location, scope notes and public past bids.',
  pickItems: 'Items to quote',
  messageLabel: 'Message to the subcontractor',
  draft: 'Draft with assistant',
  drafting: 'Drafting…',
  draftNote: 'Drafted by the assistant. Check and edit it before you send.',
  pickFirst: 'Pick at least one item.',
  send: 'Send to subcontractor',
  sending: 'Sending…',
  cancel: 'Cancel',
  sent: (id: string) => `${id} sent to the subcontractor. Their prices will show on these rows when they reply.`,
  seeQuotes: 'See all quotes',
  close: 'Close',
  fewPastBids: (n: number) => (n === 0 ? 'no past bids' : `${n} past bid${n === 1 ? '' : 's'}`),
}

/** One bid row as sent to the sub: never its unit price. */
export function toRequestItem(r: PricedBidItem): RequestItem {
  const e = r.estimate
  return {
    itemId: r.id,
    itemCode: r.itemCode,
    description: itemLabel(r.description),
    quantity: r.quantity,
    unit: r.unit,
    evidence: e ? { low: e.p25, typical: e.p50, high: e.p75, pastBids: e.comparables.length } : null,
  }
}

interface RequestQuoteFormProps {
  rows: PricedBidItem[]
  /** Item ids picked when the form opens (from a finding), or none. */
  preselect: string[]
  estimateName: string
  location: string
  scope: string[]
  /** Saves the estimate if it isn't saved yet, and returns its id. */
  ensureEstimateId: () => string
  onSent: () => void
  onClose: () => void
}

/** The estimator picks items; the assistant drafts the cover message; only the estimator sends. */
export function RequestQuoteForm({ rows, preselect, estimateName, location, scope, ensureEstimateId, onSent, onClose }: RequestQuoteFormProps) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect))
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [sentId, setSentId] = useState<string | null>(null)

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const request = (estimateId: string): RequestInput => ({
    estimateId,
    estimateName,
    location,
    scope,
    items: rows.filter((r) => picked.has(r.id)).map(toRequestItem),
  })

  async function getDraft() {
    if (!picked.size) return setNote(copy.pickFirst)
    setBusy('draft')
    setNote(null)
    const res = await draftRequest(request(''))
    if ('text' in res) {
      setText(res.text)
      setDraft(res.text)
      setNote(copy.draftNote)
    } else {
      setNote(res.error)
    }
    setBusy(null)
  }

  async function send() {
    if (!picked.size) return setNote(copy.pickFirst)
    setBusy('send')
    setNote(null)
    const res = await sendRequest({ request: request(ensureEstimateId()), body: text, draft })
    setBusy(null)
    if ('error' in res) return setNote(res.error)
    setSentId(res.id ?? '')
    onSent()
  }

  if (sentId != null) {
    return (
      <div role="status" className="flex shrink-0 items-center gap-3 border-t bg-surface px-4 py-3 text-xs text-subtle-foreground">
        <span className="min-w-0 flex-1">{copy.sent(sentId)}</span>
        <Link href="/quotes" className="shrink-0 font-medium text-foreground underline underline-offset-4">
          {copy.seeQuotes}
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {copy.close}
        </Button>
      </div>
    )
  }

  return (
    <section aria-label={copy.title} className="bidgrid-scroll flex max-h-[45dvh] shrink-0 flex-col gap-3 overflow-y-auto border-t bg-surface px-4 py-3">
      <div>
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.privacy}</p>
      </div>

      <fieldset>
        <legend className="text-xs font-medium">{copy.pickItems}</legend>
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-baseline gap-2 rounded-sm px-1 py-0.5 text-xs hover:bg-foreground/[0.04]">
                <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} className="translate-y-[1px] accent-[var(--primary)]" />
                <span className="min-w-0 flex-1 truncate text-foreground">{itemLabel(r.description)}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {formatQty(r.quantity)} {r.unit}
                </span>
                <span className="w-20 shrink-0 text-right text-muted-foreground">{copy.fewPastBids(r.estimate?.comparables.length ?? 0)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rfq-message" className="text-xs font-medium">
          {copy.messageLabel}
        </label>
        <textarea
          id="rfq-message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          disabled={busy === 'draft'}
          placeholder={busy === 'draft' ? copy.drafting : ''}
          className="w-full resize-y rounded-md border bg-background px-2.5 py-2 text-sm leading-relaxed placeholder:text-muted-foreground disabled:opacity-70"
        />
        {note && (
          <p role="status" className="text-xs text-muted-foreground">
            {note}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={getDraft} disabled={busy !== null}>
          {busy === 'draft' ? copy.drafting : copy.draft}
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose} disabled={busy === 'send'}>
            {copy.cancel}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={busy !== null || !text.trim() || !picked.size}>
            {busy === 'send' ? copy.sending : copy.send}
          </Button>
        </div>
      </div>
    </section>
  )
}
