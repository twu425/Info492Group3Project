/**
 * Show the N worst unit-price errors on matched codes from a saved run, each with the
 * comparables that produced the agent's P50 — to see WHY the price was off.
 *
 *   npx tsx eval/harness/worst-prices.ts <label> [N]
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { estimateItem } from '../../lib/bidgrid/estimate'
import { catalogByCode } from '../../lib/bidgrid/catalog'
import { RESULTS_DIR, FIXTURE_PATH, type FixtureCase, type UnitPriceDetail } from './lib'

const label = process.argv[2] ?? 'searchcatalog_1'
const n = Number(process.argv[3] ?? 5)

const fixture: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
const pinByEa = new Map(fixture.map((c) => [c.ea, { lat: c.lat, lng: c.lng }]))
const results = JSON.parse(readFileSync(resolve(RESULTS_DIR, `${label}.json`), 'utf8')).results as {
  ea: string
  unitPriceDetail: UnitPriceDetail[]
}[]

const all = results.flatMap((r) => r.unitPriceDetail)
all.sort((a, b) => b.absErr - a.absErr)

console.log(`Worst ${n} unit-price errors on matched codes — run "${label}"\n`)
for (const d of all.slice(0, n)) {
  const item = catalogByCode.get(d.itemCode)
  console.log(`▇ ${d.ea}  ${d.itemCode}  ${item?.description ?? d.description}`)
  console.log(
    `   agent P50 $${d.agentPrice.toLocaleString()} vs real low-bid $${d.realPrice.toLocaleString()}  →  ${(
      d.absErr * 100
    ).toFixed(0)}% off   (agent qty ${d.quantity.toLocaleString()} ${item?.unit ?? ''})`,
  )
  const est = estimateItem(pinByEa.get(d.ea)!, d.itemCode, d.quantity, { excludeEas: [d.ea] })
  const comps = est?.comparables ?? []
  console.log(`   ${comps.length} comparables used (self-excluded):`)
  for (const cp of comps.slice(0, 6)) {
    console.log(
      `     ${cp.ea}  ${cp.bidDate}  ${Math.round(cp.miles)}mi  qty ${cp.quantity.toLocaleString()}  $${(
        Math.round(cp.escalatedPrice * 100) / 100
      ).toLocaleString()}`,
    )
  }
  console.log()
}
