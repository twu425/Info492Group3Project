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

// ---- Questions about check findings ----

export type Topic = 'scope' | 'quantity' | 'spec' | 'other'
export const TOPICS: Topic[] = ['scope', 'quantity', 'spec', 'other']

/** Check findings that are real scope questions for the GC. The two price kinds are the sub's own pricing. */
export const ASKABLE_KINDS = ['quantity_mismatch', 'no_comparables', 'thin_data', 'missing_item'] as const
export type AskableKind = (typeof ASKABLE_KINDS)[number]

export const DEFAULT_TOPIC: Record<AskableKind, Topic> = {
  quantity_mismatch: 'quantity',
  missing_item: 'scope',
  no_comparables: 'spec',
  thin_data: 'other',
}

/** Past-bid summary sent with a question. Market prices only, never the sub's own prices. */
export interface Evidence {
  low: number | null
  typical: number | null
  high: number | null
  pastBids: number
  contracts: string[]
}

/** The question form's input: one check finding plus its past-bid evidence. */
export interface QuestionContext {
  findingKind: AskableKind
  findingMessage: string
  itemCode?: string
  itemDescription?: string
  evidence: Evidence | null
}

/** Plain words for check messages, which say "comparable(s)" in the pricing code. */
export function plainWords(text: string): string {
  return text
    .replace(/comparable data/gi, 'past bids')
    .replace(/comparables/gi, 'past bids')
    .replace(/comparable/gi, 'past bid')
}
