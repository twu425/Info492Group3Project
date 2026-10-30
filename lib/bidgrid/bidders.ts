/**
 * Competitor intelligence from the bid record: who usually bids this kind of work near the
 * pin, how often they win, and how their unit prices compare with the median. Pure over a
 * Contract[] so the server can run it on the DB-sourced set and the eval on the bundle.
 */
import type { Contract, ItemFamily } from './data'
import { distanceMiles, type LatLng } from './estimate'

export interface BidderSummary {
  name: string
  /** Distinct nearby contracts this firm bid on. */
  contractsBid: number
  wins: number
  winRate: number
  /** Median winning low-bid total across the contracts they won (null if they won none). */
  medianWinTotal: number | null
  /**
   * For a given itemCode: this firm's median unit price vs. the overall median, as a percent
   * (−12 = 12% under the median). Null when no itemCode was asked or they never bid it.
   */
  priceVsMedianPct: number | null
  /** A few EAs for linking (wins first). */
  sampleEas: string[]
}

export interface SearchBiddersResult {
  bidders: BidderSummary[]
  contractsConsidered: number
  radiusMi: number
  itemCode?: string
}

export interface SearchBiddersOptions {
  itemFamilies?: ItemFamily[]
  itemCode?: string
  radiusMi?: number
  limit?: number
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

interface Acc {
  eas: Set<string>
  winEas: string[]
  winTotals: number[]
  unitPrices: number[]
}

export function searchBidders(contracts: Contract[], pin: LatLng, opts: SearchBiddersOptions = {}): SearchBiddersResult {
  const radiusMi = opts.radiusMi ?? 50
  const limit = opts.limit ?? 6
  const want = new Set(opts.itemFamilies ?? [])
  const nearby = contracts.filter(
    (c) => distanceMiles(pin, c) <= radiusMi && (want.size === 0 || c.families.some((f) => want.has(f))),
  )

  // Overall median unit price for the item code across nearby contracts (all bidders).
  const overallPrices: number[] = []
  if (opts.itemCode) {
    for (const c of nearby) for (const li of c.lineItems) if (li.itemCode === opts.itemCode && li.unitPrice > 0) overallPrices.push(li.unitPrice)
  }
  const overallMedian = median(overallPrices)

  const acc = new Map<string, Acc>()
  const get = (name: string) => {
    let a = acc.get(name)
    if (!a) { a = { eas: new Set(), winEas: [], winTotals: [], unitPrices: [] }; acc.set(name, a) }
    return a
  }
  for (const c of nearby) {
    for (const b of c.bidders) {
      const a = get(b.name)
      a.eas.add(c.ea)
      if (b.rank === 1) { a.winEas.push(c.ea); a.winTotals.push(b.total) }
    }
    if (opts.itemCode) {
      for (const li of c.lineItems) if (li.itemCode === opts.itemCode && li.unitPrice > 0) get(li.bidder).unitPrices.push(li.unitPrice)
    }
  }

  const bidders: BidderSummary[] = [...acc.entries()]
    .map(([name, a]) => {
      const contractsBid = a.eas.size
      const wins = a.winEas.length
      const bidderMedian = median(a.unitPrices)
      const priceVsMedianPct =
        bidderMedian != null && overallMedian != null && overallMedian > 0
          ? Math.round((bidderMedian / overallMedian - 1) * 1000) / 10
          : null
      const sampleEas = [...new Set([...a.winEas, ...a.eas])].slice(0, 3)
      return {
        name,
        contractsBid,
        wins,
        winRate: contractsBid ? Math.round((wins / contractsBid) * 100) / 100 : 0,
        medianWinTotal: a.winTotals.length ? median(a.winTotals) : null,
        priceVsMedianPct,
        sampleEas,
      }
    })
    .sort((a, b) => b.contractsBid - a.contractsBid || b.wins - a.wins)
    .slice(0, limit)

  return { bidders, contractsConsidered: nearby.length, radiusMi, itemCode: opts.itemCode }
}
