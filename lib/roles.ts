// Roles for the demo exchange between a subcontractor, a general contractor and a designer.
// Shared by the browser and the server, so keep this file free of server-only imports.

export type Role = 'sub' | 'gc' | 'designer'
export type RoleAction = 'ask' | 'answer' | 'forward'

export const ROLE_COOKIE = 'bidgrid_role'

export const ROLES: Record<Role, { label: string; description: string; home: string }> = {
  sub: {
    label: 'Subcontractor estimator',
    description: 'Build estimates from past bids and ask the GC about scope.',
    home: '/explore',
  },
  gc: {
    label: 'General contractor',
    description: 'Answer questions from subs, or forward them to the designer.',
    home: '/inbox',
  },
  designer: {
    label: 'Designer / owner',
    description: 'Answer questions the GC forwards about the design.',
    home: '/inbox',
  },
}

export const ROLE_ORDER: Role[] = ['sub', 'gc', 'designer']

// Who may do what. The server checks this on every action.
const PERMISSIONS: Record<Role, RoleAction[]> = {
  sub: ['ask'],
  gc: ['answer', 'forward'],
  designer: ['answer'],
}

export function parseRole(value: string | null | undefined): Role | null {
  return value === 'sub' || value === 'gc' || value === 'designer' ? value : null
}

export function can(role: Role | null, action: RoleAction): boolean {
  return role != null && PERMISSIONS[role].includes(action)
}
