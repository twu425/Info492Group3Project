/**
 * Guard tests for queryBids. Writes/DDL/multi-statement/PRAGMA/ATTACH must all be
 * rejected, and the DB must be untouched. A plain SELECT works and the 200-row cap holds.
 *
 *   npx tsx eval/harness/query-bids.test.ts
 */
import path from 'node:path'
import Database from 'better-sqlite3'
import { runQueryBids, MAX_ROWS } from '../../lib/bidgrid/query-bids'

const db = new Database(path.join(process.cwd(), 'scraper', 'data', 'bidgrid.db'), { readonly: true })
const count = () => db.prepare('SELECT COUNT(*) n FROM contracts').get() as { n: number }
const before = count().n

let failures = 0
const ok = (cond: boolean, msg: string) => {
  if (!cond) { console.error('FAIL:', msg); failures++ }
}
const isErr = (r: unknown): r is { error: string } => !!r && typeof r === 'object' && 'error' in r

// Each of these must be rejected (return an error), none may execute.
const rejected: [string, string][] = [
  ['INSERT', "INSERT INTO contracts (ea) VALUES ('x')"],
  ['UPDATE', "UPDATE contracts SET district = 0"],
  ['DELETE', 'DELETE FROM contracts'],
  ['DROP', 'DROP TABLE contracts'],
  ['two statements', 'SELECT 1; DROP TABLE contracts'],
  ['PRAGMA', 'PRAGMA table_info(contracts)'],
  ['ATTACH', "ATTACH DATABASE 'x.db' AS y"],
  ['WITH…DELETE', 'WITH t AS (SELECT ea FROM contracts) DELETE FROM contracts WHERE ea IN (SELECT ea FROM t)'],
]
for (const [label, sql] of rejected) {
  const r = runQueryBids(db, sql, `guard test: ${label}`)
  ok(isErr(r), `${label} should be rejected, got ${JSON.stringify(r).slice(0, 80)}`)
}

// A valid read works and returns columns + rows.
const good = runQueryBids(db, "SELECT district, COUNT(*) n FROM contracts GROUP BY district ORDER BY district", 'valid select')
ok(!isErr(good), 'valid SELECT should succeed')
if (!isErr(good)) {
  ok(good.columns.includes('district') && good.columns.includes('n'), 'columns present')
  ok(good.rowCount > 0, 'rows returned')
}

// WITH … SELECT works.
const withSel = runQueryBids(db, 'WITH t AS (SELECT district FROM contracts) SELECT COUNT(*) n FROM t', 'with select')
ok(!isErr(withSel), 'WITH … SELECT should succeed')

// 200-row cap holds and truncated is reported.
const capped = runQueryBids(db, 'SELECT id FROM line_items', 'row cap')
ok(!isErr(capped) && capped.rowCount === MAX_ROWS && capped.truncated, '200-row cap + truncated flag')

// The DB was not mutated by any of the above.
ok(count().n === before, `contracts row count unchanged (${before})`)

console.log(failures === 0 ? `queryBids guards OK (${rejected.length} rejections, DB untouched)` : `queryBids guards FAILED: ${failures}`)
process.exit(failures === 0 ? 0 : 1)
