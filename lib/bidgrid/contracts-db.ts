/**
 * Server-only contract set + pricing engine sourced directly from bidgrid.db.
 *
 * The agent's pricing and similar-project tools run on THIS, not on the committed JSON bundle.
 * Rows are read from the database and passed through the exact same `buildContract` transform
 * the bundle uses, so the resulting Contract[] is identical to the bundle's — the two are the
 * same scrape (same 239 contracts / 73,832 line items). That identity is what keeps the agent's
 * prices equal to the prices the browser renders from the bundle (the price-parity invariant),
 * while every number the agent reports now comes from a live DB read.
 *
 * Imported only by the API route, so better-sqlite3 stays server-side. Built once per process.
 */
import {
  buildContract,
  type Bidder,
  type Contract,
  type RawContract,
  type RawLineItem,
  type RawLocation,
} from './data'
import { catalogItemDb } from './catalog-db'
import { createEstimator, type Estimator } from './estimate'
import { queryDb } from './query-bids'

interface ContractRow {
  ea: string
  district: number
  bid_date: string
}
interface BidderRow {
  contract_ea: string
  rank: number
  name: string
  total: number
}
interface LineItemRow {
  contract_ea: string
  item_code: string
  item_flag: string | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  total_price: number
  bidder_name: string
  bidder_rank: number
}
interface LocationRow {
  contract_ea: string
  county: string
  route: number | null
  pm_prefix: string | null
  begin_pm: number | null
  end_pm: number | null
  centroid_lon: number | null
  centroid_lat: number | null
  n_points: number | null
  geocode_level: string | null
}

/** Group rows by their contract_ea into a Map, preserving query (insertion) order. */
function groupByEa<T extends { contract_ea: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const arr = map.get(r.contract_ea)
    if (arr) arr.push(r)
    else map.set(r.contract_ea, [r])
  }
  return map
}

function loadContracts(): Contract[] {
  const db = queryDb()
  const contractRows = db.prepare('SELECT ea, district, bid_date FROM contracts').all() as ContractRow[]
  // Order mirrors the bundle's scrape order (line items by insertion id, bidders by rank) so
  // tie-breaks in the engine resolve identically to the browser.
  const bidders = groupByEa(
    db.prepare('SELECT contract_ea, rank, name, total FROM bidders ORDER BY contract_ea, rank').all() as BidderRow[],
  )
  const lineItems = groupByEa(
    db
      .prepare(
        'SELECT contract_ea, item_code, item_flag, description, quantity, unit, unit_price, total_price, bidder_name, bidder_rank FROM line_items ORDER BY id',
      )
      .all() as LineItemRow[],
  )
  const locations = groupByEa(
    db
      .prepare(
        'SELECT contract_ea, county, route, pm_prefix, begin_pm, end_pm, centroid_lon, centroid_lat, n_points, geocode_level FROM locations ORDER BY id',
      )
      .all() as LocationRow[],
  )

  const raw: RawContract[] = contractRows.map((c) => {
    const bidderList: Bidder[] = (bidders.get(c.ea) ?? []).map((b) => ({
      name: b.name,
      rank: b.rank,
      total: b.total,
    }))
    const lineItemList: RawLineItem[] = (lineItems.get(c.ea) ?? []).map((li) => ({
      itemCode: li.item_code,
      itemFlag: li.item_flag ?? '',
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitPrice: li.unit_price,
      totalPrice: li.total_price,
      bidder: li.bidder_name,
      bidderRank: li.bidder_rank,
    }))
    const locationList: RawLocation[] = (locations.get(c.ea) ?? []).map((l) => ({
      county: l.county,
      route: l.route ?? 0,
      pmPrefix: l.pm_prefix ?? '',
      beginPm: l.begin_pm,
      endPm: l.end_pm,
      centroidLon: l.centroid_lon,
      centroidLat: l.centroid_lat,
      nPoints: l.n_points ?? 0,
      geocodeLevel: l.geocode_level ?? '',
    }))
    return {
      ea: c.ea,
      district: c.district,
      bidOpenDate: c.bid_date,
      bidders: bidderList,
      lineItems: lineItemList,
      locations: locationList,
    }
  })

  // Same transform and sort order as the bundle (lib/bidgrid/data.ts).
  return raw.map(buildContract).sort((a, b) => a.bidOpenDate.localeCompare(b.bidOpenDate))
}

let contractsCache: Contract[] | null = null
export function dbContracts(): Contract[] {
  if (!contractsCache) contractsCache = loadContracts()
  return contractsCache
}

let estimatorCache: Estimator | null = null
/** The pricing engine the agent uses, running over contracts read live from bidgrid.db. */
export function dbEstimator(): Estimator {
  if (!estimatorCache) estimatorCache = createEstimator(dbContracts(), (code) => catalogItemDb(code))
  return estimatorCache
}
