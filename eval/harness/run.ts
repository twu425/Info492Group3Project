/**
 * BidGrid estimate-agent eval. Leave-one-out over real contracts (see fixture.ts).
 *
 *   npx tsx eval/harness/run.ts [--label baseline] [--limit N]
 *
 * Reports per label: item hit-rate (family recall / code & family precision),
 * item-matching accuracy (resolveItem/searchCatalog vs the real code),
 * total-vs-actual % error over covered scope, the comparable failure-category
 * breakdown, and step-cap hits — for both the agent and the keyword baseline.
 * Saves results/<label>.json so later phases can diff against the baseline.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Load ANTHROPIC_API_KEY from .env.local before any SDK call.
for (const line of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

import { runAgent } from './agent'
import {
  FIXTURE_PATH,
  RESULTS_DIR,
  contractByEa,
  coveredLineItems,
  scoreItemHits,
  totalError,
  unitPriceErrors,
  unitPriceDetail,
  dollarCoverage,
  categorizeComparables,
  categorizeComparablesStrict,
  keywordComparables,
  mean,
  pct,
  type FixtureCase,
  type UnitPriceDetail,
} from './lib'
import type { Variant } from './agent'
import { resolveItem } from '../../lib/bidgrid/estimate'
import { searchCatalog } from '../../lib/bidgrid/catalog'

const args = process.argv.slice(2)
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'baseline'
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity
const variant: Variant = args.includes('--variant')
  ? (args[args.indexOf('--variant') + 1] as Variant)
  : 'searchcatalog'

/* ---- item-matching accuracy probe: real description+unit -> correct code? ---- */
/** Up to `n` of a contract's covered line items (distinct codes), biggest spend first. */
function matchProbes(c: FixtureCase, n = 6) {
  const contract = contractByEa.get(c.ea)!
  const seen = new Set<string>()
  return coveredLineItems(contract)
    .sort((a, b) => b.totalPrice - a.totalPrice)
    .filter((li) => (seen.has(li.itemCode) ? false : seen.add(li.itemCode)))
    .slice(0, n)
    .map((li) => ({ description: li.description, unit: li.unit, family: li.family, code: li.itemCode }))
}
/** Resolver top-1: resolveItem (what addLineItem uses when no itemCode is passed). */
function matchingAccuracy(c: FixtureCase): number {
  const probes = matchProbes(c)
  if (!probes.length) return 0
  const hits = probes.filter((p) => resolveItem(p.family, { description: p.description, unit: p.unit })?.code === p.code)
  return hits.length / probes.length
}
/** searchCatalog top-5: does the real code appear among the candidates the agent sees? */
function catalogTop5(c: FixtureCase): number {
  const probes = matchProbes(c)
  if (!probes.length) return 0
  const hits = probes.filter((p) =>
    searchCatalog(p.description, { unit: p.unit, family: p.family, limit: 5 }).some((cand) => cand.code === p.code),
  )
  return hits.length / probes.length
}

function relevantShare(breakdown: Record<string, number>): number {
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0)
  return total ? breakdown.relevant / total : 0
}
function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface CaseResult {
  ea: string
  primaryFamily: string
  builtCount: number
  familyRecall: number
  codePrecision: number
  familyPrecision: number
  pctError: number
  unitPriceErrors: number[]
  dollarCoverage: number
  matchingAccuracy: number
  catalogTop5: number
  catalogSearchCount: number
  agentRelevantShare: number
  keywordRelevantShare: number
  agentRelevantStrict: number
  keywordRelevantStrict: number
  stepsUsed: number
  stopReason: string
  hitCap: boolean
  built: { itemCode: string; family: string; quantity: number; unit: string; unitPrice: number | null; quantitySource?: string }[]
  unitPriceDetail: UnitPriceDetail[]
  queryBidsCalls: { purpose: string; sql: string; ok: boolean; rowCount?: number }[]
  error?: string
}

