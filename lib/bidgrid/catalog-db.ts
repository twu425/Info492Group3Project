/**
 * Server-only item catalog sourced directly from bidgrid.db (not the committed JSON bundle
 * or any hardcoded list). The assistant's server tools — searchCatalog and item resolution —
 * use this so the item set is always exactly what the database contains.
 *
 * Imported only by the API route (never by client components), so better-sqlite3 stays
 * server-side. The full catalog is built from the DB once per server process and reused;
 * the DB is static at runtime, so this reads the database rather than a baked-in list.
 */
import type { ItemDef, ItemFamily, Unit } from './data'
import { classifyFamily } from './classify'
import { queryDb } from './query-bids'

export interface DbCatalogItem extends ItemDef {
  contractCount: number
  bidCount: number
}

interface Catalog {
  items: DbCatalogItem[]
  byCode: Map<string, DbCatalogItem>
  byFamily: Map<ItemFamily, DbCatalogItem[]>
}

let cache: Catalog | null = null

function buildFromDb(): Catalog {
  const db = queryDb()
  // Per-code usage counts…
  const counts = db
    .prepare('SELECT item_code, COUNT(*) bids, COUNT(DISTINCT contract_ea) contracts FROM line_items GROUP BY item_code')
    .all() as { item_code: string; bids: number; contracts: number }[]
  const countByCode = new Map(counts.map((r) => [r.item_code, r]))
  // …and the canonical (most-used) description + unit per code.
  const variants = db
    .prepare('SELECT item_code, description, unit, COUNT(*) n FROM line_items GROUP BY item_code, description, unit ORDER BY n DESC')
    .all() as { item_code: string; description: string; unit: string; n: number }[]

  const items: DbCatalogItem[] = []
  const seen = new Set<string>()
  for (const v of variants) {
    if (seen.has(v.item_code)) continue // variants are ordered by frequency, so first = canonical
    seen.add(v.item_code)
    const c = countByCode.get(v.item_code)
    items.push({
      code: v.item_code,
      description: v.description,
      unit: v.unit as Unit,
      family: classifyFamily(v.item_code, v.description),
      basePrice: 0,
      typicalQty: 0,
      contractCount: c?.contracts ?? 0,
      bidCount: c?.bids ?? 0,
    })
  }
  items.sort((a, b) => b.contractCount - a.contractCount || b.bidCount - a.bidCount)

  const byFamily = new Map<ItemFamily, DbCatalogItem[]>()
  for (const i of items) {
    const arr = byFamily.get(i.family) ?? []
    arr.push(i)
    byFamily.set(i.family, arr)
  }
  return { items, byCode: new Map(items.map((i) => [i.code, i])), byFamily }
}

function catalog(): Catalog {
  if (!cache) cache = buildFromDb()
  return cache
}

const WORD = /[a-z0-9]+/g
const tokens = (s: string) => (s.toLowerCase().match(WORD) ?? []).filter((w) => w.length > 2)

export interface CatalogCandidate {
  code: string
  description: string
  unit: Unit
  family: ItemFamily
  score: number
}

/** Rank DB catalog items by description match to a plain-language query (same scoring as the bundle catalog). */
export function searchCatalogDb(
  query: string,
  opts?: { unit?: Unit; family?: ItemFamily; limit?: number },
): CatalogCandidate[] {
  const qTokens = new Set(tokens(query))
  if (qTokens.size === 0) return []
  const cat = catalog()
  const pool = opts?.family ? (cat.byFamily.get(opts.family) ?? []) : cat.items
  const maxContracts = cat.items[0]?.contractCount || 1
  const scored: CatalogCandidate[] = []
  for (const item of pool) {
    const hay = new Set(tokens(item.description))
    let overlap = 0
    for (const w of qTokens) if (hay.has(w)) overlap++
    if (overlap === 0) continue
    let score = overlap / qTokens.size
    if (opts?.unit && item.unit === opts.unit) score += 0.15
    score += 0.1 * (item.contractCount / maxContracts)
    scored.push({ code: item.code, description: item.description, unit: item.unit, family: item.family, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, opts?.limit ?? 5)
}

/** The canonical catalog item for a code, from the DB. */
export function catalogItemDb(code: string): DbCatalogItem | undefined {
  return catalog().byCode.get(code)
}

/** DB-backed item resolution: explicit code wins; else best description match; else family representative. */
export function resolveItemDb(family: ItemFamily, opts: { itemCode?: string; description?: string; unit?: Unit }): ItemDef | null {
  if (opts.itemCode) {
    const exact = catalog().byCode.get(opts.itemCode)
    if (exact) return exact
  }
  if (opts.description) {
    const inFamily = searchCatalogDb(opts.description, { unit: opts.unit, family, limit: 1 })
    if (inFamily.length) return catalog().byCode.get(inFamily[0].code) ?? null
    const anywhere = searchCatalogDb(opts.description, { unit: opts.unit, limit: 1 })
    if (anywhere.length) return catalog().byCode.get(anywhere[0].code) ?? null
  }
  return catalog().byFamily.get(family)?.[0] ?? null
}
