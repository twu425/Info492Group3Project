/**
 * Shows the keyword-baseline query + its top results for a few cases, so the
 * baseline can be sanity-checked for fairness.
 *
 *   npx tsx eval/harness/keyword-demo.ts [indices e.g. 0 5 11]
 */
import { readFileSync } from 'node:fs'
import {
  FIXTURE_PATH,
  contractByEa,
  keywordsOf,
  keywordComparables,
  categorizeComparables,
  type FixtureCase,
} from './lib'

const fx: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
const idx = process.argv.slice(2).map(Number)
const picks = (idx.length ? idx : [0, 2, 8]).map((i) => fx[i])

for (const c of picks) {
  const contract = contractByEa.get(c.ea)!
  console.log(`\n================ ${c.ea}  (${c.primaryFamily}) ================`)
  console.log(`description: ${c.description}`)
  console.log(`QUERY keywords: ${keywordsOf(c.description).join(' ')}`)
  const testFamilies = c.coveredFamilies.map((f) => f.family)
  const famSet = new Set(testFamilies)
  const hits = keywordComparables(c, 8)
  const cats = categorizeComparables(hits, testFamilies, c.bidOpenDate)
  console.log(`\n  rank  ea          date        miles  kwScore  primaryFamily            verdict`)
  hits.forEach((h, i) => {
    const other = contractByEa.get(h.ea)!
    const sameType = other.families.some((f) => famSet.has(f))
    const verdict = h.miles > 50 ? 'too_far' : sameType ? 'relevant' : 'wrong_type'
    console.log(
      `  ${String(i + 1).padStart(2)}    ${h.ea.padEnd(11)} ${h.bidDate}  ${String(h.miles).padStart(4)}   ${String(
        h.score,
      ).padStart(5)}    ${h.primaryFamily.padEnd(24)} ${verdict}`,
    )
  })
  console.log(`  categories: ${JSON.stringify(cats)}`)
  console.log(
    `  (ground-truth test contract primaryFamily = ${contract.primaryFamily}; covered families = ${c.coveredFamilies
      .map((f) => f.family)
      .join(', ')})`,
  )
}
