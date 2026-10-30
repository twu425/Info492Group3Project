/**
 * Aggregate repeated eval runs into mean + range per metric, so we can tell real
 * changes from run-to-run noise.
 *
 *   npx tsx eval/harness/aggregate.ts baseline:baseline_1,baseline_2,baseline_3 searchcatalog:searchcatalog_1,searchcatalog_2,searchcatalog_3
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RESULTS_DIR, pct } from './lib'

const METRICS: { key: string; label: string; fmt: (n: number) => string }[] = [
  { key: 'familyRecall', label: 'family recall', fmt: pct },
  { key: 'familyPrecision', label: 'family precision', fmt: pct },
  { key: 'codePrecision', label: 'code precision', fmt: pct },
  { key: 'matchingAccuracy', label: 'matching accuracy', fmt: pct },
  { key: 'catalogTop5', label: 'searchCatalog top-5', fmt: pct },
  { key: 'dollarCoverage', label: '$ coverage', fmt: pct },
  { key: 'medianUnitPriceError', label: 'unit-price err (median)', fmt: pct },
  { key: 'medianPctError', label: 'total err (median abs)', fmt: pct },
  { key: 'agentRelevantStrict', label: 'relevance STRICT — agent', fmt: pct },
  { key: 'keywordRelevantStrict', label: 'relevance STRICT — keyword', fmt: pct },
  { key: 'agentRelevantShare', label: 'relevance loose — agent', fmt: pct },
  { key: 'avgSteps', label: 'avg steps', fmt: (n) => n.toFixed(2) },
]

function stats(xs: number[]) {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length
  return { mean, min: Math.min(...xs), max: Math.max(...xs) }
}

const groups = process.argv.slice(2).map((arg) => {
  const [name, labels] = arg.split(':')
  const summaries = labels.split(',').map((l) => JSON.parse(readFileSync(resolve(RESULTS_DIR, `${l}.json`), 'utf8')).summary)
  return { name, summaries }
})

for (const g of groups) {
  console.log(`\n================ ${g.name}  (${g.summaries.length} runs) ================`)
  console.log(`${'metric'.padEnd(30)} ${'mean'.padStart(9)}   ${'range'.padStart(17)}`)
  for (const m of METRICS) {
    const vals = g.summaries.map((s: Record<string, number>) => s[m.key])
    const { mean, min, max } = stats(vals)
    console.log(`${m.label.padEnd(30)} ${m.fmt(mean).padStart(9)}   [${m.fmt(min)} … ${m.fmt(max)}]`)
  }
}

// Baseline -> searchcatalog deltas, flagged against run-to-run spread.
if (groups.length === 2) {
  const [a, b] = groups
  console.log(`\n================ ${a.name} → ${b.name}: change vs noise ================`)
  for (const m of METRICS) {
    const av = a.summaries.map((s: Record<string, number>) => s[m.key])
    const bv = b.summaries.map((s: Record<string, number>) => s[m.key])
    const am = av.reduce((s: number, x: number) => s + x, 0) / av.length
    const bm = bv.reduce((s: number, x: number) => s + x, 0) / bv.length
    const delta = bm - am
    const spread = Math.max(Math.max(...av) - Math.min(...av), Math.max(...bv) - Math.min(...bv))
    const signal = Math.abs(delta) > spread ? 'SIGNAL' : 'within noise'
    console.log(
      `${m.label.padEnd(30)} Δ=${(delta >= 0 ? '+' : '') + m.fmt(delta)}   (noise band ±${m.fmt(spread)})  ${signal}`,
    )
  }
}
