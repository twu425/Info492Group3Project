import { comparePrice, priceCheckLabel, ROLES, type Role } from '@/lib/roles'
import type { ExchangeMessage, QuoteRequest, RequestStatus } from '@/lib/roles-store'
import { cn } from '@/lib/utils'

// All wording for the request card lives here.
const copy = {
  scope: 'Scope notes',
  items: 'Items',
  item: 'Item',
  quantity: 'Quantity',
  pastBids: 'Past bids (low / typical / high)',
  quote: 'Sub’s quote',
  decision: 'Estimator',
  notQuoted: 'not quoted',
  noPastBids: 'no past bids',
  summary: 'Assistant’s read of this quote',
  summaryNote: 'Prices are the sub’s. The estimator decides what goes in the bid.',
  thread: 'Exchange',
  noNote: 'No note.',
  used: 'Used in bid',
  declined: 'Declined',
}

/** Status in the words of the person looking at it. */
const STATUS_LABEL: Record<Role, Record<RequestStatus, string>> = {
  estimator: { sent: 'Waiting on sub', needs_info: 'Sub has a question', quoted: 'Quote back', closed: 'Decided' },
  sub: { sent: 'Waiting on you', needs_info: 'Waiting on estimator', quoted: 'Quote sent', closed: 'Closed' },
}

const VERB: Record<ExchangeMessage['kind'], string> = {
  request: 'requested a quote',
  clarify: 'asked a question',
  reply: 'replied',
  quote: 'sent a quote',
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function authorLabel(m: { draftedBy: 'assistant' | 'person'; edited: boolean }) {
  if (m.draftedBy === 'person') return 'Written by person'
  return m.edited ? 'Assistant draft, edited by person' : 'Assistant draft, sent by person'
}

export function StatusBadge({ status, viewer }: { status: RequestStatus; viewer: Role }) {
  const waitingOnViewer = (viewer === 'sub' && status === 'sent') || (viewer === 'estimator' && (status === 'needs_info' || status === 'quoted'))
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
        waitingOnViewer ? 'border-primary/50 text-primary' : 'text-subtle-foreground',
      )}
    >
      {STATUS_LABEL[viewer][status]}
    </span>
  )
}

/** One quote request and its whole exchange, as both parties see it. The estimator's own prices are never stored, so never shown. */
export function RequestView({ request, viewer, children }: { request: QuoteRequest; viewer: Role; children?: React.ReactNode }) {
  const r = request
  return (
    <article className="rounded-lg border bg-surface p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {r.id} · {when(r.createdAt)}
          </p>
          <h2 className="mt-1 font-medium">{r.estimateName}</h2>
          {r.location && <p className="mt-0.5 text-sm text-subtle-foreground">{r.location}</p>}
        </div>
        <StatusBadge status={r.status} viewer={viewer} />
      </header>

      {r.scope.length > 0 && (
        <section className="mt-4">
          <h3 className="eyebrow">{copy.scope}</h3>
          <ul className="mt-2 list-disc pl-5 text-sm text-subtle-foreground">
            {r.scope.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4">
        <h3 className="eyebrow">{copy.items}</h3>
        <div className="bidgrid-scroll mt-2 overflow-x-auto rounded-md border bg-background">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2.5 py-1.5 font-medium">{copy.item}</th>
                <th className="px-2.5 py-1.5 text-right font-medium">{copy.quantity}</th>
                <th className="px-2.5 py-1.5 text-right font-medium">{copy.pastBids}</th>
                {r.quote && <th className="px-2.5 py-1.5 text-right font-medium">{copy.quote}</th>}
                {Object.keys(r.decisions).length > 0 && <th className="px-2.5 py-1.5 font-medium">{copy.decision}</th>}
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => {
                const price = r.quote?.prices[i.itemId]
                const decision = r.decisions[i.itemId]
                const ev = i.evidence
                return (
                  <tr key={i.itemId} className="border-t align-top">
                    <td className="px-2.5 py-1.5">
                      {i.description}
                      {i.itemCode && <span className="ml-1.5 font-mono text-muted-foreground">{i.itemCode}</span>}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-mono">
                      {qty(i.quantity)} {i.unit}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-right font-mono text-subtle-foreground">
                      {ev && ev.pastBids > 0 ? `${money(ev.low)} / ${money(ev.typical)} / ${money(ev.high)}` : copy.noPastBids}
                    </td>
                    {r.quote && (
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-right">
                        {price == null ? (
                          <span className="text-muted-foreground">{copy.notQuoted}</span>
                        ) : (
                          <>
                            <span className="font-mono text-foreground">{money(price)}</span>
                            <span className="block text-[11px] text-muted-foreground">{priceCheckLabel(comparePrice(price, ev))}</span>
                          </>
                        )}
                      </td>
                    )}
                    {Object.keys(r.decisions).length > 0 && (
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-subtle-foreground">
                        {decision === 'used' ? copy.used : decision === 'declined' ? copy.declined : '—'}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {viewer === 'estimator' && r.quote?.summary && (
        <section className="mt-4 rounded-md border border-primary/30 bg-background p-3">
          <h3 className="eyebrow">{copy.summary}</h3>
          <p className="mt-1.5 text-sm leading-relaxed">{r.quote.summary}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{copy.summaryNote}</p>
        </section>
      )}

      <section className="mt-4">
        <h3 className="eyebrow">{copy.thread}</h3>
        <ol className="mt-2 flex flex-col gap-3">
          {r.messages.map((m, idx) => (
            <li key={idx} className="rounded-md border bg-background p-3">
              <p className="text-xs text-muted-foreground">
                <span className="text-foreground">{ROLES[m.from].short}</span> {VERB[m.kind]} · {when(m.time)} · {authorLabel(m)}
              </p>
              {m.body ? (
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">{copy.noNote}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      {children && <div className="mt-4">{children}</div>}
    </article>
  )
}
