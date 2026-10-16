import { CONTRACTS, MIN_YEAR, type District, type ItemFamily, type LineItem, type Unit } from './data'
import { escalationFactor } from './estimate'

export interface PricePoint {
  id: string
  ea: string
  bidDate: string
  time: number
  district: District
  itemCode: string
  description: string
  quantity: number
  unit: Unit
  unitPrice: number
  /** Unit price escalated to the current quarter, for cross-year comparisons. */
  escalatedPrice: number
  /** Bidder's overall rank on the contract by total bid. */
  rank: number
  /** Total bidders on the contract. */
  contractBidders: number
  /** Rank of this bidder's unit price for this item code (1 = lowest). */
  itemRank: number
  /** Bidders who bid this item on the contract. */
  itemRankOf: number
  bidder: string
}

export interface QuarterStat {
  time: number
  avg: number
  band: [number, number]
  count: number
}

export type DistrictFilter = 'all' | District
export type RangeKey = '3y' | '5y' | 'all'

const YEAR_MS = 365.25 * 86_400_000

export const DATA_END = Math.max(...CONTRACTS.map((c) => Date.parse(c.bidOpenDate)))
const DATA_START = Date.UTC(MIN_YEAR, 0, 1)

export function quarterStartOf(time: number) {
  const d = new Date(time)
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)
}

function nextQuarter(quarterStart: number) {
  const d = new Date(quarterStart)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)
}

export const DATA_DOMAIN_END = nextQuarter(quarterStartOf(DATA_END))

export function rangeStart(range: RangeKey) {
  if (range === 'all') return DATA_START
  const years = range === '3y' ? 3 : 5
  return quarterStartOf(DATA_END - years * YEAR_MS)
}

export function familyPoints(family: ItemFamily): PricePoint[] {
  return CONTRACTS.flatMap((c) => {
    const time = Date.parse(c.bidOpenDate)
    const ranks = new Map(c.bidders.map((b) => [b.name, b.rank]))
    const famItems = c.lineItems.filter((li) => li.family === family)

    // Rank each item code's unit prices across bidders on this contract (1 = lowest).
    const itemRank = new Map<LineItem, { rank: number; of: number }>()
    const byCode = new Map<string, LineItem[]>()
    for (const li of famItems) {
      const list = byCode.get(li.itemCode)
      if (list) list.push(li)
      else byCode.set(li.itemCode, [li])
    }
    for (const list of byCode.values()) {
      ;[...list]
        .sort((a, b) => a.unitPrice - b.unitPrice)
        .forEach((li, i) => itemRank.set(li, { rank: i + 1, of: list.length }))
    }

    return famItems.map((li) => {
      const ir = itemRank.get(li)!
      return {
        id: `${c.ea}-${li.itemCode}-${li.bidder}`,
        ea: c.ea,
        bidDate: c.bidOpenDate,
        time,
        district: c.district,
        itemCode: li.itemCode,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        escalatedPrice: li.unitPrice * escalationFactor(li.itemCode, time),
        rank: ranks.get(li.bidder) ?? 0,
        contractBidders: c.bidders.length,
        itemRank: ir.rank,
        itemRankOf: ir.of,
        bidder: li.bidder,
      }
    })
  })
}

export function weightedAvg(points: PricePoint[]) {
  const qty = points.reduce((s, p) => s + p.quantity, 0)
  if (qty === 0) return null
  return points.reduce((s, p) => s + p.unitPrice * p.quantity, 0) / qty
}

function percentile(sorted: number[], p: number) {
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function quarterSeries(points: PricePoint[]): QuarterStat[] {
  const buckets = new Map<number, PricePoint[]>()
  for (const p of points) {
    const key = quarterStartOf(p.time)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(p)
    else buckets.set(key, [p])
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, ps]) => {
      const prices = ps.map((p) => p.unitPrice).sort((a, b) => a - b)
      return {
        time: start + (nextQuarter(start) - start) / 2,
        avg: weightedAvg(ps) ?? 0,
        band: [percentile(prices, 0.25), percentile(prices, 0.75)],
        count: ps.length,
      }
    })
}

function trailingWindow(points: PricePoint[], yearsAgo: number) {
  const end = DATA_END - yearsAgo * YEAR_MS
  const start = end - YEAR_MS
  return points.filter((p) => p.time > start && p.time <= end)
}

export interface ItemStats {
  current: number | null
  change1y: number | null
  change5y: number | null
  count: number
  contracts: number
}

export function itemStats(points: PricePoint[]): ItemStats {
  const current = weightedAvg(trailingWindow(points, 0))
  const prior = weightedAvg(trailingWindow(points, 1))
  const fiveAgo = weightedAvg(trailingWindow(points, 5))
  return {
    current,
    change1y: current !== null && prior !== null ? current / prior - 1 : null,
    change5y: current !== null && fiveAgo !== null ? current / fiveAgo - 1 : null,
    count: points.length,
    contracts: new Set(points.map((p) => p.ea)).size,
  }
}
