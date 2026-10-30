import {
  CONTRACTS,
  COUNTY_CENTERS,
  COUNTY_NAMES,
  type Contract,
  type District,
  type ItemDef,
  type ItemFamily,
  type Unit,
} from './data'
import { catalogByCode, catalogByFamily, searchCatalog } from './catalog'
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

/* ---------- Item resolution (catalog metadata, data-identical across DB and bundle) ---------- */

export function resolveItem(
  family: ItemFamily,
  opts: { itemCode?: string; description?: string; unit?: Unit },
): ItemDef | null {
  // An explicit real code wins — trust it even if its classified family differs from
  // the one the caller guessed (the code is the ground truth).
  if (opts.itemCode) {
    const exact = catalogByCode.get(opts.itemCode)
    if (exact) return exact
  }
  // Otherwise match the description against the real catalog, preferring the given family
  // but falling back to a catalog-wide match if nothing in-family fits.
  if (opts.description) {
    const inFamily = searchCatalog(opts.description, { unit: opts.unit, family, limit: 1 })
    if (inFamily.length) return catalogByCode.get(inFamily[0].code) ?? null
    const anywhere = searchCatalog(opts.description, { unit: opts.unit, limit: 1 })
    if (anywhere.length) return catalogByCode.get(anywhere[0].code) ?? null
  }
  // No description: the most widely-used item in the family is a reasonable representative.
  return catalogByFamily.get(family)?.[0] ?? null
}

/* ---------- Pure helpers ---------- */

function shiftQuarter(quarterStart: number, by: number) {
  const d = new Date(quarterStart)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + by * 3, 1)
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/** Project length in miles from its postmile extent, when sensible. */
function projectLengthMiles(c: Contract): number | null {
  const d = Math.abs(c.postmileEnd - c.postmileStart)
  return d > 0 && d < 200 ? Math.round(d * 10) / 10 : null
}

/* ---------- Types ---------- */

export type QuantityBand = 'Small' | 'Medium' | 'Large'

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
  /** Contract EAs to drop from the comparable pool (used by the eval harness for leave-one-out). */
  excludeEas?: readonly string[]
}

export interface EstimableItem {
  itemCode: string
  quantity: number
  unit: Unit
  /** User override for the unit price, if any. */
  unitPrice?: number
}

export interface SimilarProject {
  contract: Contract
  miles: number
  score: number
  sharedFamilies: ItemFamily[]
  matchTotal: number
}

export interface SimilarProjectItem {
  itemCode: string
  description: string
  unit: Unit
  quantity: number
  /** quantity / project length in miles, so the agent can scale to a different length. */
  quantityPerMile: number | null
}
export interface SimilarProjectOut {
  ea: string
  bidDate: string
  miles: number
  projectType: string
  lengthMiles: number | null
  lowBidTotal: number
  items: SimilarProjectItem[]
}

/** Everything that reads the historical bid record — pricing, comparables, similar projects. */
export interface Estimator {
  pinArea(pin: LatLng): NearestCounty
  escalationFactor(itemCode: string, bidTime: number): number
  quantityBand(itemCode: string, quantity: number): QuantityBand
  vsTypical(itemCode: string, quantity: number, escalatedPrice: number): number | null
  estimateItem(pin: LatLng, itemCode: string, quantity: number, opts?: EstimateOptions): PriceEstimate | null
  estimateBidItems<T extends EstimableItem>(
    pin: LatLng,
    items: T[],
    opts?: Pick<EstimateOptions, 'excludeEas'>,
  ): (PriceEstimate | null)[]
  rankSimilarProjects(
    pin: LatLng,
    families: ItemFamily[],
    limit?: number,
    excludeEas?: readonly string[],
  ): SimilarProject[]
  describeSimilarProjects(
    pin: LatLng,
    families: ItemFamily[],
    opts?: { limit?: number; itemsPerProject?: number; excludeEas?: readonly string[] },
  ): SimilarProjectOut[]
}

/* ---------- Engine ---------- */

