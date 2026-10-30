/**
 * Shared, client-safe types and constants for the item stat cards. The values are computed
 * on the server (item-stats-db.ts, which reads bidgrid.db); this module carries no server
 * dependency so client components can import the shape and thresholds.
 */

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
