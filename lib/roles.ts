// Roles for the demo exchange: the estimator requests quotes, the subcontractor answers with prices.
// Shared by the browser and the server, so keep this file free of server-only imports.

export type Role = 'estimator' | 'sub'
export type RoleAction = 'request' | 'reply' | 'decide' | 'quote' | 'clarify'

export const ROLE_COOKIE = 'bidgrid_role'

export const ROLES: Record<Role, { label: string; short: string; description: string; home: string }> = {
  estimator: {
    label: 'Estimator (general contractor)',
    short: 'Estimator',
    description: 'Build the bid from past bids and request quotes from subcontractors.',
    home: '/explore',
  },
  sub: {
    label: 'Subcontractor',
    short: 'Subcontractor',
    description: 'Answer quote requests from the estimator with your own prices.',
    home: '/inbox',
  },
}

export const ROLE_ORDER: Role[] = ['estimator', 'sub']

// Who may do what. The server checks this on every action.
const PERMISSIONS: Record<Role, RoleAction[]> = {
  estimator: ['request', 'reply', 'decide'],
  sub: ['quote', 'clarify'],
}

/** Old cookie values from the earlier demo ('gc', 'designer') read as no role, so people pick again. */
export function parseRole(value: string | null | undefined): Role | null {
  return value === 'estimator' || value === 'sub' ? value : null
}

export function can(role: Role | null, action: RoleAction): boolean {
  return role != null && PERMISSIONS[role].includes(action)
}

// ---- Quote requests ----

/** Check findings where a real quote fills the gap: the item has few or no past bids. */
export const QUOTABLE_KINDS = ['no_comparables', 'thin_data'] as const

/** Public past-bid summary for one item. Never the estimator's own price. */
export interface Evidence {
  low: number | null
  typical: number | null
  high: number | null
  pastBids: number
}

/** One bid item as sent to the sub: what and how much, never the estimator's price. */
export interface RequestItem {
  itemId: string
  itemCode: string
  description: string
  quantity: number
  unit: string
  evidence: Evidence | null
}

/** What the Build drawer hands to the request form. */
export interface RequestInput {
  /** The Build chat id, which is also the saved draft id. */
  estimateId: string
  estimateName: string
  location: string
  /** Confirmed scope notes from the Build assistant, as "label: value" lines. */
  scope: string[]
  items: RequestItem[]
}

export type PriceCheck = { kind: 'within' | 'above' | 'below' | 'no_data'; pct: number | null }

/** Compares a quoted unit price with the item's past-bid low and high. Plain arithmetic, no assistant. */
export function comparePrice(price: number, evidence: Evidence | null): PriceCheck {
  if (!evidence || evidence.low == null || evidence.high == null) return { kind: 'no_data', pct: null }
  if (price > evidence.high) return { kind: 'above', pct: Math.round((price / evidence.high - 1) * 100) }
  if (price < evidence.low) return { kind: 'below', pct: Math.round((1 - price / evidence.low) * 100) }
  return { kind: 'within', pct: null }
}

export function priceCheckLabel(check: PriceCheck): string {
  switch (check.kind) {
    case 'within':
      return 'within past-bid range'
    case 'above':
      return `${check.pct}% above past-bid high`
    case 'below':
      return `${check.pct}% below past-bid low`
    default:
      return 'no past bids to compare'
  }
}

/** Plain words for check messages, which say "comparable(s)" in the pricing code. */
export function plainWords(text: string): string {
  return text
    .replace(/comparable data/gi, 'past bids')
    .replace(/comparables/gi, 'past bids')
    .replace(/comparable/gi, 'past bid')
}
