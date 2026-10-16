import {
  CONTRACTS,
  COUNTY_CENTERS,
  COUNTY_NAMES,
  ITEM_CATALOG,
  type Contract,
  type District,
  type ItemDef,
  type ItemFamily,
  type Unit,
} from './data'
import { DATA_END, quarterStartOf } from './family'

export interface LatLng {
  lat: number
  lng: number
}

const YEAR_MS = 365.25 * 86_400_000
export const COMPARABLE_RADIUS_MI = 50
export const COMPARABLE_YEARS = 5

export function distanceMiles(a: LatLng, b: LatLng) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

export { COUNTY_NAMES }

export interface NearestCounty {
  code: string
  name: string
  district: District
  miles: number
}

export function nearestCounty(pin: LatLng): NearestCounty {
  let best: NearestCounty | null = null
  for (const c of COUNTY_CENTERS) {
    const miles = distanceMiles(pin, c)
    if (!best || miles < best.miles) best = { code: c.code, name: COUNTY_NAMES[c.code] ?? c.code, district: c.district, miles }
  }
  return best!
}

/* ---------- Item resolution ---------- */

export function resolveItem(
  family: ItemFamily,
  opts: { itemCode?: string; description?: string; unit?: Unit },
): ItemDef | null {
  if (opts.itemCode) {
    const exact = ITEM_CATALOG.find((i) => i.code === opts.itemCode && i.family === family)
    if (exact) return exact
  }
  const pool = ITEM_CATALOG.filter((i) => i.family === family)
  if (pool.length === 0) return null
  const words = (opts.description ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []
  const scored = pool.map((item) => {
    const haystack = item.description.toLowerCase()
    let score = words.reduce((s, w) => (w.length > 2 && haystack.includes(w) ? s + 1 : s), 0)
    if (opts.unit && item.unit === opts.unit) score += 2
    return { item, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored[0].item
}

/* ---------- Quarterly price index ---------- */

interface ItemObservation {
  time: number
  unitPrice: number
}

const observationCache = new Map<string, ItemObservation[]>()
function observations(itemCode: string) {
  let obs = observationCache.get(itemCode)
  if (!obs) {
    obs = CONTRACTS.flatMap((c) => {
      const time = Date.parse(c.bidOpenDate)
      return c.lineItems.filter((li) => li.itemCode === itemCode).map((li) => ({ time, unitPrice: li.unitPrice }))
    })
    observationCache.set(itemCode, obs)
  }
  return obs
}

function shiftQuarter(quarterStart: number, by: number) {
  const d = new Date(quarterStart)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by * 3, 1)
}

const MIN_QUARTER_SAMPLES = 5
const quarterAvgCache = new Map<string, number | null>()

/**
 * Average unit price for an item in the quarter starting at `quarterStart`.
 * Thin quarters borrow from up to three preceding quarters so a single
 * outlier contract can't swing the escalation ratio.
 */
function quarterAverage(itemCode: string, quarterStart: number): number | null {
  const key = `${itemCode}:${quarterStart}`
  if (quarterAvgCache.has(key)) return quarterAvgCache.get(key)!
  const obs = observations(itemCode)
  const end = shiftQuarter(quarterStart, 1)
  let result: number | null = null
  for (let back = 0; back <= 3; back++) {
    const start = shiftQuarter(quarterStart, -back)
    const inWindow = obs.filter((o) => o.time >= start && o.time < end)
    if (inWindow.length >= MIN_QUARTER_SAMPLES || (back === 3 && inWindow.length > 0)) {
      result = inWindow.reduce((s, o) => s + o.unitPrice, 0) / inWindow.length
      break
    }
  }
  quarterAvgCache.set(key, result)
  return result
}

const currentAvgCache = new Map<string, number | null>()
function currentAverage(itemCode: string) {
  if (currentAvgCache.has(itemCode)) return currentAvgCache.get(itemCode)!
  let q = quarterStartOf(DATA_END)
  let avg: number | null = null
  for (let i = 0; i < 8 && avg === null; i++, q = shiftQuarter(q, -1)) avg = quarterAverage(itemCode, q)
  currentAvgCache.set(itemCode, avg)
  return avg
}

export function escalationFactor(itemCode: string, bidTime: number) {
  const now = currentAverage(itemCode)
  const then = quarterAverage(itemCode, quarterStartOf(bidTime))
  if (!now || !then) return 1
  return now / then
}

/* ---------- Per-item-code quantity bands & price/quantity curve ---------- */

export type QuantityBand = 'Small' | 'Medium' | 'Large'

interface ItemCodeStats {
  p33: number
  p67: number
  /** Number of escalated bids used for the fit. */
  count: number
  /** log(escalated unit price) = a + b·log(quantity); null when under 8 bids. */
  reg: { a: number; b: number } | null
}

const itemCodeStatsCache = new Map<string, ItemCodeStats>()

/** Fit over every bid for a code (all bidders, all contracts), with prices escalated to now. */
function computeItemCodeStats(itemCode: string): ItemCodeStats {
  const quantities: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  for (const c of CONTRACTS) {
    const factor = escalationFactor(itemCode, Date.parse(c.bidOpenDate))
    for (const li of c.lineItems) {
      if (li.itemCode !== itemCode || li.quantity <= 0 || li.unitPrice <= 0) continue
      quantities.push(li.quantity)
      xs.push(Math.log(li.quantity))
      ys.push(Math.log(li.unitPrice * factor))
    }
  }
  quantities.sort((a, b) => a - b)
  const p33 = percentile(quantities, 1 / 3) ?? 0
  const p67 = percentile(quantities, 2 / 3) ?? 0
  let reg: { a: number; b: number } | null = null
  const n = xs.length
  if (n >= 8) {
    const mx = xs.reduce((s, v) => s + v, 0) / n
    const my = ys.reduce((s, v) => s + v, 0) / n
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my)
      sxx += (xs[i] - mx) ** 2
    }
    const b = sxx > 0 ? sxy / sxx : 0
    reg = { a: my - b * mx, b }
  }
  return { p33, p67, count: n, reg }
}

function itemCodeStats(itemCode: string): ItemCodeStats {
  let stats = itemCodeStatsCache.get(itemCode)
  if (!stats) {
    stats = computeItemCodeStats(itemCode)
    itemCodeStatsCache.set(itemCode, stats)
  }
  return stats
}

/** Small/Medium/Large by the 33rd/67th percentiles of all of this code's bid quantities. */
export function quantityBand(itemCode: string, quantity: number): QuantityBand {
  const { p33, p67 } = itemCodeStats(itemCode)
  if (quantity <= p33) return 'Small'
  if (quantity <= p67) return 'Medium'
  return 'Large'
}

/**
 * How an escalated unit price compares to what's typical for its quantity, from a log-log
 * price/quantity fit over all of the code's bids. Returns actual/expected - 1, or null when
 * the code has fewer than 8 bids.
 */
export function vsTypical(itemCode: string, quantity: number, escalatedPrice: number): number | null {
  const { reg } = itemCodeStats(itemCode)
  if (!reg || quantity <= 0 || escalatedPrice <= 0) return null
  const expected = Math.exp(reg.a + reg.b * Math.log(quantity))
  return expected > 0 ? escalatedPrice / expected - 1 : null
}

/* ---------- Comparables ---------- */

export interface Comparable {
  id: string
  ea: string
  bidDate: string
  county: string
  bidder: string
  rank: number
  quantity: number
  unit: Unit
  unitPrice: number
  factor: number
  escalatedPrice: number
  miles: number
}

export interface PriceEstimate {
  item: ItemDef
  /** True for lump-sum items, whose comparables are size-matched to similar projects. */
  lumpSum: boolean
  comparables: Comparable[]
  quantityRange: [number, number] | null
  p25: number | null
  p50: number | null
  p75: number | null
}

export interface EstimateOptions {
  /**
   * Total of the rest of the estimate (excluding this item). Lump-sum pricing is scaled to
   * the whole job, so it only draws on comparables from projects of a similar total size.
   */
  referenceTotal?: number | null
  /** Lump-sum comparables are ranked by project-type overlap with these families. */
  referenceFamilies?: ItemFamily[]
}

/** Lump-sum comparables come only from projects 0.5x–2x the reference total. */
const LS_SIZE_LO = 0.5
const LS_SIZE_HI = 2
/** Below this many size-matched comparables, a lump-sum item gets no price ("Needs price"). */
const LS_MIN_COMPARABLES = 3

const contractByEa = new Map(CONTRACTS.map((c) => [c.ea, c]))
const contractTotal = (ea: string) => contractByEa.get(ea)?.bidders[0]?.total ?? null
const projectOverlap = (ea: string, wanted: Set<ItemFamily>) =>
  wanted.size === 0 ? 0 : (contractByEa.get(ea)?.families.filter((f) => wanted.has(f)).length ?? 0)

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const QUANTITY_BANDS = [3, 10, Infinity]
const MIN_COMPARABLES = 3
const TOP_BIDDERS = 3

export function estimateItem(
  pin: LatLng,
  itemCode: string,
  quantity: number,
  opts?: EstimateOptions,
): PriceEstimate | null {
  const item = ITEM_CATALOG.find((i) => i.code === itemCode)
  if (!item) return null
  const cutoff = DATA_END - COMPARABLE_YEARS * YEAR_MS
  const lumpSum = item.unit === 'LS'

  const candidates: Comparable[] = CONTRACTS.flatMap((c) => {
    const time = Date.parse(c.bidOpenDate)
    if (time < cutoff) return []
    const miles = distanceMiles(pin, c)
    if (miles > COMPARABLE_RADIUS_MI) return []
    const ranks = new Map(c.bidders.map((b) => [b.name, b.rank]))
    const factor = escalationFactor(itemCode, time)
    return c.lineItems
      .filter((li) => li.itemCode === itemCode && (ranks.get(li.bidder) ?? 99) <= TOP_BIDDERS)
      .map((li) => ({
        id: `${c.ea}-${li.itemCode}-${li.bidder}`,
        ea: c.ea,
        bidDate: c.bidOpenDate,
        county: c.county,
        bidder: li.bidder,
        rank: ranks.get(li.bidder) ?? 0,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        factor,
        escalatedPrice: li.unitPrice * factor,
        miles,
      }))
  })

  let comparables: Comparable[] = []
  let quantityRange: [number, number] | null = null

  if (lumpSum) {
    // Lump sums scale with the whole job, so a small project must not borrow a big
    // project's price. Keep only comparables from similar-sized jobs, ranked by how much
    // their scope overlaps this estimate. With a reference size but too few matches, the
    // item gets no price so the UI can prompt the estimator for one.
    const ref = opts?.referenceTotal ?? null
    if (ref != null && ref > 0) {
      const lo = ref * LS_SIZE_LO
      const hi = ref * LS_SIZE_HI
      const wanted = new Set(opts?.referenceFamilies ?? [])
      comparables = candidates.filter((c) => {
        const total = contractTotal(c.ea)
        return total != null && total >= lo && total <= hi
      })
      comparables.sort(
        (a, b) =>
          projectOverlap(b.ea, wanted) - projectOverlap(a.ea, wanted) ||
          a.miles - b.miles ||
          b.bidDate.localeCompare(a.bidDate),
      )
      if (comparables.length < LS_MIN_COMPARABLES) {
        return { item, lumpSum, comparables, quantityRange: null, p25: null, p50: null, p75: null }
      }
    } else {
      comparables = [...candidates].sort(
        (a, b) => a.miles - b.miles || b.bidDate.localeCompare(a.bidDate) || a.rank - b.rank,
      )
    }
  } else {
    for (const band of QUANTITY_BANDS) {
      const lo = quantity / band
      const hi = quantity * band
      comparables = candidates.filter((c) => c.quantity >= lo && c.quantity <= hi)
      quantityRange = Number.isFinite(band) ? [lo, hi] : null
      if (comparables.length >= MIN_COMPARABLES) break
    }
    comparables.sort((a, b) => a.miles - b.miles || b.bidDate.localeCompare(a.bidDate) || a.rank - b.rank)
  }

  const prices = comparables.map((c) => c.escalatedPrice).sort((a, b) => a - b)

  return {
    item,
    lumpSum,
    comparables,
    quantityRange,
    p25: percentile(prices, 0.25),
    p50: percentile(prices, 0.5),
    p75: percentile(prices, 0.75),
  }
}

export interface EstimableItem {
  itemCode: string
  quantity: number
  unit: Unit
  /** User override for the unit price, if any. */
  unitPrice?: number
}

/**
 * Price every item in a bid list. Lump-sum items are size-matched to the rest of the list's
 * total (their own line excluded); the reference uses the other items' size-agnostic prices,
 * so the calculation never recurses between two lump sums. The reference scope (families) is
 * derived from the list, so lump-sum comparables prefer similar project types.
 */
export function estimateBidItems<T extends EstimableItem>(pin: LatLng, items: T[]): (PriceEstimate | null)[] {
  const base = items.map((i) => estimateItem(pin, i.itemCode, i.quantity))
  const basePrice = (i: T, k: number) => i.unitPrice ?? base[k]?.p50 ?? null
  const families = [
    ...new Set(items.map((i) => ITEM_CATALOG.find((d) => d.code === i.itemCode)?.family).filter(Boolean)),
  ] as ItemFamily[]

  return items.map((item, idx) => {
    if (item.unit !== 'LS') return base[idx]
    let referenceTotal = 0
    for (let k = 0; k < items.length; k++) {
      if (k === idx) continue
      const price = basePrice(items[k], k)
      if (price != null) referenceTotal += price * items[k].quantity
    }
    return estimateItem(pin, item.itemCode, item.quantity, {
      referenceTotal: referenceTotal || null,
      referenceFamilies: families,
    })
  })
}

/* ---------- Similar projects ---------- */

export interface SimilarProject {
  contract: Contract
  miles: number
  score: number
  sharedFamilies: ItemFamily[]
  matchTotal: number
}

export function rankSimilarProjects(pin: LatLng, families: ItemFamily[], limit = 8): SimilarProject[] {
  const wanted = new Set(families)
  const ranked = CONTRACTS.map((contract) => {
    const miles = distanceMiles(pin, contract)
    const ageYears = Math.max(0, (DATA_END - Date.parse(contract.bidOpenDate)) / YEAR_MS)
    const distanceScore = Math.exp(-miles / 30)
    const sharedFamilies = contract.families.filter((f) => wanted.has(f))
    const score =
      wanted.size === 0
        ? distanceScore
        : 0.45 * distanceScore + 0.2 * Math.exp(-ageYears / 4) + 0.35 * (sharedFamilies.length / wanted.size)
    const low = contract.bidders[0]
    const matchTotal = contract.lineItems
      .filter((li) => li.bidder === low.name && (wanted.size === 0 || wanted.has(li.family)))
      .reduce((s, li) => s + li.totalPrice, 0)
    return { contract, miles, score, sharedFamilies, matchTotal }
  })
  ranked.sort((a, b) => (wanted.size === 0 ? a.miles - b.miles : b.score - a.score))
  return ranked.slice(0, limit)
}
