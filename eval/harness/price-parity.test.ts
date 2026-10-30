/**
 * Price parity: the unit price addLineItem shows in the browser must equal the P50
 * searchComparables returned to the agent for the same item. Both go through the
 * same estimate functions; the browser prices via estimateBidItems over the whole
 * list (components/bidgrid/build/build-drawer.tsx), the tool via estimateItem
 * (app/api/build/route.ts). For a non-lump-sum item they must agree.
 *
 *   npx tsx eval/harness/price-parity.test.ts
 */
import { readFileSync } from 'node:fs'
import { estimateBidItems, estimateItem, resolveItem } from '../../lib/bidgrid/estimate'
import { FIXTURE_PATH, type FixtureCase } from './lib'

const round2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL: ' + msg)
    process.exitCode = 1
  }
}

const fixture: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
let checked = 0

for (const c of fixture) {
  const pin = { lat: c.lat, lng: c.lng }
  // One representative non-LS item per covered family present in the catalog.
  for (const { family } of c.coveredFamilies) {
    const item = resolveItem(family, {})
    if (!item || item.unit === 'LS') continue
    const qty = 100
    // What searchComparables returns to the agent:
    const tool = estimateItem(pin, item.code, qty, { excludeEas: [c.ea] })
    const toolP50 = round2(tool?.p50)
    // What addLineItem shows in the browser (single-item list, same self-exclusion):
    const browser = round2(estimateBidItems(pin, [{ itemCode: item.code, quantity: qty, unit: item.unit }], { excludeEas: [c.ea] })[0]?.p50)
    assert(
      toolP50 === browser,
      `${c.ea} ${item.code} (${family}): tool P50 ${toolP50} !== browser ${browser}`,
    )
    checked++
  }
}

if (process.exitCode) console.error(`\nPrice parity FAILED (${checked} non-LS items checked)`)
else console.log(`Price parity OK — ${checked} non-LS items agree between searchComparables and addLineItem.`)
