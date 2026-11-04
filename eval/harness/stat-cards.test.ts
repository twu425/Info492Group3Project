/**
 * Unit tests for the item stat cards: each item type shows exactly 4 cards, and the typical
 * range formats with a spaced en dash and 2 significant figures over $1,000.
 * Run: npx tsx eval/harness/stat-cards.test.ts
 */
import { formatTypicalRange, statCardKeys } from '../../lib/bidgrid/item-stats'
import { computeItemStats } from '../../lib/bidgrid/item-stats-db'

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` — ${detail ?? ''}`}`)
  if (!cond) failures++
}
const EN = '–'

console.log('statCardKeys — always exactly 4:')
const ls = statCardKeys(true)
const other = statCardKeys(false)
check('LS item → 4 cards', ls.length === 4, ls.join(','))
check('LS includes Share of contract total, not Data points', ls.includes('shareOfContract') && !ls.includes('dataPoints'), ls.join(','))
check('non-LS item → 4 cards', other.length === 4, other.join(','))
check('non-LS includes Data points, not Share of contract total', other.includes('dataPoints') && !other.includes('shareOfContract'), other.join(','))
check('both start with the three shared cards', ['winningPrice', 'typicalRange', 'winnersVsField'].every((k, i) => ls[i] === k && other[i] === k))

console.log('\nAgainst real computed stats:')
for (const code of ['398200', '390132', '130100']) {
  const s = computeItemStats(code)
  check(`${code} (${s.isLumpSum ? 'LS' : s.unit}) → 4 cards`, statCardKeys(s.isLumpSum).length === 4)
}

console.log('\nformatTypicalRange:')
check('spaced en dash', formatTypicalRange(1500, 4000) === `$1,500 ${EN} $4,000`, formatTypicalRange(1500, 4000))
check('≤ $1,000 unchanged', formatTypicalRange(169, 790) === `$169 ${EN} $790`, formatTypicalRange(169, 790))
check('2 sig figs over $1,000', formatTypicalRange(1523, 3890) === `$1,500 ${EN} $3,900`, formatTypicalRange(1523, 3890))
check('large values to 2 sig figs', formatTypicalRange(42350, 123456) === `$42,000 ${EN} $120,000`, formatTypicalRange(42350, 123456))
check('round values stay put', formatTypicalRange(5000, 35000) === `$5,000 ${EN} $35,000`, formatTypicalRange(5000, 35000))

console.log(failures === 0 ? '\nPASS — stat-cards unit tests' : `\nFAIL — ${failures} assertion(s)`)
process.exit(failures === 0 ? 0 : 1)
