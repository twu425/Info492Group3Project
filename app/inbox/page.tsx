import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { QuestionActions } from '@/components/roles/question-actions'
import { QuestionView } from '@/components/roles/question-view'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE, ROLES } from '@/lib/roles'
import { readStore } from '@/lib/roles-store'

export const metadata: Metadata = {
  title: 'Inbox — BidGrid',
}

export default async function InboxPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)

  if (!role || role === 'sub') {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <RoleHeader role={role} />
        <main className="py-10 text-subtle-foreground">
          {!role ? (
            <p>
              Pick a role to see your inbox.{' '}
              <Link href="/login" className="text-foreground underline underline-offset-4">
                Pick a role
              </Link>
            </p>
          ) : (
            <p>
              Subcontractors send questions from the explorer.{' '}
              <Link href="/questions" className="text-foreground underline underline-offset-4">
                See my questions
              </Link>
            </p>
          )}
        </main>
      </div>
    )
  }

  const { questions } = await readStore()
  // The GC sees every question; the designer only those forwarded to them.
  const mine = questions.filter((q) => role === 'gc' || q.messages.some((m) => m.kind === 'forward'))
  const waiting = mine.filter((q) => q.status === (role === 'gc' ? 'with_gc' : 'with_designer')).reverse()
  const handled = mine.filter((q) => !waiting.includes(q)).reverse()

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <RoleHeader role={role} />
      <main className="py-10">
        <p className="eyebrow">{ROLES[role].label}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Inbox</h1>

        <section className="mt-8">
          <h2 className="text-sm font-medium">Waiting on you ({waiting.length})</h2>
          {waiting.length === 0 ? (
            <p className="mt-3 rounded-lg border bg-surface p-6 text-sm text-muted-foreground">No questions yet.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {waiting.map((q) => (
                <QuestionView key={q.id} question={q} viewer={role}>
                  <QuestionActions questionId={q.id} role={role} topic={q.topic} />
                </QuestionView>
              ))}
            </div>
          )}
        </section>

        {handled.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium">Handled ({handled.length})</h2>
            <div className="mt-3 flex flex-col gap-4">
              {handled.map((q) => (
                <QuestionView key={q.id} question={q} viewer={role} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
