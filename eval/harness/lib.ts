/** Shared types, config, and scoring for the BidGrid estimate-agent eval harness. */
import { resolve } from 'node:path'
import {
  CONTRACTS,
  ITEM_FAMILIES,
  getLowBidder,
  type Contract,
  type ItemFamily,
  type LineItem,
} from '../../lib/bidgrid/data'
import { distanceMiles } from '../../lib/bidgrid/estimate'

export const HARNESS_DIR = __dirname
export const FIXTURE_PATH = resolve(HARNESS_DIR, 'fixture.json')
export const RESULTS_DIR = resolve(HARNESS_DIR, 'results')

/**
 * Boilerplate families present on nearly every job that aren't a "work type" an
 * estimator maps (and that BidGrid never scoped to estimate). The agent CAN add them
 * via the real catalog, but we don't score them — covered scope is the construction work.
 */
export const OVERHEAD_FAMILIES: ItemFamily[] = [
  'Mobilization',
  'Traffic Control',
  'Project Overhead',
  'Water Pollution Control',
  'Other',
]

/** Construction families we score coverage/recall against (everything but overhead). */
export const SUPPORTED_FAMILIES: ItemFamily[] = ITEM_FAMILIES.filter((f) => !OVERHEAD_FAMILIES.includes(f))

export interface FixtureCase {
  ea: string
  lat: number
  lng: number
  county: string
  district: number
  route: number
  bidOpenDate: string
  lowBidTotal: number
  coveredSpend: number
  lengthMiles: number | null
  primaryFamily: ItemFamily
  coveredFamilies: { family: ItemFamily; spend: number }[]
  description: string
}

/** Low bidder's total for a contract (rank-1 bid). */
export function lowBid(c: Contract): number {
  return getLowBidder(c).total
}

/** Low bidder's line items whose family is one the BidGrid catalog supports. */
export function coveredLineItems(c: Contract): LineItem[] {
  const low = getLowBidder(c).name
  const supported = new Set(SUPPORTED_FAMILIES)
  return c.lineItems.filter((li) => li.bidder === low && supported.has(li.family) && li.totalPrice > 0)
}

export const contractByEa = new Map(CONTRACTS.map((c) => [c.ea, c]))

/* ------------------------- scoring ------------------------- */

export interface BuiltItem {
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: string
  unitPrice: number | null
  /** Where the quantity came from: user input, scaled from a similar project, or a default. */
  quantitySource?: 'user' | 'similar' | 'assumed'
}

export interface ItemHitScore {
  builtCount: number
  /** Built items whose exact itemCode appears in the contract's actual line items. */
  codePrecision: number
  /** Built items whose family is one the contract actually used. */
  familyPrecision: number
  /** Of the contract's covered families, the share the agent produced ≥1 item for. */
  familyRecall: number
}

export function scoreItemHits(built: BuiltItem[], c: Contract): ItemHitScore {
  const low = getLowBidder(c).name
  const actualCodes = new Set(c.lineItems.filter((li) => li.bidder === low).map((li) => li.itemCode))
  const actualFamilies = new Set(coveredLineItems(c).map((li) => li.family))
  const n = built.length || 1
  const codeHits = built.filter((b) => actualCodes.has(b.itemCode)).length
  const famHits = built.filter((b) => actualFamilies.has(b.family)).length
  const recovered = new Set(built.map((b) => b.family).filter((f) => actualFamilies.has(f)))
  return {
    builtCount: built.length,
    codePrecision: codeHits / n,
    familyPrecision: famHits / n,
    familyRecall: actualFamilies.size ? recovered.size / actualFamilies.size : 0,
  }
}

/** Agent's estimated total vs. the actual cost of the covered scope (apples-to-apples). */
export function totalError(built: BuiltItem[], c: Contract): { agentTotal: number; coveredActual: number; pctError: number } {
  const agentTotal = built.reduce((s, b) => s + (b.unitPrice ?? 0) * b.quantity, 0)
  const coveredActual = coveredLineItems(c).reduce((s, li) => s + li.totalPrice, 0)
  const pctError = coveredActual > 0 ? (agentTotal - coveredActual) / coveredActual : 0
  return { agentTotal, coveredActual, pctError }
}

/** Low bidder's unit price per item code (one entry per distinct code). */
function lowBidUnitPrices(c: Contract): Map<string, number> {
  const low = getLowBidder(c).name
  const m = new Map<string, number>()
  for (const li of c.lineItems) if (li.bidder === low && !m.has(li.itemCode)) m.set(li.itemCode, li.unitPrice)
  return m
}

export interface UnitPriceDetail {
  ea: string
  itemCode: string
  description: string
  quantity: number
  agentPrice: number
  realPrice: number
  absErr: number
}

/**
 * Unit-price accuracy on the items the agent got RIGHT by code: for each built item
 * whose code appears in the real contract, |agentPrice/realPrice − 1|. This isolates
 * pricing quality from quantity/scope guessing.
 */
export function unitPriceDetail(built: BuiltItem[], c: Contract): UnitPriceDetail[] {
  const real = lowBidUnitPrices(c)
  const out: UnitPriceDetail[] = []
  for (const b of built) {
    const rp = real.get(b.itemCode)
    if (rp != null && rp > 0 && b.unitPrice != null)
      out.push({
        ea: c.ea,
        itemCode: b.itemCode,
        description: b.description,
        quantity: b.quantity,
        agentPrice: b.unitPrice,
        realPrice: rp,
        absErr: Math.abs(b.unitPrice / rp - 1),
      })
  }
  return out
}
export function unitPriceErrors(built: BuiltItem[], c: Contract): number[] {
  return unitPriceDetail(built, c).map((d) => d.absErr)
}