async function main() {
  const fixture: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')).slice(0, limit)
  const results: CaseResult[] = []
  console.log(`\nRunning "${label}" over ${fixture.length} cases (model agent + keyword baseline)…\n`)

  for (const c of fixture) {
    const contract = contractByEa.get(c.ea)!
    const run = await runAgent(c, variant)
    const hits = scoreItemHits(run.built, contract)
    const te = totalError(run.built, contract)
    const testFamilies = c.coveredFamilies.map((f) => f.family)
    const kw = keywordComparables(c)
    const agentBreak = categorizeComparables(run.comparablesSeen, testFamilies, c.bidOpenDate)
    const kwBreak = categorizeComparables(kw, testFamilies, c.bidOpenDate)
    const agentStrict = categorizeComparablesStrict(run.comparablesSeen, testFamilies, c.bidOpenDate)
    const kwStrict = categorizeComparablesStrict(kw, testFamilies, c.bidOpenDate)
    const r: CaseResult = {
      ea: c.ea,
      primaryFamily: c.primaryFamily,
      builtCount: hits.builtCount,
      familyRecall: hits.familyRecall,
      codePrecision: hits.codePrecision,
      familyPrecision: hits.familyPrecision,
      pctError: te.pctError,
      unitPriceErrors: unitPriceErrors(run.built, contract),
      dollarCoverage: dollarCoverage(run.built, contract),
      matchingAccuracy: matchingAccuracy(c),
      catalogTop5: catalogTop5(c),
      catalogSearchCount: run.catalogSearches.length,
      agentRelevantShare: relevantShare(agentBreak),
      keywordRelevantShare: relevantShare(kwBreak),
      agentRelevantStrict: relevantShare(agentStrict),
      keywordRelevantStrict: relevantShare(kwStrict),
      stepsUsed: run.stepsUsed,
      stopReason: run.stopReason,
      hitCap: run.hitCap,
      built: run.built.map((b) => ({ itemCode: b.itemCode, family: b.family, quantity: b.quantity, unit: b.unit, unitPrice: b.unitPrice, quantitySource: b.quantitySource })),
      unitPriceDetail: unitPriceDetail(run.built, contract),
      queryBidsCalls: run.queryBidsCalls,
      error: run.error,
    }
    results.push(r)
    console.log(
      `  ${c.ea}  ${c.primaryFamily.padEnd(24)} built=${r.builtCount} recall=${pct(r.familyRecall)} ` +
        `cov$=${pct(r.dollarCoverage)} match=${pct(r.matchingAccuracy)} ` +
        `upErr=${r.unitPriceErrors.length ? pct(median(r.unitPriceErrors)) : 'n/a'} totErr=${(r.pctError * 100).toFixed(0)}% ` +
        `relS(ai/kw)=${pct(r.agentRelevantStrict)}/${pct(r.keywordRelevantStrict)} steps=${r.stepsUsed}/${r.stopReason}${
          r.hitCap ? ' CAP' : ''
        }` + (r.error ? `  ERROR: ${r.error}` : ''),
    )
  }

  const ok = results.filter((r) => !r.error)
  const summary = {
    label,
    variant,
    n: results.length,
    errors: results.length - ok.length,
    familyRecall: mean(ok.map((r) => r.familyRecall)),
    codePrecision: mean(ok.map((r) => r.codePrecision)),
    familyPrecision: mean(ok.map((r) => r.familyPrecision)),
    medianPctError: median(ok.map((r) => Math.abs(r.pctError))),
    medianUnitPriceError: median(ok.flatMap((r) => r.unitPriceErrors)),
    matchedItemsForUnitPrice: ok.flatMap((r) => r.unitPriceErrors).length,
    dollarCoverage: mean(ok.map((r) => r.dollarCoverage)),
    matchingAccuracy: mean(ok.map((r) => r.matchingAccuracy)),
    catalogTop5: mean(ok.map((r) => r.catalogTop5)),
    avgCatalogSearches: mean(ok.map((r) => r.catalogSearchCount)),
    agentRelevantShare: mean(ok.map((r) => r.agentRelevantShare)),
    keywordRelevantShare: mean(ok.map((r) => r.keywordRelevantShare)),
    agentRelevantStrict: mean(ok.map((r) => r.agentRelevantStrict)),
    keywordRelevantStrict: mean(ok.map((r) => r.keywordRelevantStrict)),
    capHits: ok.filter((r) => r.hitCap).length,
    avgSteps: mean(ok.map((r) => r.stepsUsed)),
  }

  console.log('\n================ SUMMARY: ' + label + ' ================')
  console.log(`cases: ${summary.n}  (errors: ${summary.errors})`)
  console.log(`item hit-rate  — family recall:     ${pct(summary.familyRecall)}`)
  console.log(`               — family precision:  ${pct(summary.familyPrecision)}`)
  console.log(`               — code precision:    ${pct(summary.codePrecision)}`)
  console.log(`item-matching accuracy (resolver):  ${pct(summary.matchingAccuracy)}`)
  console.log(`searchCatalog top-5 accuracy:       ${pct(summary.catalogTop5)}  (avg ${summary.avgCatalogSearches.toFixed(1)} catalog searches/case)`)
  console.log(`unit-price error on matched codes:  ${pct(summary.medianUnitPriceError)} (median, ${summary.matchedItemsForUnitPrice} items)`)
  console.log(`$ coverage (matched items/low bid):  ${pct(summary.dollarCoverage)}`)
  console.log(`total vs actual (median abs error): ${pct(summary.medianPctError)}`)
  console.log(`comparable relevance (loose) — agent / keyword:  ${pct(summary.agentRelevantShare)} / ${pct(summary.keywordRelevantShare)}`)
  console.log(`comparable relevance (strict)— agent / keyword:  ${pct(summary.agentRelevantStrict)} / ${pct(summary.keywordRelevantStrict)}`)
  console.log(`step-cap hits: ${summary.capHits}/${summary.n}   avg steps: ${summary.avgSteps.toFixed(1)}`)
  const stopCounts = ok.reduce<Record<string, number>>((m, r) => ((m[r.stopReason] = (m[r.stopReason] ?? 0) + 1), m), {})
  console.log(`stop reasons: ${JSON.stringify(stopCounts)}`)
  const qb = ok.flatMap((r) => r.queryBidsCalls)
  if (qb.length) {
    console.log(`queryBids: ${qb.length} calls across ${ok.filter((r) => r.queryBidsCalls.length).length} cases, ${qb.filter((q) => q.ok).length} ok`)
    for (const q of qb.slice(0, 8)) console.log(`   [${q.ok ? 'ok' : 'ERR'}] ${q.purpose}`)
  }

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
  const out = resolve(RESULTS_DIR, `${label}.json`)
  writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
  console.log(`\nSaved ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
