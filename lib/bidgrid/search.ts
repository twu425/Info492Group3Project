import {
  BIDDER_PROFILES,
  CATEGORIES,
  CATEGORY_FAMILIES,
  CONTRACTS,
  DISTRICT_NAMES,
  ITEM_CATALOG,
  type ItemFamily,
} from './data'
import { formatDistrict, itemLabel } from './format'

export type SearchType = 'family' | 'item' | 'contract' | 'bidder'

export interface SearchResult {
  /** Stable key within the result list. */
  id: string
  type: SearchType
  title: string
  subtitle: string
  score: number
  /** How to open the result in the detail modal. */
  target:
    | { kind: 'family'; family: ItemFamily; itemCode: string | null }
    | { kind: 'contract'; ea: string }
    | { kind: 'bidder'; name: string }
}

export const SEARCH_TYPE_LABEL: Record<SearchType, string> = {
  family: 'Item family',
  item: 'Item',
  contract: 'Contract',
  bidder: 'Bidder',
}

/** Scores a substring hit: prefix and word-boundary matches rank highest. Returns -1 for no match. */
function score(text: string, q: string): number {
  const t = text.toLowerCase()
  const i = t.indexOf(q)
  if (i === -1) return -1
  let s = 50 - Math.min(i, 40)
  if (i === 0) s += 60
  else if (/[^a-z0-9]/.test(t[i - 1])) s += 28
  s -= t.length * 0.04
  return s
}

/** Best score across several fields for one record. */
function bestScore(q: string, ...fields: string[]): number {
  let best = -1
  for (const f of fields) best = Math.max(best, score(f, q))
  return best
}

/** Contracts each bidder appears in, newest first — used to open a representative contract. */
const BIDDER_CONTRACTS = (() => {
  const map = new Map<string, string[]>()
  const byDateDesc = [...CONTRACTS].sort((a, b) => b.bidOpenDate.localeCompare(a.bidOpenDate))
  for (const c of byDateDesc) {
    for (const b of c.bidders) {
      const list = map.get(b.name)
      if (list) list.push(c.ea)
      else map.set(b.name, [c.ea])
    }
  }
  return map
})()

const PER_GROUP: Record<SearchType, number> = { family: 5, item: 6, contract: 8, bidder: 5 }

/**
 * Searches item families, item codes, item descriptions, contract EAs, project
 * descriptions, and bidder names. Results are grouped by type (families, items,
 * contracts, bidders) and each group is capped and ranked by match quality.
 */
export function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const families: SearchResult[] = []
  for (const category of CATEGORIES) {
    for (const family of CATEGORY_FAMILIES[category]) {
      const s = bestScore(q, family, category)
      if (s < 0) continue
      families.push({
        id: `family:${family}`,
        type: 'family',
        title: family,
        subtitle: category,
        score: s,
        target: { kind: 'family', family, itemCode: null },
      })
    }
  }

  const items: SearchResult[] = []
  for (const def of ITEM_CATALOG) {
    const s = bestScore(q, def.code, def.description, def.family)
    if (s < 0) continue
    items.push({
      id: `item:${def.code}`,
      type: 'item',
      title: itemLabel(def.description),
      subtitle: `${def.code} · ${def.family}`,
      score: s,
      target: { kind: 'family', family: def.family, itemCode: def.code },
    })
  }

  const contracts: SearchResult[] = []
  for (const c of CONTRACTS) {
    const year = c.bidOpenDate.slice(0, 4)
    const s = bestScore(q, c.ea, c.projectType, c.typeOfWork)
    if (s < 0) continue
    contracts.push({
      id: `contract:${c.ea}`,
      type: 'contract',
      title: c.ea,
      subtitle: `${formatDistrict(c.district)} · ${year} · ${c.typeOfWork}`,
      score: s + (c.ea.toLowerCase().startsWith(q) ? 20 : 0),
      target: { kind: 'contract', ea: c.ea },
    })
  }

  const bidders: SearchResult[] = []
  for (const profile of BIDDER_PROFILES) {
    const s = score(profile.name, q)
    if (s < 0) continue
    const contractsForBidder = BIDDER_CONTRACTS.get(profile.name) ?? []
    if (contractsForBidder.length === 0) continue
    const specialties = profile.specialties === null ? 'General contractor' : profile.specialties.join(', ')
    bidders.push({
      id: `bidder:${profile.name}`,
      type: 'bidder',
      title: profile.name,
      subtitle: `${contractsForBidder.length} contracts · ${DISTRICT_NAMES[profile.home]} · ${specialties}`,
      score: s,
      target: { kind: 'bidder', name: profile.name },
    })
  }

  const cap = (list: SearchResult[], type: SearchType) =>
    list.sort((a, b) => b.score - a.score).slice(0, PER_GROUP[type])

  return [
    ...cap(families, 'family'),
    ...cap(items, 'item'),
    ...cap(contracts, 'contract'),
    ...cap(bidders, 'bidder'),
  ]
}
