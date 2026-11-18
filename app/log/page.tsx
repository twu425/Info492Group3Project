import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { authorLabel } from '@/components/roles/request-view'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE, ROLES } from '@/lib/roles'
import { readStore, type LogEntry } from '@/lib/roles-store'

export const metadata: Metadata = {
  title: 'Activity log — BidGrid',
}

const ACTION_LABEL: Record<LogEntry['action'], string> = {
  request: 'Requested a quote',
  clarify: 'Asked a question',
  reply: 'Replied',
  quote: 'Sent a quote',
  use: 'Used a quoted price',
  decline: 'Declined a quoted price',
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })

/** Read-only audit trail: every action, who took it, and whether the assistant drafted the text. */
export default async function LogPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)
  const { log, requests } = await readStore()
  const titles = new Map(requests.map((r) => [r.id, r.estimateName]))
  const entries = log.slice().reverse()

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <RoleHeader role={role} />
      <main className="py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Activity log</h1>
        <p className="mt-2 text-sm text-subtle-foreground">
          Every request, question, quote and decision, newest first. The assistant only drafts and compares; a person in the right role sends and decides.
        </p>
        {entries.length === 0 ? (
          <p className="mt-8 rounded-lg border bg-surface p-6 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="bidgrid-scroll mt-8 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Request</th>
                  <th className="px-3 py-2 font-medium">Text by</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-subtle-foreground">{when(e.time)}</td>
                    <td className="px-3 py-2">{ROLES[e.role].label}</td>
                    <td className="px-3 py-2">
                      {ACTION_LABEL[e.action]}
                      {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">{e.requestId}</span>{' '}
                      {titles.get(e.requestId) ?? ''}
                    </td>
                    <td className="px-3 py-2 text-subtle-foreground">{authorLabel(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
