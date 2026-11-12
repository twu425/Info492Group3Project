import { ROLES, type Evidence, type Role } from '@/lib/roles'
import type { Question, QuestionMessage, QuestionStatus } from '@/lib/roles-store'

export const STATUS_LABEL: Record<QuestionStatus, string> = {
  with_gc: 'With GC',
  with_designer: 'With designer',
  answered: 'Answered',
}

const money = (n: number | null) => (n == null ? '—' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function authorLabel(m: { draftedBy: 'assistant' | 'person'; edited: boolean }) {
  if (m.draftedBy === 'person') return 'Written by person'
  return m.edited ? 'Assistant draft, edited by person' : 'Assistant draft, sent by person'
}

export function questionTitle(q: Question) {
  return q.itemDescription ?? q.findingMessage.split(' — ')[0]
}

export function StatusBadge({ status }: { status: QuestionStatus }) {
  return (
    <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-subtle-foreground">
      {STATUS_LABEL[status]}
    </span>
  )
}

function EvidenceSummary({ evidence }: { evidence: Evidence | null }) {
  if (!evidence) return <p className="text-xs text-muted-foreground">No past-bid summary for this item.</p>
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
      {[
        ['Low', money(evidence.low)],
        ['Typical', money(evidence.typical)],
        ['High', money(evidence.high)],
        ['Past bids', String(evidence.pastBids)],
      ].map(([label, value]) => (
        <div key={label} className="flex flex-col-reverse">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono text-foreground">{value}</dd>
        </div>
      ))}
      {evidence.contracts.length > 0 && (
        <div className="col-span-2 flex flex-col-reverse sm:col-span-4">
          <dt className="text-muted-foreground">Example contracts</dt>
          <dd className="font-mono text-foreground">{evidence.contracts.join(', ')}</dd>
        </div>
      )}
    </dl>
  )
}

const KIND_LABEL: Record<QuestionMessage['kind'], string> = { question: 'asked', forward: 'forwarded to the designer', answer: 'answered' }

function Thread({ messages }: { messages: QuestionMessage[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m, i) => (
        <li key={i} className="rounded-md border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground">{ROLES[m.from].label}</span> {KIND_LABEL[m.kind]} · {when(m.time)} · {authorLabel(m)}
          </p>
          {m.body ? (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">No note.</p>
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * One question as a given role may see it. The designer sees only the question, the GC's note
 * and the past-bid summary: never the check finding, which comes from the sub's estimate.
 */
export function QuestionView({ question, viewer, children }: { question: Question; viewer: Role; children?: React.ReactNode }) {
  const messages = viewer === 'designer' ? question.messages.filter((m) => m.kind !== 'answer' || m.from === 'designer') : question.messages
  return (
    <article className="rounded-lg border bg-surface p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {question.id} · topic: <span className="capitalize">{question.topic}</span>
          </p>
          <h2 className="mt-1 font-medium">{questionTitle(question)}</h2>
        </div>
        <StatusBadge status={question.status} />
      </header>

      {viewer !== 'designer' && (
        <p className="mt-3 text-sm text-subtle-foreground">
          <span className="text-muted-foreground">Check finding: </span>
          {question.findingMessage}
        </p>
      )}

      <section className="mt-4">
        <h3 className="eyebrow">Past bids for this item</h3>
        <div className="mt-2">
          <EvidenceSummary evidence={question.evidence} />
        </div>
      </section>

      <section className="mt-4">
        <h3 className="eyebrow">Conversation</h3>
        <div className="mt-2">
          <Thread messages={messages} />
        </div>
      </section>

      {children && <div className="mt-4">{children}</div>}
    </article>
  )
}
