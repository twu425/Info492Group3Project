/**
 * Shared, client-safe types and constants for the item stat cards. The values are computed
 * on the server (item-stats-db.ts, which reads bidgrid.db); this module carries no server
 * dependency so client components can import the shape and thresholds.
 */
import { formatUnitPrice, formatUsdWhole } from './format'

export interface StatValue {
  value: number | null
  /** Underlying bids; the UI shows "Not enough data" below MIN_BIDS. */
  bids: number
}

export interface ItemStatCards {
  code: string
  unit: string
  isLumpSum: boolean
  /** Data date span, from the data (e.g. "Jan–Sep 2026"). */
  dateRange: string
  winningPrice: StatValue
  typicalRange: { p25: number | null; p75: number | null; bids: number }
  winnersVsField: StatValue
  dataPoints: { bids: number; contracts: number }
  /** Lump-sum items only: median of (this item's low-bid amount ÷ contract low total). */
  shareOfContract: StatValue | null
  change1y: { value: number | null; show: boolean }
  change5y: { value: number | null; show: boolean }
}

/** Below this many underlying bids, a card shows "Not enough data". */
export const MIN_BIDS = 5
/** Both comparison windows need this many bids before a trend card is shown. */
export const TREND_MIN_BIDS = 20

export type StatCardKey = 'winningPrice' | 'typicalRange' | 'winnersVsField' | 'dataPoints' | 'shareOfContract'

/**
 * The stat cards to show, in order — always exactly 4. Lump-sum items swap Data points (which
 * moves into the description line) for Share of contract total. Keeping this here, pure and
 * tested, is what guarantees the grid stays a single row of four even if a card is added later.
 */
export function statCardKeys(isLumpSum: boolean): StatCardKey[] {
  return isLumpSum
    ? ['winningPrice', 'typicalRange', 'winnersVsField', 'shareOfContract']
    : ['winningPrice', 'typicalRange', 'winnersVsField', 'dataPoints']
}

/** Round to 2 significant figures (e.g. 1,523 → 1,500; 42,350 → 42,000). */
function roundTo2Sig(n: number): number {
  if (n === 0) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(n))) - 1)
  return Math.round(n / mag) * mag
}

/** One end of the typical range: whole-dollar at 2 sig figs over $1,000, else the usual price. */
function formatRangeEnd(n: number): string {
  return n > 1000 ? formatUsdWhole(roundTo2Sig(n)) : formatUnitPrice(n)
}

/** Typical range with a spaced en dash, e.g. "$1,500 – $4,000". */
export function formatTypicalRange(p25: number, p75: number): string {
  return `${formatRangeEnd(p25)} – ${formatRangeEnd(p75)}`
}