const MIN_QUARTER_SAMPLES = 5
const QUANTITY_BANDS = [3, 10, Infinity]
const MIN_COMPARABLES = 3
const TOP_BIDDERS = 3
/** Lump-sum comparables come only from projects 0.5x–2x the reference total. */
const LS_SIZE_LO = 0.5
const LS_SIZE_HI = 2
/** Below this many size-matched comparables, a lump-sum item gets no price ("Needs price"). */
const LS_MIN_COMPARABLES = 3

interface ItemObservation {
  time: number
  unitPrice: number
}

interface ItemCodeStats {
  p33: number
  p67: number
  /** Number of escalated bids used for the fit. */
  count: number
  /** log(escalated unit price) = a + b·log(quantity); null when under 8 bids. */
  reg: { a: number; b: number } | null
}

/**
 * Builds the pricing engine over one set of contracts. The contracts are the only data
 * source, so the same algorithm runs identically over the committed JSON bundle (in the
 * browser) and over bidgrid.db (on the server) — the two are the same scrape, so the numbers
 * match. `lookupItem` supplies an item code's catalog metadata (unit, description, family).
 */
export function createEstimator(
  contracts: Contract[],
  lookupItem: (code: string) => ItemDef | undefined,
): Estimator {
  const observationCache = new Map<string, ItemObservation[]>()
  const quarterAvgCache = new Map<string, number | null>()
  const currentAvgCache = new Map<string, number | null>()
  const itemCodeStatsCache = new Map<string, ItemCodeStats>()
  const contractByEa = new Map(contracts.map((c) => [c.ea, c]))
  const contractTotal = (ea: string) => contractByEa.get(ea)?.bidders[0]?.total ?? null
  const projectOverlap = (ea: string, wanted: Set<ItemFamily>) =>
    wanted.size === 0 ? 0 : (contractByEa.get(ea)?.families.filter((f) => wanted.has(f)).length ?? 0)

  function pinArea(pin: LatLng): NearestCounty {
    let best: (NearestCounty & { _m: number }) | null = null
    for (const c of contracts) {
      const miles = distanceMiles(pin, c)
      if (!best || miles < best._m)
        best = { code: c.county, name: COUNTY_NAMES[c.county] ?? c.county, district: c.district, miles, _m: miles }
    }
    const { _m, ...area } = best!
    return area
  }

  function observations(itemCode: string) {
    let obs = observationCache.get(itemCode)
    if (!obs) {
      obs = contracts.flatMap((c) => {
        const time = Date.parse(c.bidOpenDate)
        return c.lineItems.filter((li) => li.itemCode === itemCode).map((li) => ({ time, unitPrice: li.unitPrice }))
      })
      observationCache.set(itemCode, obs)
    }
    return obs
  }

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

  function currentAverage(itemCode: string) {
    if (currentAvgCache.has(itemCode)) return currentAvgCache.get(itemCode)!
    let q = quarterStartOf(DATA_END)
    let avg: number | null = null
    for (let i = 0; i < 8 && avg === null; i++, q = shiftQuarter(q, -1)) avg = quarterAverage(itemCode, q)
    currentAvgCache.set(itemCode, avg)
    return avg
  }

  function escalationFactor(itemCode: string, bidTime: number) {
    const now = currentAverage(itemCode)
    const then = quarterAverage(itemCode, quarterStartOf(bidTime))
    if (!now || !then) return 1
    return now / then
  }

  /** Fit over every bid for a code (all bidders, all contracts), with prices escalated to now. */
  function computeItemCodeStats(itemCode: string): ItemCodeStats {
    const quantities: number[] = []
    const xs: number[] = []
    const ys: number[] = []
    for (const c of contracts) {
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
  function quantityBand(itemCode: string, quantity: number): QuantityBand {
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
  function vsTypical(itemCode: string, quantity: number, escalatedPrice: number): number | null {
    const { reg } = itemCodeStats(itemCode)
    if (!reg || quantity <= 0 || escalatedPrice <= 0) return null
    const expected = Math.exp(reg.a + reg.b * Math.log(quantity))
    return expected > 0 ? escalatedPrice / expected - 1 : null
  }

  function estimateItem(
    pin: LatLng,
    itemCode: string,
    quantity: number,
    opts?: EstimateOptions,
  ): PriceEstimate | null {
    const item = lookupItem(itemCode)
    if (!item) return null
    const cutoff = DATA_END - COMPARABLE_YEARS * YEAR_MS
    const lumpSum = item.unit === 'LS'
    const excluded = opts?.excludeEas && opts.excludeEas.length ? new Set(opts.excludeEas) : null

    const candidates: Comparable[] = contracts.flatMap((c) => {
      if (excluded?.has(c.ea)) return []
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

  /**
   * Price every item in a bid list. Lump-sum items are size-matched to the rest of the list's
   * total (their own line excluded); the reference uses the other items' size-agnostic prices,
   * so the calculation never recurses between two lump sums. The reference scope (families) is
   * derived from the list, so lump-sum comparables prefer similar project types.
   */
  function estimateBidItems<T extends EstimableItem>(
    pin: LatLng,
    items: T[],
    opts?: Pick<EstimateOptions, 'excludeEas'>,
  ): (PriceEstimate | null)[] {
    const excludeEas = opts?.excludeEas
    const base = items.map((i) => estimateItem(pin, i.itemCode, i.quantity, { excludeEas }))
    const basePrice = (i: T, k: number) => i.unitPrice ?? base[k]?.p50 ?? null
    const families = [
      ...new Set(items.map((i) => lookupItem(i.itemCode)?.family).filter(Boolean)),
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
        excludeEas,
      })
    })
  }

  function rankSimilarProjects(
    pin: LatLng,
    families: ItemFamily[],
    limit = 8,
    excludeEas?: readonly string[],
  ): SimilarProject[] {
    const wanted = new Set(families)
    const excluded = excludeEas && excludeEas.length ? new Set(excludeEas) : null
    const ranked = contracts.filter((c) => !excluded?.has(c.ea)).map((contract) => {
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

  /**
   * Top similar past contracts near the pin, each with the low bidder's biggest line items
   * and their quantity-per-mile — so the agent can see which catalog items similar jobs used
   * and roughly what quantities, instead of inventing a list. Self-exclusion via excludeEas.
   */
  function describeSimilarProjects(
    pin: LatLng,
    families: ItemFamily[],
    opts?: { limit?: number; itemsPerProject?: number; excludeEas?: readonly string[] },
  ): SimilarProjectOut[] {
    const ranked = rankSimilarProjects(pin, families, opts?.limit ?? 5, opts?.excludeEas)
    const itemsPerProject = opts?.itemsPerProject ?? 15
    return ranked.map((sp) => {
      const c = sp.contract
      const low = c.bidders.find((b) => b.rank === 1)?.name ?? c.bidders[0]?.name
      const length = projectLengthMiles(c)
      const items: SimilarProjectItem[] = c.lineItems
        .filter((li) => li.bidder === low && li.totalPrice > 0)
        .sort((a, b) => b.totalPrice - a.totalPrice)
        .slice(0, itemsPerProject)
        .map((li) => ({
          itemCode: li.itemCode,
          description: li.description,
          unit: li.unit,
          quantity: li.quantity,
          quantityPerMile: length ? Math.round((li.quantity / length) * 100) / 100 : null,
        }))
      return {
        ea: c.ea,
        bidDate: c.bidOpenDate,
        miles: Math.round(sp.miles),
        projectType: c.typeOfWork || c.primaryFamily,
        lengthMiles: length,
        lowBidTotal: Math.round(c.bidders.find((b) => b.rank === 1)?.total ?? c.bidders[0]?.total ?? 0),
        items,
      }
    })
  }

  return {
    pinArea,
    escalationFactor,
    quantityBand,
    vsTypical,
    estimateItem,
    estimateBidItems,
    rankSimilarProjects,
    describeSimilarProjects,
  }
}

/* ---------- Default engine over the committed bundle (browser + eval) ---------- */

const bundle = createEstimator(CONTRACTS, (code) => catalogByCode.get(code))

export const pinArea = bundle.pinArea
export const escalationFactor = bundle.escalationFactor
export const quantityBand = bundle.quantityBand
export const vsTypical = bundle.vsTypical
export const estimateItem = bundle.estimateItem
export const estimateBidItems = bundle.estimateBidItems
export const rankSimilarProjects = bundle.rankSimilarProjects
export const describeSimilarProjects = bundle.describeSimilarProjects
