import path from 'node:path'
import Database from 'better-sqlite3'

import type {
  BidderStat,
  ContractDetail,
  ContractFilters,
  ContractSummary,
  FamilyStat,
  Meta,
} from './contract-types'

// Read-only singleton. The DB is built by the scraper (python -m cli.build_db).
const DB_PATH = path.join(process.cwd(), 'scraper', 'data', 'bidgrid.db')

let _db: Database.Database | null = null
function db(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true })
    _db.pragma('journal_mode = WAL')
  }
  return _db
}

function familiesFor(ea: string): string[] {
  return db()
    .prepare('SELECT family FROM contract_families WHERE contract_ea = ? ORDER BY family')
    .all(ea)
    .map((r: any) => r.family)
}

/** Build a WHERE clause + params from the shared filter shape. */
function whereClause(f: ContractFilters): { sql: string; params: any[] } {
  const clauses: string[] = []
  const params: any[] = []
  if (f.districts?.length) {
    clauses.push(`c.district IN (${f.districts.map(() => '?').join(',')})`)
    params.push(...f.districts)
  }
  if (f.families?.length) {
    // Match contracts that touch any of the requested families (not just primary).
    clauses.push(
      `c.ea IN (SELECT contract_ea FROM contract_families WHERE family IN (${f.families
        .map(() => '?')
        .join(',')}))`,
    )
    params.push(...f.families)
  }
  if (f.yearMin != null) {
    clauses.push(`c.bid_date >= ?`)
    params.push(`${f.yearMin}-01-01`)
  }
  if (f.yearMax != null) {
    clauses.push(`c.bid_date <= ?`)
    params.push(`${f.yearMax}-12-31`)
  }
  if (f.q) {
    clauses.push(`(c.ea LIKE ? OR c.county LIKE ? OR c.low_bidder LIKE ? OR c.type_of_work LIKE ?)`)
    const like = `%${f.q}%`
    params.push(like, like, like, like)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

function toSummary(c: any): ContractSummary {
  return {
    ea: c.ea,
    district: c.district,
    county: c.county,
    route: c.route,
    postmileStart: c.postmile_start,
    postmileEnd: c.postmile_end,
    bidOpenDate: c.bid_date,
    projectType: c.project_type,
    typeOfWork: c.type_of_work,
    primaryFamily: c.primary_family,
    families: familiesFor(c.ea),
    lat: c.lat,
    lng: c.lng,
    numBidders: c.num_bidders,
    numItems: c.num_items,
    lowBidder: c.low_bidder,
    lowTotal: c.low_total,
  }
}

export function listContracts(filters: ContractFilters = {}): ContractSummary[] {
  const { sql, params } = whereClause(filters)
  const rows = db()
    .prepare(`SELECT * FROM contracts c ${sql} ORDER BY c.bid_date DESC, c.ea`)
    .all(...params)
  return rows.map(toSummary)
}

export function getContract(ea: string): ContractDetail | null {
  const c: any = db().prepare('SELECT * FROM contracts WHERE ea = ?').get(ea)
  if (!c) return null
  const bidders = db()
    .prepare('SELECT name, rank, total FROM bidders WHERE contract_ea = ? ORDER BY rank')
    .all(ea)
  const lineItems = db()
    .prepare(
      `SELECT item_code AS itemCode, item_flag AS itemFlag, description, family, unit,
              quantity, unit_price AS unitPrice, total_price AS totalPrice,
              bidder_name AS bidder, bidder_rank AS bidderRank
       FROM line_items WHERE contract_ea = ? ORDER BY item_no, bidder_rank`,
    )
    .all(ea)
  const locations = db()
    .prepare(
      `SELECT county, route, pm_prefix AS pmPrefix, begin_pm AS beginPm, end_pm AS endPm,
              centroid_lon AS centroidLon, centroid_lat AS centroidLat,
              n_points AS nPoints, geocode_level AS geocodeLevel
       FROM locations WHERE contract_ea = ? ORDER BY n_points DESC`,
    )
    .all(ea)
  return {
    ...toSummary(c),
    pdfUrl: c.pdf_url ?? null,
    bidders: bidders as any,
    lineItems: lineItems as any,
    locations: locations as any,
  }
}

export function familyStats(filters: ContractFilters = {}): FamilyStat[] {
  // Aggregate low-bidder line items by family, over the filtered contract set.
  const { sql, params } = whereClause(filters)
  const rows = db()
    .prepare(
      `SELECT li.family AS family,
              COUNT(DISTINCT li.contract_ea) AS contractCount,
              COUNT(*) AS itemCount,
              SUM(li.total_price) AS lowBidValue
       FROM line_items li
       JOIN contracts c ON c.ea = li.contract_ea
       ${sql ? sql + ' AND' : 'WHERE'} li.bidder_rank = 1
       GROUP BY li.family
       ORDER BY lowBidValue DESC`,
    )
    .all(...params)
  return rows.map((r: any) => ({
    family: r.family,
    category: '', // filled client-side from FAMILY_CATEGORY (taxonomy lives in data.ts)
    contractCount: r.contractCount,
    itemCount: r.itemCount,
    lowBidValue: r.lowBidValue ?? 0,
  }))
}

export function getBidder(name: string): BidderStat | null {
  const contracts = db()
    .prepare(
      `SELECT b.contract_ea AS ea, b.rank, b.total, c.bid_date AS bidOpenDate,
              c.primary_family AS primaryFamily
       FROM bidders b JOIN contracts c ON c.ea = b.contract_ea
       WHERE b.name = ? ORDER BY c.bid_date DESC`,
    )
    .all(name) as any[]
  if (!contracts.length) return null
  const wins = contracts.filter((c) => c.rank === 1)
  return {
    name,
    bidCount: contracts.length,
    winCount: wins.length,
    wonValue: wins.reduce((s, c) => s + (c.total ?? 0), 0),
    contracts,
  }
}

export function getMeta(): Meta {
  const d = db()
  const districts = (d.prepare('SELECT DISTINCT district FROM contracts ORDER BY district').all() as any[]).map(
    (r) => r.district,
  )
  const families = (
    d.prepare('SELECT DISTINCT family FROM contract_families ORDER BY family').all() as any[]
  ).map((r) => r.family)
  const years: any = d.prepare('SELECT MIN(bid_date) lo, MAX(bid_date) hi FROM contracts').get()
  const count: any = d.prepare('SELECT COUNT(*) n FROM contracts').get()
  return {
    districts,
    families,
    minYear: years.lo ? Number(years.lo.slice(0, 4)) : 0,
    maxYear: years.hi ? Number(years.hi.slice(0, 4)) : 0,
    contractCount: count.n,
  }
}
