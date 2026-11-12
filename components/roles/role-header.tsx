import Link from 'next/link'
import { ROLES, type Role } from '@/lib/roles'

const linkClass = 'rounded-sm text-foreground underline-offset-4 hover:underline'

/** Header for the role pages (inbox, questions, log). The role comes from the server-read cookie. */
export function RoleHeader({ role }: { role: Role | null }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3">
      <Link href="/" className="flex items-center gap-3 rounded-md">
        <span aria-hidden="true" className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-surface p-1 ring-1 ring-border">
          <span className="rounded-[1px] bg-primary" />
          <span className="rounded-[1px] bg-subtle-foreground/40" />
          <span className="rounded-[1px] bg-subtle-foreground/40" />
          <span className="rounded-[1px] bg-subtle-foreground/40" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">BidGrid</span>
      </Link>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle-foreground">
        {role && <span>Signed in as {ROLES[role].label}</span>}
        {role && <span aria-hidden="true">·</span>}
        {role === 'sub' ? (
          <>
            <Link href="/explore" className={linkClass}>
              Explorer
            </Link>
            <span aria-hidden="true">·</span>
            <Link href="/questions" className={linkClass}>
              My questions
            </Link>
          </>
        ) : role ? (
          <Link href="/inbox" className={linkClass}>
            Inbox
          </Link>
        ) : null}
        {role && <span aria-hidden="true">·</span>}
        <Link href="/log" className={linkClass}>
          Activity log
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/login" className={linkClass}>
          {role ? 'Switch role' : 'Pick a role'}
        </Link>
      </nav>
    </header>
  )
}
