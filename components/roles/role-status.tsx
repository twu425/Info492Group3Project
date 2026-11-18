'use client'

import Link from 'next/link'
import { ROLES } from '@/lib/roles'
import { useRole } from './use-role'

const linkClass = 'rounded-sm text-foreground underline-offset-4 hover:underline'

/** "Signed in as … · Switch role" for the explorer header. Shows nothing when no role is picked. */
export function RoleStatus() {
  const role = useRole()
  if (!role) return null
  return (
    <span className="hidden items-center gap-2 text-xs text-subtle-foreground lg:flex">
      <span>Signed in as {ROLES[role].label}</span>
      <span aria-hidden="true">·</span>
      <Link href={role === 'estimator' ? '/quotes' : '/inbox'} className={linkClass}>
        {role === 'estimator' ? 'Quotes' : 'Inbox'}
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/login" className={linkClass}>
        Switch role
      </Link>
    </span>
  )
}
