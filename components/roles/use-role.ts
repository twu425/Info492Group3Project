'use client'

import { useEffect, useState } from 'react'
import { parseRole, ROLE_COOKIE, type Role } from '@/lib/roles'

function readRoleCookie(): Role | null {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${ROLE_COOKIE}=`))
  return parseRole(match?.split('=')[1])
}

export function setRole(role: Role) {
  // Kept for 30 days. Demo only: anyone can pick any role.
  document.cookie = `${ROLE_COOKIE}=${role}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}

/** The current role, read after the page loads so server and browser render the same HTML. */
export function useRole(): Role | null {
  const [role, setRoleState] = useState<Role | null>(null)
  useEffect(() => setRoleState(readRoleCookie()), [])
  return role
}
