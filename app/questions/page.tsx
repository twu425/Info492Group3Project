import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { QuestionView } from '@/components/roles/question-view'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE } from '@/lib/roles'
import { readStore } from '@/lib/roles-store'

export const metadata: Metadata = {
  title: 'My questions — BidGrid',
}

export default async function QuestionsPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)
  const questions = role === 'sub' ? (await readStore()).questions.slice().reverse() : []

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <RoleHeader role={role} />
      <main className="py-10">
        {role !== 'sub' ? (
          <p className="text-subtle-foreground">
            This page is for the subcontractor estimator.{' '}
            <Link href={role ? '/inbox' : '/login'} className="text-foreground underline underline-offset-4">
              {role ? 'Go to your inbox' : 'Pick a role'}
            </Link>
          </p>
        ) : (
          <>
            <p className="eyebrow">Subcontractor estimator</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">My questions</h1>
            {questions.length === 0 ? (
              <p className="mt-8 rounded-lg border bg-surface p-6 text-sm text-muted-foreground">
                No questions yet. Run Build in the{' '}
                <Link href="/explore" className="text-foreground underline underline-offset-4">
                  explorer
                </Link>
                , then use “Ask the GC” on a check finding.
              </p>
            ) : (
              <div className="mt-8 flex flex-col gap-4">
                {questions.map((q) => (
                  <QuestionView key={q.id} question={q} viewer="sub" />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
