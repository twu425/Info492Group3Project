'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { askClarification, draftQuoteNote, submitQuote } from '@/lib/roles-actions'
import type { RequestItem } from '@/lib/roles'

const copy = {
  title: 'Your quote',
  intro: 'Enter your own unit price for each item you want to quote. Leave an item blank to skip it.',
  perUnit: (unit: string) => `per ${unit}`,
  notesLabel: 'Notes, assumptions and exclusions (optional)',
  draft: 'Draft notes with assistant',
  drafting: 'Drafting…',
  draftNote: 'Drafted by the assistant. It never sets or changes your prices. Check and edit before you send.',
  send: 'Send quote to estimator',
  sending: 'Sending…',
  ask: 'Ask a question instead',
  askLabel: 'Your question to the estimator',
  sendQuestion: 'Send question',
  back: 'Back to quote',
}

/** The sub sets every price. The assistant can draft the notes; only the sub sends. */
export function QuoteForm({ requestId, items }: { requestId: string; items: RequestItem[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<'quote' | 'ask'>('quote')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  /** Typed prices as numbers; blanks are left out. */
  const priceNumbers = () =>
    Object.fromEntries(
      Object.entries(prices)
        .filter(([, v]) => v.trim() !== '')
        .map(([id, v]) => [id, Number(v.replace(/[$,\s]/g, ''))]),
    )

  async function getDraft() {
    setBusy('draft')
    setMessage(null)
    const res = await draftQuoteNote(requestId, priceNumbers())
    if ('text' in res) {
      setNotes(res.text)
      setDraft(res.text)
      setMessage(copy.draftNote)
    } else {
      setMessage(res.error)
    }
    setBusy(null)
  }

  async function send() {
    setBusy('send')
    setMessage(null)
    const res =
      mode === 'quote'
        ? await submitQuote({ requestId, prices: priceNumbers(), notes, draft })
        : await askClarification({ requestId, body: question })
    setBusy(null)
    if ('error' in res) return setMessage(res.error)
    router.refresh()
  }

  if (mode === 'ask') {
    return (
      <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
        <label htmlFor={`ask-${requestId}`} className="text-xs font-medium">
          {copy.askLabel}
        </label>
        <textarea
          id={`ask-${requestId}`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm leading-relaxed"
        />
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode('quote')} disabled={busy !== null}>
            {copy.back}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={busy !== null || !question.trim()}>
            {busy === 'send' ? copy.sending : copy.sendQuestion}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <div>
        <h3 className="text-sm font-medium">{copy.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.intro}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor={`price-${requestId}-${i.itemId}`} className="min-w-0 flex-1 text-sm">
              {i.description}
            </label>
            <span className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id={`price-${requestId}-${i.itemId}`}
                inputMode="decimal"
                value={prices[i.itemId] ?? ''}
                onChange={(e) => setPrices((p) => ({ ...p, [i.itemId]: e.target.value }))}
                className="h-8 w-28 rounded-md border bg-surface px-2 text-right font-mono text-sm"
              />
              <span className="w-20 text-xs text-muted-foreground">{copy.perUnit(i.unit)}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`notes-${requestId}`} className="text-xs font-medium">
          {copy.notesLabel}
        </label>
        <textarea
          id={`notes-${requestId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={busy === 'draft'}
          placeholder={busy === 'draft' ? copy.drafting : ''}
          className="w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm leading-relaxed placeholder:text-muted-foreground disabled:opacity-70"
        />
        {message && (
          <p role="status" className="text-xs text-muted-foreground">
            {message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={getDraft} disabled={busy !== null}>
          {busy === 'draft' ? copy.drafting : copy.draft}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode('ask')} disabled={busy !== null}>
          {copy.ask}
        </Button>
        <Button type="button" size="sm" className="ml-auto" onClick={send} disabled={busy !== null}>
          {busy === 'send' ? copy.sending : copy.send}
        </Button>
      </div>
    </div>
  )
}
