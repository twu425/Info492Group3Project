import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { RoleHeader } from '@/components/roles/role-header'
import { parseRole, ROLE_COOKIE, ROLES } from '@/lib/roles'

export const metadata: Metadata = {
  title: 'Inbox — BidGrid',
}

export default async function InboxPage() {
  const role = parseRole((await cookies()).get(ROLE_COOKIE)?.value)

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      <RoleHeader role={role} />
      <main className="py-10">
        {!role ? (
          <p className="text-subtle-foreground">
            Pick a role to see your inbox.{' '}
            <Link href="/login" className="text-foreground underline underline-offset-4">
              Pick a role
            </Link>
          </p>
        ) : role === 'sub' ? (
          <p className="text-subtle-foreground">
            Subcontractors send questions from the explorer.{' '}
            <Link href="/questions" className="text-foreground underline underline-offset-4">
              See my questions
            </Link>
          </p>
        ) : (
          <>
            <p className="eyebrow">{ROLES[role].label}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-6 rounded-lg border bg-surface p-6 text-sm text-muted-foreground">No questions yet.</p>
          </>
        )}
      </main>
    </div>
  )
}