/** Share of the real contract's low-bid dollars covered by the codes the agent built. */
export function dollarCoverage(built: BuiltItem[], c: Contract): number {
  const low = getLowBidder(c).name
  const builtCodes = new Set(built.map((b) => b.itemCode))
  const total = lowBid(c)
  if (total <= 0) return 0
  const covered = c.lineItems
    .filter((li) => li.bidder === low && builtCodes.has(li.itemCode))
    .reduce((s, li) => s + li.totalPrice, 0)
  return covered / total
}

/**
 * Failure-category breakdown for the comparables the agent actually pulled, judged
 * against the test contract (mirrors the original class eval's categories).
 */
export type FailureCategory = 'relevant' | 'wrong_type' | 'too_old' | 'too_far'
export interface ComparableRef {
  ea: string
  miles: number
  bidDate: string
}
/**
 * Judge each surfaced comparable against the work the agent is actually estimating:
 * relevant if it shares ≥1 of the test case's covered families and is near and recent;
 * otherwise wrong_type / too_far / too_old (mirrors the original class eval's buckets).
 */
export function categorizeComparables(
  comps: ComparableRef[],
  testFamilies: Iterable<ItemFamily>,
  testBidDate: string,
): Record<FailureCategory, number> {
  const out: Record<FailureCategory, number> = { relevant: 0, wrong_type: 0, too_old: 0, too_far: 0 }
  const fams = new Set(testFamilies)
  const testTime = Date.parse(testBidDate)
  for (const comp of comps) {
    const other = contractByEa.get(comp.ea)
    const ageYears = other ? Math.abs(testTime - Date.parse(other.bidOpenDate)) / (365.25 * 86_400_000) : 0
    if (comp.miles > 50) out.too_far++
    else if (ageYears > 3) out.too_old++
    else if (other && !other.families.some((f) => fams.has(f))) out.wrong_type++
    else out.relevant++
  }
  return out
}

/** Within one year, per the original eval's recency criterion. Rarely binds (data spans <1yr). */
const STRICT_RECENCY_YEARS = 1

/**
 * Stricter relevance: a comparable counts only if it comes from a SIMILAR PROJECT TYPE —
 * the comparable contract's own DOMINANT work (its primaryFamily) is one of the test
 * project's work types — and it is near and recent. Merely containing a shared family
 * somewhere in a big bid isn't enough, so this metric keeps headroom above ~100%.
 */
export function categorizeComparablesStrict(
  comps: ComparableRef[],
  testFamilies: Iterable<ItemFamily>,
  testBidDate: string,
): Record<FailureCategory, number> {
  const out: Record<FailureCategory, number> = { relevant: 0, wrong_type: 0, too_old: 0, too_far: 0 }
  const fams = new Set(testFamilies)
  const testTime = Date.parse(testBidDate)
  for (const comp of comps) {
    const other = contractByEa.get(comp.ea)
    const ageYears = other ? Math.abs(testTime - Date.parse(other.bidOpenDate)) / (365.25 * 86_400_000) : 0
    if (comp.miles > 50) out.too_far++
    else if (ageYears > STRICT_RECENCY_YEARS) out.too_old++
    else if (other && fams.has(other.primaryFamily)) out.relevant++
    else out.wrong_type++
  }
  return out
}

/* ------------------- keyword baseline ("simplest" method) ------------------- */

const STOP = new Set(
  "a an the the of on in to for with about over i'm estimating caltrans project route county state covers scope build full preliminary bid item list covering all that work use typical assumptions any dimension don't give proceed without asking me questions runs about miles the"
    .split(/\s+/),
)

/** Keywords an estimator-style description reduces to (drops stopwords/short tokens). */
export function keywordsOf(description: string): string[] {
  const seen = new Set<string>()
  return (description.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (w) => w.length > 3 && !STOP.has(w) && (seen.has(w) ? false : seen.add(w)),
  )
}

export interface KeywordHit extends ComparableRef {
  score: number
  primaryFamily: ItemFamily
}

/**
 * The "simplest" baseline from the original class eval: find contracts whose line-item
 * descriptions contain the query keywords, sorted by date (newest first), ignoring
 * location. Returns the top `k`.
 */
export function keywordComparables(c: FixtureCase, k = 10): KeywordHit[] {
  const words = keywordsOf(c.description)
  const pin = { lat: c.lat, lng: c.lng }
  const matches: { contract: Contract; score: number }[] = []
  for (const contract of CONTRACTS) {
    if (contract.ea === c.ea) continue
    let score = 0
    for (const li of contract.lineItems) {
      const d = li.description.toLowerCase()
      for (const w of words) if (d.includes(w)) score++
    }
    if (score > 0) matches.push({ contract, score })
  }
  // Rank by keyword relevance (best match first), date as tiebreak. Location-blind, per
  // the original "simplest" spec — that blind spot is the baseline's honest weakness.
  matches.sort((a, b) => b.score - a.score || b.contract.bidOpenDate.localeCompare(a.contract.bidOpenDate))
  return matches.slice(0, k).map((m) => ({
    ea: m.contract.ea,
    bidDate: m.contract.bidOpenDate,
    miles: Math.round(distanceMiles(pin, { lat: m.contract.lat, lng: m.contract.lng })),
    score: m.score,
    primaryFamily: m.contract.primaryFamily,
  }))
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0
}
export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}
