/**
 * Unit tests for computeQuantity, checkEstimate, and searchBidders (no network, no model).
 * Run: npx tsx eval/harness/tools.test.ts
 */
import { CONTRACTS } from '../../lib/bidgrid/data'
import { catalogByCode } from '../../lib/bidgrid/catalog'
import { createEstimator, type LatLng } from '../../lib/bidgrid/estimate'
import { computeQuantity } from '../../lib/bidgrid/compute'
import { checkEstimate, EXPECTED_OVERHEAD, type CheckItem } from '../../lib/bidgrid/check-estimate'
import { searchBidders } from '../../lib/bidgrid/bidders'
import type { ItemFamily } from '../../lib/bidgrid/data'

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` — ${detail ?? ''}`}`)
  if (!cond) failures++
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
const est = createEstimator(CONTRACTS, (c) => catalogByCode.get(c))

function item(code: string, quantity: number, unit: string, description: string, unitPrice?: number): CheckItem {
  return { itemCode: code, description, family: catalogByCode.get(code)?.family ?? 'Other', quantity, unit, unitPrice }
}

/* ---------- computeQuantity ---------- */

function testCompute() {
  console.log('computeQuantity:')
  // 1 mile × 48 ft (two 24 ft lanes) → 253,440 SF → 28,160 SY (the trace's conversion).
  const area = computeQuantity({ operation: 'area', lengthMiles: 1, widthFt: 24, lanes: 2 })
  check('area: 1 mi × 2×24 ft = 28,160 SY', 'quantity' in area && near(area.quantity, 28160, 0.01) && area.unit === 'SQYD', JSON.stringify(area))

  // areaSqft directly gives the same answer.
  const area2 = computeQuantity({ operation: 'area', areaSqft: 253440 })
  check('area: areaSqft 253440 → 28,160 SY', 'quantity' in area2 && near(area2.quantity, 28160, 0.01))

  // Tonnage: 253,440 SF × 0.2 ft × 145 lb/CF ÷ 2000 = 3,674.88 TON.
  const tons = computeQuantity({ operation: 'tonnage', areaSqft: 253440, depthFt: 0.2 })
  check('tonnage: default HMA density → 3,674.88 TON', 'quantity' in tons && near(tons.quantity, 3674.88, 0.01) && tons.unit === 'TON', JSON.stringify(tons))

  // Tonnage with explicit density override.
  const tons2 = computeQuantity({ operation: 'tonnage', areaSqft: 100000, depthFt: 0.5, densityLbPerCf: 140 })
  check('tonnage: override density 140 → 3,500 TON', 'quantity' in tons2 && near(tons2.quantity, (100000 * 0.5 * 140) / 2000, 0.01))

  // Volume: 2,700 SF × 0.5 ft = 1,350 CF ÷ 27 = 50 CY.
  const vol = computeQuantity({ operation: 'volume', areaSqft: 2700, depthFt: 0.5 })
  check('volume: 2,700 SF × 0.5 ft → 50 CY', 'quantity' in vol && near(vol.quantity, 50, 0.01) && vol.unit === 'CY', JSON.stringify(vol))

  // Linear: half a mile → 2,640 LF.
  const lin = computeQuantity({ operation: 'linear', lengthMiles: 0.5 })
  check('linear: 0.5 mi → 2,640 LF', 'quantity' in lin && near(lin.quantity, 2640, 0.01) && lin.unit === 'LF')

  // Missing inputs → error, not a guess.
  const bad = computeQuantity({ operation: 'area', lengthFt: 100 })
  check('area without width → error', 'error' in bad, JSON.stringify(bad))
  const bad2 = computeQuantity({ operation: 'tonnage', areaSqft: 1000 })
  check('tonnage without depth → error', 'error' in bad2)
}

/* ---------- checkEstimate ---------- */

// A pin in a data-dense area (Sacramento, District 3) so paving codes have comparables.
const SAC: LatLng = { lat: 38.58, lng: -121.49 }

function testCheck() {
  console.log('checkEstimate:')

  // Empty list → ok, no findings.
  const empty = checkEstimate(est, SAC, [])
  check('empty list → ok, no findings', empty.ok && empty.findings.length === 0)

  // Grind + overlay with consistent quantities, but no overhead → 3 missing_item warnings, no mismatch.
  const paving = [
    item('398200', 28160, 'SQYD', 'Cold plane asphalt concrete pavement'),
    item('390132', 2816, 'TON', 'Hot mix asphalt (type A)'),
  ]
  const r1 = checkEstimate(est, SAC, paving)
  const missing = r1.findings.filter((f) => f.kind === 'missing_item').map((f) => f.message)
  check('flags all 3 missing overhead items', EXPECTED_OVERHEAD.every((f) => missing.some((m) => m.includes(f))), missing.join(' | '))
  check('consistent tonnage → no quantity_mismatch', !r1.findings.some((f) => f.kind === 'quantity_mismatch'), r1.findings.map((f) => f.kind).join(','))
  check('not ok (has warnings)', !r1.ok)

  // Absurd asphalt tonnage vs. paved area → quantity_mismatch warning.
  const mismatch = checkEstimate(est, SAC, [
    item('398200', 10, 'SQYD', 'Cold plane asphalt concrete pavement'),
    item('390132', 1000, 'TON', 'Hot mix asphalt (type A)'),
  ])
  check('impossible tons/area → quantity_mismatch', mismatch.findings.some((f) => f.kind === 'quantity_mismatch'), mismatch.findings.map((f) => f.kind).join(','))

  // A wild user price override → price_outlier warning.
  const outlier = checkEstimate(est, SAC, [item('390132', 1000, 'TON', 'Hot mix asphalt (type A)', 999999)])
  check('absurd override price → price_outlier', outlier.findings.some((f) => f.kind === 'price_outlier'), outlier.findings.map((f) => f.kind).join(','))
}

/* ---------- searchBidders ---------- */

function testBidders() {
  console.log('searchBidders:')
  const res = searchBidders(CONTRACTS, SAC, { itemFamilies: ['Hot Mix Asphalt'], itemCode: '390132', radiusMi: 60 })
  check('considered some contracts', res.contractsConsidered > 0, String(res.contractsConsidered))
  check('returned bidders (≤ 6)', res.bidders.length > 0 && res.bidders.length <= 6, String(res.bidders.length))
  check('sorted by contractsBid desc', res.bidders.every((b, i) => i === 0 || res.bidders[i - 1].contractsBid >= b.contractsBid))
  check('wins ≤ contractsBid and winRate in [0,1]', res.bidders.every((b) => b.wins <= b.contractsBid && b.winRate >= 0 && b.winRate <= 1))
  check('winRate matches wins/contractsBid', res.bidders.every((b) => near(b.winRate, Math.round((b.wins / b.contractsBid) * 100) / 100, 0.001)))
  check('some firm has a price-vs-median figure', res.bidders.some((b) => b.priceVsMedianPct != null), 'none had 390132 prices nearby')

  // A pinpoint radius yields nothing, without crashing.
  const none = searchBidders(CONTRACTS, { lat: 0, lng: 0 }, { radiusMi: 1 })
  check('pin in the ocean → no bidders, no crash', none.bidders.length === 0 && none.contractsConsidered === 0)
}

testCompute()
testCheck()
testBidders()
console.log(failures === 0 ? '\nPASS — tools unit tests' : `\nFAIL — ${failures} assertion(s)`)
process.exit(failures === 0 ? 0 : 1)
