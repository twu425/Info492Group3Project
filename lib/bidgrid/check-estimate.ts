/**
 * Reviews a built bid-item list the way a coding agent runs tests before finishing: flag
 * missing standard items, quantities that don't fit together, and prices far from their
 * comparables. Pure — it reads the list and the pricing engine, changes nothing. The agent
 * fixes what it can and reports the rest.
 */
import type { Estimator, LatLng } from './estimate'
import type { ItemFamily } from './data'

export interface CheckItem {
  id?: string
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: string
  /** User price override, if any (otherwise the comparable P50 is used). */
  unitPrice?: number
}

export interface Finding {
  severity: 'warning' | 'info'
  kind: 'missing_item' | 'no_comparables' | 'thin_data' | 'price_outlier' | 'price_vs_typical' | 'quantity_mismatch'
  message: string
  itemCode?: string
}

export interface CheckResult {
  ok: boolean
  findings: Finding[]
}

/** Overhead most Caltrans construction contracts carry; flagged when a built list omits them. */
export const EXPECTED_OVERHEAD: ItemFamily[] = ['Mobilization', 'Traffic Control', 'Water Pollution Control']

const label = (i: CheckItem) => i.description.replace(/\s+/g, ' ').trim()
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export function checkEstimate(est: Estimator, pin: LatLng, items: CheckItem[]): CheckResult {
  const findings: Finding[] = []
  if (items.length === 0) return { ok: true, findings: [] }

  // 1. Missing standard items.
  const families = new Set(items.map((i) => i.family))
  for (const f of EXPECTED_OVERHEAD) {
    if (!families.has(f)) findings.push({ severity: 'warning', kind: 'missing_item', message: `No ${f} item — most Caltrans contracts include one.` })
  }

  // 2. Per-item price sanity, against each item's own comparables.
  const estimates = est.estimateBidItems(pin, items)
  items.forEach((it, idx) => {
    const e = estimates[idx]
    if (!e) {
      findings.push({ severity: 'warning', kind: 'no_comparables', message: `No comparable data within range for ${label(it)}.`, itemCode: it.itemCode })
      return
    }
    if (!e.lumpSum && e.comparables.length > 0 && e.comparables.length < 3) {
      findings.push({ severity: 'info', kind: 'thin_data', message: `${label(it)} is priced from only ${e.comparables.length} comparable${e.comparables.length === 1 ? '' : 's'} — treat its price as rough.`, itemCode: it.itemCode })
    }
    const price = it.unitPrice ?? e.p50
    // A user override well outside the comparable band is worth a second look.
    if (it.unitPrice != null && e.p25 != null && e.p75 != null && (it.unitPrice > e.p75 * 2 || it.unitPrice < e.p25 * 0.5)) {
      findings.push({ severity: 'warning', kind: 'price_outlier', message: `${label(it)} is set to ${money(it.unitPrice)}, far outside the comparable range (${money(e.p25)}–${money(e.p75)}).`, itemCode: it.itemCode })
    }
    if (price != null) {
      const vt = est.vsTypical(it.itemCode, it.quantity, price)
      if (vt != null && Math.abs(vt) > 0.75) {
        findings.push({ severity: 'info', kind: 'price_vs_typical', message: `${label(it)} unit price is ${vt > 0 ? 'well above' : 'well below'} what's typical for this quantity (${vt > 0 ? '+' : ''}${Math.round(vt * 100)}%).`, itemCode: it.itemCode })
      }
    }
  })

  // 3. Asphalt tonnage vs. the paved area it covers (the classic cross-item check).
  const paved = items.find((i) => i.unit === 'SQYD' && /(cold plane|grind|pavement|paving)/i.test(i.description))
  const hma = items.find((i) => i.unit === 'TON' && /(asphalt|hot mix|hma)/i.test(i.description))
  if (paved && hma && paved.quantity > 0) {
    const tonsPerSy = hma.quantity / paved.quantity
    // ~0.1 ton/SY is a typical overlay; outside a wide band the two quantities don't fit.
    if (tonsPerSy < 0.02 || tonsPerSy > 0.8) {
      findings.push({
        severity: 'warning',
        kind: 'quantity_mismatch',
        message: `Asphalt tonnage (${hma.quantity} TON) doesn't fit the paved area (${paved.quantity} SY) — ${tonsPerSy.toFixed(3)} ton/SY, vs. a typical ~0.08–0.2. Recheck the thickness or the area.`,
      })
    }
  }

  return { ok: !findings.some((f) => f.severity === 'warning'), findings }
}
