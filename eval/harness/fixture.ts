/**
 * Builds the leave-one-out eval fixture: ~15 real contracts chosen as held-out
 * test cases, stratified across the work types that actually exist in the data.
 *
 * The original class eval used 9 synthetic locations whose ground-truth EAs no
 * longer exist in the real dataset (0/23 present). Instead, each test case here
 * IS a real contract: we feed the agent its location + a natural-language
 * description derived from its dominant covered work, hold the contract out of
 * its own comparables, and score against its own line items and low-bid total.
 *
 *   npx tsx eval/harness/fixture.ts
 */
import { writeFileSync } from 'node:fs'
import { CONTRACTS, type Contract, type ItemFamily } from '../../lib/bidgrid/data'
import { distanceMiles } from '../../lib/bidgrid/estimate'
import { COMPARABLE_RADIUS_MI } from '../../lib/bidgrid/estimate'
import { FIXTURE_PATH, SUPPORTED_FAMILIES, lowBid, coveredLineItems, type FixtureCase } from './lib'

/** Readable phrase per family, used to write a plausible estimator's project description. */
const FAMILY_PHRASE: Partial<Record<ItemFamily, string>> = {
  'Hot Mix Asphalt': 'hot mix asphalt paving',
  'Rubberized HMA': 'rubberized asphalt overlay',
  'Cold Planing': 'cold planing of the existing pavement',
  'Aggregate Base': 'aggregate base',
  'Seal Coats & Surface Treatments': 'surface seal treatment',
  'PCC Pavement': 'concrete pavement',
  'Minor Concrete': 'minor concrete (curb, gutter, sidewalk)',
  'Structural Concrete': 'structural concrete',
  'Concrete Barrier': 'concrete barrier',
  'Reinforced Concrete Pipe': 'reinforced concrete drainage pipe',
  'Corrugated Steel Pipe': 'corrugated steel drainage pipe',
  'Drainage Inlets': 'drainage inlets',
  'Thermoplastic Striping': 'thermoplastic striping',
  'Pavement Markers': 'pavement markers',
  'Roadside Signs': 'roadside signs',
  'Traffic Signals': 'traffic signal and lighting work',
  'Lighting': 'roadway lighting',
  'Metal Beam Guardrail': 'metal beam guardrail',
  'Sound Wall': 'sound wall',
  'Retaining Wall': 'retaining wall',
  'Reinforcing Steel': 'reinforcing steel',
  'Erosion Control': 'erosion control',
  'Planting': 'planting',
  'Irrigation': 'irrigation',
  'Roadway Excavation': 'roadway excavation',
  Embankment: 'embankment',
  'Clearing & Grubbing': 'clearing and grubbing',
  Fencing: 'fencing',
  'Bridge Deck & Rehab': 'bridge deck rehabilitation',
  'Piles & Shoring': 'piles and shoring',
  'Structural Steel': 'structural steel',
  Mobilization: 'mobilization',
  'Traffic Control': 'traffic control',
  'Project Overhead': 'project overhead',
  'Water Pollution Control': 'water pollution control',
  Other: 'miscellaneous work',
}

function lengthMiles(c: Contract): number | null {
  const d = Math.abs(c.postmileEnd - c.postmileStart)
  return d > 0 && d < 200 ? Math.round(d * 10) / 10 : null
}

/** Covered-family spend breakdown for a contract's low bid, biggest first. */
function coveredBreakdown(c: Contract) {
  const spend = new Map<ItemFamily, number>()
  for (const li of coveredLineItems(c)) spend.set(li.family, (spend.get(li.family) ?? 0) + li.totalPrice)
  return [...spend.entries()].sort((a, b) => b[1] - a[1]).map(([family, s]) => ({ family, spend: Math.round(s) }))
}

function describe(c: Contract, breakdown: { family: ItemFamily }[]): string {
  // Full scope: name every covered family (capped so the text stays realistic), so
  // family recall isn't capped by the prompt. Quantities are NOT given — the length
  // is, so the agent can scale, but it still has to estimate like a real estimator.
  const phrases = breakdown.slice(0, 8).map((b) => FAMILY_PHRASE[b.family] ?? b.family.toLowerCase())
  const work = phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}` : phrases[0]
  const len = lengthMiles(c)
  const extent = len ? ` The project runs about ${len} miles.` : ''
  const route = c.route ? `Route ${c.route}` : 'a state route'
  return (
    `I'm estimating a Caltrans project on ${route}${c.county ? ` in ${c.county} County` : ''}. ` +
    `The scope covers: ${work}.${extent} ` +
    `Build the full preliminary bid item list covering all of that work. ` +
    `Use typical assumptions for any dimension I don't give, and proceed without asking me questions.`
  )
}

