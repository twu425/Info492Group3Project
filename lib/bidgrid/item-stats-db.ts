/**
 * Item stat cards computed on the server from bidgrid.db. The figures are per item code over
 * the whole bid record (not scope-filtered), so they're stable and cached per process.
 *
 * Server-only (reads better-sqlite3); the client fetches the result via /api/item-stats and
 * imports only the type. Cards below 5 underlying bids report "not enough data" (null value);
 * the trend cards only surface when both comparison windows have enough bids.
 */
import { queryDb } from './query-bids'
import { TREND_MIN_BIDS, type ItemStatCards } from './item-stats'

export type { ItemStatCards } from './item-stats'

const YEAR_MS = 365 * 86_400_000

interface Row {
  rank: number
  price: number
  total: number
  ea: string
  date: string
  lowTotal: number | null
  unit: string
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatRange(dates: string[]): string {
  if (dates.length === 0) return ''
  const sorted = [...dates].sort()
  const [y1, m1] = sorted[0].split('-').map(Number)
  const [y2, m2] = sorted[sorted.length - 1].split('-').map(Number)
  if (y1 === y2) return m1 === m2 ? `${MON[m1 - 1]} ${y1}` : `${MON[m1 - 1]}–${MON[m2 - 1]} ${y1}`
  return `${MON[m1 - 1]} ${y1} – ${MON[m2 - 1]} ${y2}`
}

type TimedRow = Row & { time: number }

/** Median all-bidder unit price within a [lo, hi) time window, with its bid count. */
function windowMedian(rows: TimedRow[], lo: number, hi: number): { median: number | null; bids: number } {
  const prices = rows.filter((r) => r.time >= lo && r.time < hi).map((r) => r.price)
  return { median: median(prices), bids: prices.length }
}

let cache: Map<string, ItemStatCards> | null = null

export function computeItemStats(code: string): ItemStatCards {
  if (!cache) cache = new Map()
  const hit = cache.get(code)
  if (hit) return hit

  const db = queryDb()
  const rows = (
    db
      .prepare(
        `SELECT li.bidder_rank AS rank, li.unit_price AS price, li.total_price AS total,
                li.contract_ea AS ea, li.unit AS unit, c.bid_date AS date, c.low_total AS lowTotal
         FROM line_items li JOIN contracts c ON c.ea = li.contract_ea
         WHERE li.item_code = ? AND li.unit_price > 0`,
      )
      .all(code) as Row[]
  ).map((r) => ({ ...r, time: Date.parse(r.date) })) as TimedRow[]

  const unit = rows[0]?.unit ?? ''
  const isLumpSum = unit === 'LS'

  const allPrices = rows.map((r) => r.price)
  const winRows = rows.filter((r) => r.rank === 1)
  const winPrices = winRows.map((r) => r.price)
  const allSorted = [...allPrices].sort((a, b) => a - b)
  const medianAll = median(allPrices)
  const medianWin = median(winPrices)

  // Trend: recent 12 months vs. the prior 12 months, and vs. the 12 months 5 years before.
  const maxTime = rows.length ? Math.max(...rows.map((r) => r.time)) : 0
  const recent = windowMedian(rows, maxTime - YEAR_MS, maxTime + 1)
  const prior1 = windowMedian(rows, maxTime - 2 * YEAR_MS, maxTime - YEAR_MS)
  const fiveAgo = windowMedian(rows, maxTime - 6 * YEAR_MS, maxTime - 5 * YEAR_MS)
  const show1y = recent.bids >= TREND_MIN_BIDS && prior1.bids >= TREND_MIN_BIDS
  const show5y = recent.bids >= TREND_MIN_BIDS && fiveAgo.bids >= TREND_MIN_BIDS
  const change = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? a / b - 1 : null)

  // Share of contract total: median of (low-bid line amount ÷ contract low total).
  const shares = winRows.filter((r) => r.lowTotal && r.lowTotal > 0).map((r) => r.total / r.lowTotal!)

  const result: ItemStatCards = {
    code,
    unit,
    isLumpSum,
    dateRange: formatRange(rows.map((r) => r.date)),
    winningPrice: { value: medianWin, bids: winPrices.length },
    typicalRange: { p25: percentile(allSorted, 0.25), p75: percentile(allSorted, 0.75), bids: allPrices.length },
    winnersVsField: { value: change(medianWin, medianAll), bids: winPrices.length },
    dataPoints: { bids: allPrices.length, contracts: new Set(rows.map((r) => r.ea)).size },
    shareOfContract: isLumpSum ? { value: median(shares), bids: shares.length } : null,
    change1y: { value: show1y ? change(recent.median, prior1.median) : null, show: show1y },
    change5y: { value: show5y ? change(recent.median, fiveAgo.median) : null, show: show5y },
  }
  cache.set(code, result)
  return result
}
