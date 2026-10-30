/**
 * The real item catalog, derived from the scraped bid data (CONTRACTS) rather than
 * the hand-authored synthetic ITEM_CATALOG. Every distinct Caltrans item code that
 * appears in the data becomes a catalog entry with a canonical description, unit,
 * and family, plus how widely it's used (for ranking search candidates).
 *
 * This is the agent's real vocabulary: resolveItem / estimateItem / searchCatalog all
 * work over REAL_CATALOG, so the assistant can name any code the database actually
 * contains instead of the 76 synthetic ones.
 */
import { CONTRACTS, type ItemDef, type ItemFamily, type Unit } from './data'
import { classifyFamily } from './classify'

export interface RealItem extends ItemDef {
  /** Number of distinct contracts whose line items use this code. */
  contractCount: number
  /** Total line-item occurrences (all bidders) of this code. */
  bidCount: number
}

function mostCommon<T>(counts: Map<T, number>): T {
  let best: T | undefined
  let bestN = -1
  for (const [k, n] of counts) if (n > bestN) ((best = k), (bestN = n))
  return best!
}
function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function build(): RealItem[] {
  interface Agg {
    descriptions: Map<string, number>
    units: Map<string, number>
    prices: number[]
    quantities: number[]
    contracts: Set<string>
    bids: number
  }
  const agg = new Map<string, Agg>()
  for (const c of CONTRACTS) {
    for (const li of c.lineItems) {
      let a = agg.get(li.itemCode)
      if (!a) {
        a = { descriptions: new Map(), units: new Map(), prices: [], quantities: [], contracts: new Set(), bids: 0 }
        agg.set(li.itemCode, a)
      }
      a.descriptions.set(li.description, (a.descriptions.get(li.description) ?? 0) + 1)
      a.units.set(li.unit, (a.units.get(li.unit) ?? 0) + 1)
      if (li.unitPrice > 0) a.prices.push(li.unitPrice)
      if (li.quantity > 0) a.quantities.push(li.quantity)
      a.contracts.add(c.ea)
      a.bids++
    }
  }
  const items: RealItem[] = []
  for (const [code, a] of agg) {
    const description = mostCommon(a.descriptions)
    const unit = mostCommon(a.units) as Unit
    items.push({
      code,
      description,
      unit,
      family: classifyFamily(code, description),
      basePrice: median(a.prices),
      typicalQty: median(a.quantities),
      contractCount: a.contracts.size,
      bidCount: a.bids,
    })
  }
  // Most-used codes first, so ties in search/resolve prefer common items.
  return items.sort((x, y) => y.contractCount - x.contractCount || y.bidCount - x.bidCount)
}

export const REAL_CATALOG: RealItem[] = build()
export const catalogByCode = new Map(REAL_CATALOG.map((i) => [i.code, i]))
export const catalogByFamily = (() => {
  const m = new Map<ItemFamily, RealItem[]>()
  for (const i of REAL_CATALOG) {
    const arr = m.get(i.family) ?? []
    arr.push(i)
    m.set(i.family, arr)
  }
  return m
})()

const WORD = /[a-z0-9]+/g
function tokens(s: string): string[] {
  return (s.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 2)
}

export interface CatalogCandidate {
  code: string
  description: string
  unit: Unit
  family: ItemFamily
  score: number
}

/**
 * Rank real catalog items by how well their description matches a plain-language query.
 * Token-overlap scored, with a small bonus for a matching unit and for commonly-used
 * codes so generic queries resolve to a representative item. Optionally scoped to a family.
 */
export function searchCatalog(query: string, opts?: { unit?: Unit; family?: ItemFamily; limit?: number }): CatalogCandidate[] {
  const qTokens = tokens(query)
  if (!qTokens.length) return []
  const qSet = new Set(qTokens)
  const pool = opts?.family ? (catalogByFamily.get(opts.family) ?? []) : REAL_CATALOG
  const maxContracts = REAL_CATALOG[0]?.contractCount || 1
  const scored = pool
    .map((item) => {
      const hay = new Set(tokens(item.description))
      let overlap = 0
      for (const w of qSet) if (hay.has(w)) overlap++
      if (overlap === 0) return null
      // Jaccard-ish overlap, normalized by query size, plus small unit + popularity bonuses.
      let score = overlap / qSet.size
      if (opts?.unit && item.unit === opts.unit) score += 0.15
      score += 0.1 * (item.contractCount / maxContracts)
      return { code: item.code, description: item.description, unit: item.unit, family: item.family, score }
    })
    .filter((x): x is CatalogCandidate => x !== null)
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, opts?.limit ?? 5)
}
