import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ExchangeCounts } from '@/components/roles/exchange-counts'
import { RequestView } from '@/components/roles/request-view'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE, ROLES } from '@/lib/roles'
import { readStore, type QuoteRequest } from '@/lib/roles-store'

export const metadata: Metadata = {
  title: 'Inbox — BidGrid',
}

const copy = {
  title: 'Quote requests',
  intro: 'Requests from the estimator. You set your own prices; past bids are shown only for reference.',
  pickRole: 'Pick a role to see your inbox.',
  pickRoleLink: 'Pick a role',
  estimatorNote: 'Your sent requests and the quotes that came back are on the Quotes page.',
  estimatorLink: 'Open quotes',
  none: 'No quote requests yet.',
  counts: { sent: 'New requests', needsInfo: 'Waiting on estimator', quoted: 'Quotes sent', closed: 'Decided by estimator' },
  oldest: 'Oldest request waiting on you',
  sections: { sent: 'Waiting on you', needsInfo: 'Waiting on the estimator’s reply', quoted: 'Quotes sent', closed: 'Decided by the estimator' },
}

const lastTime = (r: QuoteRequest) => r.messages[r.messages.length - 1]?.time ?? r.createdAt

export default async function InboxPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)

  if (role !== 'sub') {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <RoleHeader role={role} />
        <main className="py-10 text-subtle-foreground">
          <p>
            {role ? copy.estimatorNote : copy.pickRole}{' '}
            <Link href={role ? '/quotes' : '/login'} className="text-foreground underline underline-offset-4">
              {role ? copy.estimatorLink : copy.pickRoleLink}
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

  const sections = [
    { title: copy.sections.sent, list: sent },
    { title: copy.sections.needsInfo, list: by('needs_info') },
    { title: copy.sections.quoted, list: by('quoted') },
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
            { label: copy.counts.closed, value: by('closed').length },
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
                  <RequestView key={r.id} request={r} viewer="sub" />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  )
}
