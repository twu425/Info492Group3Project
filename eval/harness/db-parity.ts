/**
 * Proves the DB-backed engine (what the agent now uses) produces byte-identical results to the
 * bundle engine (what the browser renders). If this passes, the price-parity invariant holds:
 * the agent's numbers equal the UI's numbers, even though the agent now reads bidgrid.db live.
 */
import { CONTRACTS } from '../../lib/bidgrid/data'
import { catalogByCode } from '../../lib/bidgrid/catalog'
import { createEstimator, type LatLng, type PriceEstimate } from '../../lib/bidgrid/estimate'
import { dbContracts, dbEstimator } from '../../lib/bidgrid/contracts-db'

/**
 * The price-determining fields of an estimate. The embedded `item` metadata legitimately
 * differs (the DB catalog is now the source of descriptions and carries usage counts); what
 * must match is the money: price percentiles, lump-sum handling, and the comparable set.
 */
function priceShape(e: PriceEstimate | null) {
  if (!e) return null
  return {
    code: e.item.code,
    unit: e.item.unit,
    lumpSum: e.lumpSum,
    p25: e.p25,
    p50: e.p50,
    p75: e.p75,
    quantityRange: e.quantityRange,
    comparables: e.comparables.map((c) => `${c.ea}|${c.bidder}|${c.quantity}|${c.escalatedPrice}|${c.miles}`),
  }
}

function main() {
  const bundle = createEstimator(CONTRACTS, (c) => catalogByCode.get(c))
  const db = dbEstimator()
  const dbC = dbContracts()

  let fail = 0
  const note = (msg: string) => {
    console.log('  MISMATCH:', msg)
    fail++
  }

  // 1. Same contracts in the same order.
  if (dbC.length !== CONTRACTS.length) note(`contract count ${dbC.length} vs ${CONTRACTS.length}`)
  for (let i = 0; i < Math.min(dbC.length, CONTRACTS.length); i++) {
    const a = dbC[i]
    const b = CONTRACTS[i]
    if (a.ea !== b.ea) note(`contract[${i}] ea ${a.ea} vs ${b.ea}`)
    else if (a.lineItems.length !== b.lineItems.length)
      note(`${a.ea} lineItems ${a.lineItems.length} vs ${b.lineItems.length}`)
    else if (JSON.stringify(a) !== JSON.stringify(b)) note(`${a.ea} contract object differs`)
  }
  console.log(`contracts: ${dbC.length} compared, ${fail === 0 ? 'identical' : `${fail} differ`}`)

  // 2. Price estimates for the most-used codes across several real pins and quantities.
  const codes = [...catalogByCode.keys()]
  const freq = new Map<string, number>()
  for (const c of CONTRACTS) for (const li of c.lineItems) freq.set(li.itemCode, (freq.get(li.itemCode) ?? 0) + 1)
  const topCodes = codes.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0)).slice(0, 80)
  const pins: LatLng[] = CONTRACTS.filter((_, i) => i % 30 === 0).map((c) => ({ lat: c.lat, lng: c.lng }))
  const quantities = [1, 50, 500, 25000]

  let priceChecks = 0
  let priceFail = 0
  for (const pin of pins) {
    for (const code of topCodes) {
      for (const q of quantities) {
        const ea = JSON.stringify(priceShape(bundle.estimateItem(pin, code, q)))
        const eb = JSON.stringify(priceShape(db.estimateItem(pin, code, q)))
        priceChecks++
        if (ea !== eb) {
          priceFail++
          if (priceFail <= 5) note(`estimateItem ${code} q=${q} @ ${pin.lat},${pin.lng}`)
        }
      }
    }
  }
  console.log(`estimateItem: ${priceChecks} comparisons, ${priceFail === 0 ? 'all identical' : `${priceFail} differ`}`)
  fail += priceFail

  // 3. estimateBidItems on a mixed list (exercises lump-sum size-matching) + describeSimilarProjects.
  const fams = [...new Set(CONTRACTS.flatMap((c) => c.families))].slice(0, 8)
  let simChecks = 0
  let simFail = 0
  for (const pin of pins) {
    const sa = JSON.stringify(bundle.describeSimilarProjects(pin, fams, { limit: 5 }))
    const sb = JSON.stringify(db.describeSimilarProjects(pin, fams, { limit: 5 }))
    simChecks++
    if (sa !== sb) {
      simFail++
      note(`describeSimilarProjects @ ${pin.lat},${pin.lng} differ`)
    }
    // A bid list mixing a lump sum with priced items.
    const list = [
      { itemCode: topCodes[0], quantity: 1000, unit: 'EA' },
      { itemCode: topCodes[1], quantity: 500, unit: 'CY' },
      { itemCode: '070030', quantity: 1, unit: 'LS' },
    ]
    const ba = JSON.stringify(bundle.estimateBidItems(pin, list).map(priceShape))
    const bb = JSON.stringify(db.estimateBidItems(pin, list).map(priceShape))
    simChecks++
    if (ba !== bb) {
      simFail++
      note(`estimateBidItems @ ${pin.lat},${pin.lng} differ`)
    }
  }
  console.log(`similar+bidlist: ${simChecks} comparisons, ${simFail === 0 ? 'all identical' : `${simFail} differ`}`)
  fail += simFail

  console.log(fail === 0 ? '\nPASS — DB engine ≡ bundle engine' : `\nFAIL — ${fail} mismatches`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