/** Contracts containing the same family within the comparable radius (excluding self). */
function sameTypeNeighbors(c: Contract, family: ItemFamily): number {
  return CONTRACTS.filter(
    (o) =>
      o.ea !== c.ea &&
      o.families.includes(family) &&
      distanceMiles({ lat: c.lat, lng: c.lng }, { lat: o.lat, lng: o.lng }) <= COMPARABLE_RADIUS_MI,
  ).length
}

function main() {
  const supported = new Set(SUPPORTED_FAMILIES)
  // Candidate contracts: meaningful covered spend, a real primary covered family,
  // and at least a few same-type neighbors in range so the case is scoreable.
  const candidates = CONTRACTS.map((c) => {
    const breakdown = coveredBreakdown(c)
    const coveredSpend = breakdown.reduce((s, b) => s + b.spend, 0)
    const total = lowBid(c)
    const primary = breakdown[0]?.family
    return { c, breakdown, coveredSpend, total, primary }
  }).filter(
    (x) =>
      x.primary &&
      supported.has(x.primary) &&
      x.total > 250_000 &&
      x.coveredSpend / x.total > 0.15 &&
      sameTypeNeighbors(x.c, x.primary) >= 3,
  )

  // Stratify by primary covered family; take the families with the most candidates,
  // one representative each (the median-sized contract, for a non-degenerate case).
  const byFamily = new Map<ItemFamily, typeof candidates>()
  for (const x of candidates) {
    const arr = byFamily.get(x.primary!) ?? []
    arr.push(x)
    byFamily.set(x.primary!, arr)
  }
  const families = [...byFamily.entries()].sort((a, b) => b[1].length - a[1].length).map(([f]) => f)
  // Each family's candidates, median-sized first, so one representative is non-degenerate.
  for (const f of families) byFamily.get(f)!.sort((a, b) => a.total - b.total)
  const picks = new Map<ItemFamily, number>(families.map((f) => [f, 0]))

  // Round-robin across work types (up to 3 per family) until we have ~15 distinct cases.
  const chosenCandidates: typeof candidates = []
  let added = true
  while (chosenCandidates.length < 15 && added) {
    added = false
    for (const f of families) {
      if (chosenCandidates.length >= 15) break
      const arr = byFamily.get(f)!
      const used = picks.get(f)!
      if (used >= 3 || used >= arr.length) continue
      // spread picks across the size distribution: median, then ends
      const order = [Math.floor(arr.length / 2), 0, arr.length - 1]
      chosenCandidates.push(arr[order[used]])
      picks.set(f, used + 1)
      added = true
    }
  }

  const chosen: FixtureCase[] = []
  for (const pick of chosenCandidates) {
    const c = pick.c
    chosen.push({
      ea: c.ea,
      lat: c.lat,
      lng: c.lng,
      county: c.county,
      district: c.district,
      route: c.route,
      bidOpenDate: c.bidOpenDate,
      lowBidTotal: Math.round(pick.total),
      coveredSpend: pick.coveredSpend,
      lengthMiles: lengthMiles(c),
      primaryFamily: pick.primary!,
      coveredFamilies: pick.breakdown.filter((b) => supported.has(b.family)),
      description: describe(c, pick.breakdown),
    })
  }

  writeFileSync(FIXTURE_PATH, JSON.stringify(chosen, null, 2))
  console.log(`Wrote ${chosen.length} cases to ${FIXTURE_PATH}`)
  for (const c of chosen) {
    console.log(
      `  ${c.ea}  ${c.primaryFamily.padEnd(26)} $${(c.lowBidTotal / 1e6).toFixed(2)}M  covered ${(
        (100 * c.coveredSpend) / c.lowBidTotal
      ).toFixed(0)}%  ${c.county}  len=${c.lengthMiles ?? '?'}mi`,
    )
  }
}

main()
