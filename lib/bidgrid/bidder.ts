import {
  BIDDER_PROFILES,
  CONTRACTS,
  FAMILY_CATEGORY,
  type Category,
  type District,
  type ItemFamily,
} from './data'
import { quarterStartOf } from './family'

export interface BidRecord {
  ea: string
  bidDate: string
  time: number
  district: District
  projectType: string
  typeOfWork: string
  rank: number
  total: number
  lowTotal: number
  /** Their total over the low bid, e.g. 0.08 = 8% above low. 0 when they won. */
  pctAboveLow: number
  won: boolean
  lat: number
  lng: number
}

export interface BidderStats {
  contractsBid: number
  contractsWon: number
  winRate: number
  totalValueWon: number
  /** Mean `pctAboveLow` across contracts they lost; null if they never lost. */
  avgPctAboveLowWhenLose: number | null
}

export interface PricingPosition {
  family: ItemFamily
  category: Category
  count: number
  /** Median deviation from the per-item market median, e.g. -0.08 = 8% below median. */
  deviation: number
}

export interface QuarterBids {
  time: number
  won: number
  lost: number
}

export interface Rival {
  name: string
  shared: number
  /** Shared bids this bidder ranked above the rival. */
  wins: number
  /** Shared bids the rival ranked above this bidder. */
  losses: number
}

export interface BidderInfo {
  name: string
  home: District
  /** Top categories by line items bid, most first. */
  specialties: Category[]
  isGeneral: boolean
}

function median(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function nextQuarter(time: number) {
  const d = new Date(time)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1)
}

/** Market median unit price per item code, across every bid in the dataset. */
const ITEM_MEDIAN: Map<string, number> = (() => {
  const prices = new Map<string, number[]>()
  for (const c of CONTRACTS) {
    for (const li of c.lineItems) {
      const arr = prices.get(li.itemCode)
      if (arr) arr.push(li.unitPrice)
      else prices.set(li.itemCode, [li.unitPrice])
    }
  }
  const med = new Map<string, number>()
  for (const [code, arr] of prices) {
    arr.sort((a, b) => a - b)
    med.set(code, median(arr))
  }
  return med
})()

export function bidderBids(name: string): BidRecord[] {
  const out: BidRecord[] = []
  for (const c of CONTRACTS) {
    const bid = c.bidders.find((b) => b.name === name)
    if (!bid) continue
    const lowTotal = c.bidders[0].total
    out.push({
      ea: c.ea,
      bidDate: c.bidOpenDate,
      time: Date.parse(c.bidOpenDate),
      district: c.district,
      projectType: c.projectType,
      typeOfWork: c.typeOfWork,
      rank: bid.rank,
      total: bid.total,
      lowTotal,
      pctAboveLow: lowTotal > 0 ? bid.total / lowTotal - 1 : 0,
      won: bid.rank === 1,
      lat: c.lat,
      lng: c.lng,
    })
  }
  return out.sort((a, b) => b.time - a.time)
}

export function bidderStats(bids: BidRecord[]): BidderStats {
  const won = bids.filter((b) => b.won)
  const losses = bids.filter((b) => !b.won)
  const avgLose = losses.length ? losses.reduce((s, b) => s + b.pctAboveLow, 0) / losses.length : null
  return {
    contractsBid: bids.length,
    contractsWon: won.length,
    winRate: bids.length ? won.length / bids.length : 0,
    totalValueWon: won.reduce((s, b) => s + b.total, 0),
    avgPctAboveLowWhenLose: avgLose,
  }
}

export function bidderInfo(name: string): BidderInfo {
  const profile = BIDDER_PROFILES.find((p) => p.name === name)
  const counts = new Map<Category, number>()
  let fallbackDistrict: District | null = null
  for (const c of CONTRACTS) {
    let bidsHere = false
    for (const li of c.lineItems) {
      if (li.bidder !== name) continue
      bidsHere = true
      const cat = FAMILY_CATEGORY[li.family]
      counts.set(cat, (counts.get(cat) ?? 0) + 1)
    }
    if (bidsHere && fallbackDistrict === null) fallbackDistrict = c.district
  }
  const specialties = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat)
  return {
    name,
    home: profile?.home ?? fallbackDistrict ?? 3,
    specialties,
    isGeneral: profile ? profile.specialties === null : false,
  }
}

export function pricingPositions(name: string, minBids = 5): PricingPosition[] {
  const byFamily = new Map<ItemFamily, number[]>()
  for (const c of CONTRACTS) {
    for (const li of c.lineItems) {
      if (li.bidder !== name) continue
      const med = ITEM_MEDIAN.get(li.itemCode)
      if (!med) continue
      const dev = li.unitPrice / med - 1
      const arr = byFamily.get(li.family)
      if (arr) arr.push(dev)
      else byFamily.set(li.family, [dev])
    }
  }
  const out: PricingPosition[] = []
  for (const [family, devs] of byFamily) {
    if (devs.length < minBids) continue
    devs.sort((a, b) => a - b)
    out.push({ family, category: FAMILY_CATEGORY[family], count: devs.length, deviation: median(devs) })
  }
  return out.sort((a, b) => b.count - a.count)
}

export function bidHistory(bids: BidRecord[]): QuarterBids[] {
  if (bids.length === 0) return []
  const map = new Map<number, { won: number; lost: number }>()
  for (const b of bids) {
    const q = quarterStartOf(b.time)
    const entry = map.get(q) ?? { won: 0, lost: 0 }
    if (b.won) entry.won++
    else entry.lost++
    map.set(q, entry)
  }
  const times = [...map.keys()].sort((a, b) => a - b)
  const out: QuarterBids[] = []
  for (let t = times[0]; t <= times[times.length - 1]; t = nextQuarter(t)) {
    const entry = map.get(t) ?? { won: 0, lost: 0 }
    out.push({ time: t, won: entry.won, lost: entry.lost })
  }
  return out
}

export function headToHead(name: string, top = 5): Rival[] {
  const map = new Map<string, Rival>()
  for (const c of CONTRACTS) {
    const me = c.bidders.find((b) => b.name === name)
    if (!me) continue
    for (const other of c.bidders) {
      if (other.name === name) continue
      const rival = map.get(other.name) ?? { name: other.name, shared: 0, wins: 0, losses: 0 }
      rival.shared++
      if (me.rank < other.rank) rival.wins++
      else rival.losses++
      map.set(other.name, rival)
    }
  }
  return [...map.values()].sort((a, b) => b.shared - a.shared || b.wins - a.wins).slice(0, top)
}
