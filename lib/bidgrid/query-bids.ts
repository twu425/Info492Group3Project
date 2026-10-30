/**
 * Guarded read-only SQL execution for the estimate assistant's `queryBids` tool.
 *
 * Safety is layered: (1) the statement must begin with SELECT or WITH — rejecting
 * PRAGMA, ATTACH, and any write up front; (2) it is prepared on a readonly connection
 * and must report as a reader (catches WITH … DELETE, which parses but isn't a read);
 * (3) better-sqlite3 throws on more than one statement at prepare time. Results are then
 * capped at 200 rows and ~20 KB so a wide query can't flood the model's context.
 */
import path from 'node:path'
import Database from 'better-sqlite3'

export const MAX_ROWS = 200
export const MAX_RESULT_BYTES = 20_000

export interface QueryBidsSuccess {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
}
export interface QueryBidsError {
  error: string
}
export type QueryBidsResult = QueryBidsSuccess | QueryBidsError

/** Leading whitespace and comments removed, so we can see what the statement starts with. */
function leadingKeyword(sql: string): string {
  let s = sql.trimStart()
  // peel leading line (--…) and block (/* … */) comments
  for (;;) {
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n')
      s = nl === -1 ? '' : s.slice(nl + 1).trimStart()
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/')
      s = end === -1 ? '' : s.slice(end + 2).trimStart()
    } else break
  }
  return s.slice(0, 6).toLowerCase()
}

/** Strip one trailing semicolon (keeps the single-statement wrap valid). */
function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, '')
}

export function runQueryBids(db: Database.Database, sql: string, purpose: string): QueryBidsResult {
  const started = Date.now()
  const log = (extra: Record<string, unknown>) =>
    console.log('[queryBids]', JSON.stringify({ purpose, ms: Date.now() - started, ...extra }))

  const kw = leadingKeyword(sql)
  if (!kw.startsWith('select') && !kw.startsWith('with')) {
    const error = 'Only read-only SELECT or WITH … SELECT queries are allowed (no PRAGMA, ATTACH, or writes).'
    log({ rejected: error, sql })
    return { error }
  }

  const body = stripTrailingSemicolon(sql).trim()
  // Wrap to cap rows. Newlines isolate any trailing line-comment in `body` from the LIMIT.
  const wrapped = `SELECT * FROM (\n${body}\n) LIMIT ${MAX_ROWS + 1}`

  let stmt: Database.Statement
  try {
    stmt = db.prepare(wrapped) // throws on multiple statements / syntax / write-in-subquery
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log({ sqliteError: error, sql })
    return { error }
  }
  if (!stmt.reader) {
    const error = 'Only read-only queries are allowed.'
    log({ rejected: error, sql })
    return { error }
  }

  let columns: string[]
  let allRows: unknown[][]
  try {
    columns = stmt.columns().map((c) => c.name)
    allRows = stmt.raw(true).all() as unknown[][]
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    log({ sqliteError: error, sql })
    return { error }
  }

  let truncated = allRows.length > MAX_ROWS
  let rows = truncated ? allRows.slice(0, MAX_ROWS) : allRows

  // Byte cap: drop rows from the end until the serialized payload fits.
  const size = (r: unknown[][]) => JSON.stringify({ columns, rows: r }).length
  if (size(rows) > MAX_RESULT_BYTES) {
    truncated = true
    let lo = 0
    let hi = rows.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (size(rows.slice(0, mid)) <= MAX_RESULT_BYTES) lo = mid
      else hi = mid - 1
    }
    rows = rows.slice(0, lo)
  }

  log({ rowCount: rows.length, truncated, sql })
  return { columns, rows, rowCount: rows.length, truncated }
}

/** Dedicated readonly connection to the real DB for the production API route. */
let _queryDb: Database.Database | null = null
export function queryDb(): Database.Database {
  if (!_queryDb) {
    const dbPath = path.join(process.cwd(), 'scraper', 'data', 'bidgrid.db')
    _queryDb = new Database(dbPath, { readonly: true, fileMustExist: true })
  }
  return _queryDb
}
