import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ExchangeCounts } from '@/components/roles/exchange-counts'
import { ReplyForm } from '@/components/roles/reply-form'
import { RequestView } from '@/components/roles/request-view'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE, ROLES } from '@/lib/roles'
import { readStore, type QuoteRequest } from '@/lib/roles-store'

export const metadata: Metadata = {
  title: 'Quotes — BidGrid',
}

const copy = {
  title: 'Quote requests',
  intro: 'Requests you sent from your estimates, and the prices subcontractors sent back. You decide which prices go in the bid.',
  pickRole: 'Pick a role to see quote requests.',
  pickRoleLink: 'Pick a role',
  subNote: 'Quote requests from the estimator are in your inbox.',
  subLink: 'Open my inbox',
  none: 'No requests yet. In the explorer, open an estimate in Build and choose “Request quotes”.',
  counts: { sent: 'Waiting on sub', needsInfo: 'Sub has a question', quoted: 'Quotes back', used: 'Prices used in bids' },
  oldest: 'Oldest request waiting on the sub',
  sections: { needsInfo: 'Sub has a question', quoted: 'Quotes back: use or decline in your estimate', sent: 'Waiting on the sub', closed: 'Decided' },
  openEstimate: 'Open estimate',
}

const lastTime = (r: QuoteRequest) => r.messages[r.messages.length - 1]?.time ?? r.createdAt

export default async function QuotesPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)

  if (role !== 'estimator') {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <RoleHeader role={role} />
        <main className="py-10 text-subtle-foreground">
          <p>
            {role ? copy.subNote : copy.pickRole}{' '}
            <Link href={role ? '/inbox' : '/login'} className="text-foreground underline underline-offset-4">
              {role ? copy.subLink : copy.pickRoleLink}
            </Link>
          </p>
        </main>
      </div>
    )
  }

  const { requests } = await readStore()
  const newest = requests.slice().reverse()
  const by = (s: QuoteRequest['status']) => newest.filter((r) => r.status === s)
  const sent = by('sent')
  const oldestSent = sent[sent.length - 1]
  const used = requests.reduce((n, r) => n + Object.values(r.decisions).filter((d) => d === 'used').length, 0)

  const sections = [
    { title: copy.sections.needsInfo, list: by('needs_info') },
    { title: copy.sections.quoted, list: by('quoted') },
    { title: copy.sections.sent, list: sent },
    { title: copy.sections.closed, list: by('closed') },
  ].filter((s) => s.list.length > 0)

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <RoleHeader role={role} />
      <main className="py-10">
        <p className="eyebrow">{ROLES[role].label}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-subtle-foreground">{copy.intro}</p>

        <ExchangeCounts
          counts={[
            { label: copy.counts.sent, value: sent.length },
            { label: copy.counts.needsInfo, value: by('needs_info').length },
            { label: copy.counts.quoted, value: by('quoted').length },
            { label: copy.counts.used, value: used },
          ]}
          oldest={oldestSent ? { label: copy.oldest, since: lastTime(oldestSent) } : null}
        />

        {sections.length === 0 ? (
          <p className="mt-8 rounded-lg border bg-surface p-6 text-sm text-muted-foreground">{copy.none}</p>
        ) : (
          sections.map((s) => (
            <section key={s.title} className="mt-10">
              <h2 className="text-sm font-medium">
                {s.title} ({s.list.length})
              </h2>
              <div className="mt-3 flex flex-col gap-4">
                {s.list.map((r) => (
                  <RequestView key={r.id} request={r} viewer="estimator">
                    {r.status === 'needs_info' && <ReplyForm requestId={r.id} />}
                    <Link
                      href={`/explore?draft=${encodeURIComponent(r.estimateId)}`}
                      className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {copy.openEstimate} →
                    </Link>
                  </RequestView>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}
