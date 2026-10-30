/**
 * Caltrans postmile lookup against the State Highway Network "SHN Postmiles (Tenth)"
 * FeatureServer. Server-only (it makes outbound HTTP and sets a User-Agent the browser
 * forbids). Two cases:
 *   (a) postmiles given  → the segment's location, length, and shape;
 *   (b) only a pin given → the route, county, and postmile at the pin.
 *
 * Query shape matches scraper/caltrans/location.py so the app and the pipeline agree:
 * outSR=4326, f=json, results sorted by PM, segments range-queried on
 * County/Route/PM (vertices are noisy floats and not every tenth exists). This module
 * adds Odometer-based length (postmiles can jump at realignments) and averages the
 * Left/Right vertices a divided highway returns for each postmile.
 */
import { COUNTY_CENTERS, COUNTY_NAMES, type District } from './data'
import type { LatLng } from './estimate'

const POSTMILE_URL =
  'https://gisdata.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Postmiles_Tenth/FeatureServer/0/query'
/** Matches scraper/caltrans/config.py USER_AGENT so the site owner can reach us. */
export const CALTRANS_USER_AGENT = 'BidGrid research script (contact: kawahara@gmail.com)'

const TIMEOUT_MS = 10_000
const PIN_RADIUS_M = 500
const PIN_RADIUS_RETRY_M = 2_000
const MAX_POINTS = 50
/** lengthMi vs. postmile arithmetic diverging past this fraction implies a realignment. */
const REALIGN_TOLERANCE = 0.05
const FAR_FROM_PIN_MI = 2
const METERS_PER_FOOT = 0.3048

export interface LocatePostmilesInput {
  beginPm?: number
  endPm?: number
  route?: number
  county?: string
  pmPrefix?: string
}

export interface PostmilePoint {
  pm: number
  lat: number
  lng: number
}

export interface PostmileSegment {
  beginPm: number
  endPm: number
  /** max(Odometer) − min(Odometer): true driven length, robust to postmile jumps. */
  lengthMi: number
  /** endPm − beginPm: the postmile arithmetic, which a realignment makes disagree. */
  pmDifference: number
  begin: LatLng
  end: LatLng
  center: LatLng
  distanceFromPinMi: number
  /** Thinned to ~50 points for drawing on the map. */
  points: PostmilePoint[]
}

export interface RouteCandidate {
  route: number
  county: string
  nearestPm: number
  distanceFt: number
}

export interface PostmileResult {
  county: string
  route: number
  district: District | null
  pin: { nearestPm: number; distanceFt: number } | null
  segment?: PostmileSegment
  candidates?: RouteCandidate[]
  warnings: string[]
}

export type LocatePostmilesOutput = PostmileResult | { error: string }

interface Feature {
  attributes: Record<string, string | number | null>
  geometry?: { x: number; y: number }
}

/* ---------- County → district (from the project's own geography table) ---------- */

const COUNTY_TO_DISTRICT: Record<string, District> = Object.fromEntries(
  COUNTY_CENTERS.map((c) => [c.code, c.district]),
)
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTY_NAMES).map(([code, name]) => [name.toLowerCase(), code]),
)

/** Accept a county code ("ED") or name ("El Dorado", "El Dorado County"); return the code. */
function toCountyCode(input: string): string {
  const trimmed = input.trim()
  const upper = trimmed.toUpperCase()
  if (/^[A-Z]{1,4}$/.test(upper) && upper !== 'COUNTY') return upper
  const name = trimmed.toLowerCase().replace(/\s+county$/, '')
  return NAME_TO_CODE[name] ?? upper.replace(/\s+COUNTY$/, '')
}

function countyToDistrict(code: string): District | null {
  return COUNTY_TO_DISTRICT[code] ?? null
}

/* ---------- Geometry ---------- */

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h))
}
const metersToFeet = (m: number) => m / METERS_PER_FOOT
const metersToMiles = (m: number) => m / 1609.344

/* ---------- API access (10s timeout, in-memory cache, scraper User-Agent) ---------- */

const cache = new Map<string, Feature[]>()

async function queryApi(params: Record<string, string | number>): Promise<Feature[]> {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) search.set(k, String(v))
  const key = search.toString()
  const cached = cache.get(key)
  if (cached) return cached

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resp = await fetch(`${POSTMILE_URL}?${key}`, {
      headers: { 'User-Agent': CALTRANS_USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!resp.ok) throw new Error(`postmile service HTTP ${resp.status}`)
    const json = (await resp.json()) as { features?: Feature[]; error?: { message?: string } }
    if (json.error) throw new Error(json.error.message || 'postmile service error')
    const features = json.features ?? []
    cache.set(key, features)
    return features
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error(`postmile service timed out after ${TIMEOUT_MS / 1000}s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

const SEGMENT_FIELDS = 'County,Route,RteSuffix,PMPrefix,PM,PMSuffix,AlignCode,Odometer'

const num = (v: string | number | null | undefined): number | null => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Average the Left/Right vertices a divided highway returns at one postmile into a single point. */
interface MergedPoint {
  pm: number
  lat: number
  lng: number
  odometer: number | null
  county: string
}
function mergeByPostmile(features: Feature[]): MergedPoint[] {
  const groups = new Map<string, Feature[]>()
  for (const f of features) {
    if (!f.geometry) continue
    const pm = num(f.attributes.PM)
    if (pm == null) continue
    const key = `${f.attributes.PMPrefix ?? ''}:${pm.toFixed(3)}`
    const arr = groups.get(key)
    if (arr) arr.push(f)
    else groups.set(key, [f])
  }
  const merged: MergedPoint[] = []
  for (const fs of groups.values()) {
    const pm = num(fs[0].attributes.PM)!
    const lng = fs.reduce((s, f) => s + f.geometry!.x, 0) / fs.length
    const lat = fs.reduce((s, f) => s + f.geometry!.y, 0) / fs.length
    const odos = fs.map((f) => num(f.attributes.Odometer)).filter((o): o is number => o != null)
    const odometer = odos.length ? odos.reduce((s, o) => s + o, 0) / odos.length : null
    merged.push({ pm, lat, lng, odometer, county: String(fs[0].attributes.County ?? '') })
  }
  merged.sort((a, b) => a.pm - b.pm)
  return merged
}

/** Evenly sample down to ~MAX_POINTS, always keeping the first and last. */
function thin(points: PostmilePoint[]): PostmilePoint[] {
  if (points.length <= MAX_POINTS) return points
  const step = (points.length - 1) / (MAX_POINTS - 1)
  const out: PostmilePoint[] = []
  for (let i = 0; i < MAX_POINTS; i++) out.push(points[Math.round(i * step)])
  return out
}

/* ---------- Pin → route / county / postmile ---------- */

interface PinLookup {
  county: string
  route: number
  nearestPm: number
  distanceFt: number
  candidates: RouteCandidate[]
  radiusM: number
}

async function lookupPin(pin: LatLng): Promise<PinLookup | null> {
  for (const radiusM of [PIN_RADIUS_M, PIN_RADIUS_RETRY_M]) {
    const features = await queryApi({
      geometry: `${pin.lng},${pin.lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: 4326,
      distance: radiusM,
      units: 'esriSRUnit_Meter',
      spatialRel: 'esriSpatialRelIntersects',
      outFields: SEGMENT_FIELDS,
      returnGeometry: 'true',
      outSR: 4326,
      f: 'json',
    })
    const pts = features
      .filter((f) => f.geometry && num(f.attributes.PM) != null && num(f.attributes.Route) != null)
      .map((f) => ({
        county: String(f.attributes.County ?? ''),
        route: num(f.attributes.Route)!,
        pm: num(f.attributes.PM)!,
        distanceFt: metersToFeet(haversineMeters(pin, { lat: f.geometry!.y, lng: f.geometry!.x })),
      }))
      .sort((a, b) => a.distanceFt - b.distanceFt)
    if (pts.length === 0) continue

    // One candidate per distinct route, at its closest vertex to the pin.
    const byRoute = new Map<string, RouteCandidate>()
    for (const p of pts) {
      const k = `${p.county}-${p.route}`
      if (!byRoute.has(k)) byRoute.set(k, { route: p.route, county: p.county, nearestPm: p.pm, distanceFt: Math.round(p.distanceFt) })
    }
    const closest = pts[0]
    return {
      county: closest.county,
      route: closest.route,
      nearestPm: closest.pm,
      distanceFt: Math.round(closest.distanceFt),
      candidates: [...byRoute.values()].sort((a, b) => a.distanceFt - b.distanceFt),
      radiusM,
    }
  }
  return null
}

/* ---------- Postmiles → segment ---------- */

async function lookupSegment(
  county: string,
  route: number,
  beginPm: number,
  endPm: number | undefined,
  pmPrefix: string | undefined,
  pin: LatLng,
  warnings: string[],
): Promise<PostmileSegment | null> {
  const single = endPm == null || endPm === beginPm
  const lo = single ? beginPm : Math.min(beginPm, endPm!)
  const hi = single ? beginPm : Math.max(beginPm, endPm!)
  let where = `County='${county}' AND Route=${route} AND PM>=${lo} AND PM<=${hi}`
  if (pmPrefix) where += ` AND PMPrefix='${pmPrefix.toUpperCase()}'`

  const features = await queryApi({
    where,
    outFields: SEGMENT_FIELDS,
    orderByFields: 'PM',
    returnGeometry: 'true',
    outSR: 4326,
    f: 'json',
  })
  const merged = mergeByPostmile(features)
  if (merged.length === 0) {
    warnings.push(
      `No postmile found for PM ${single ? beginPm : `${lo}–${hi}`} on Route ${route} in ${county}${
        pmPrefix ? ` (prefix ${pmPrefix.toUpperCase()})` : ' — if this is a prefixed postmile (e.g. R, T, M), include the prefix'
      }.`,
    )
    return null
  }

  const begin = merged[0]
  const end = merged[merged.length - 1]
  const toPoint = (m: MergedPoint): PostmilePoint => ({ pm: m.pm, lat: m.lat, lng: m.lng })
  const center: LatLng = {
    lat: merged.reduce((s, m) => s + m.lat, 0) / merged.length,
    lng: merged.reduce((s, m) => s + m.lng, 0) / merged.length,
  }
  const odos = merged.map((m) => m.odometer).filter((o): o is number => o != null)
  const lengthMi = odos.length >= 2 ? Math.abs(Math.max(...odos) - Math.min(...odos)) : 0
  const pmDifference = Math.abs(end.pm - begin.pm)
  const distanceFromPinMi = metersToMiles(
    Math.min(...merged.map((m) => haversineMeters(pin, { lat: m.lat, lng: m.lng }))),
  )

  if (!single && pmDifference > 0 && Math.abs(lengthMi - pmDifference) / pmDifference > REALIGN_TOLERANCE) {
    warnings.push(
      `Driven length (${lengthMi.toFixed(2)} mi) differs from the postmile span (${pmDifference.toFixed(2)} mi) by more than 5% — the route was likely realigned here, so trust the driven length.`,
    )
  }
  // Postmiles restart at county lines; a single-county query silently drops the far side,
  // which shows up as far fewer tenth-points than the span should contain.
  if (!single && pmDifference >= 0.5 && merged.length < pmDifference * 10 * 0.6) {
    warnings.push(
      `The result covers less of Route ${route} than PM ${lo}–${hi} implies — the range may cross a county line (postmiles restart at each county) or include a gap.`,
    )
  }
  if (distanceFromPinMi > FAR_FROM_PIN_MI) {
    warnings.push(
      `This segment is about ${distanceFromPinMi.toFixed(1)} mi from the dropped pin; use the segment's own location for comparables.`,
    )
  }

  return {
    beginPm: begin.pm,
    endPm: end.pm,
    lengthMi: Math.round(lengthMi * 1000) / 1000,
    pmDifference: Math.round(pmDifference * 1000) / 1000,
    begin: { lat: begin.lat, lng: begin.lng },
    end: { lat: end.lat, lng: end.lng },
    center,
    distanceFromPinMi: Math.round(distanceFromPinMi * 100) / 100,
    points: thin(merged.map(toPoint)),
  }
}

/* ---------- Entry point ---------- */

export async function locatePostmiles(input: LocatePostmilesInput, pin: LatLng): Promise<LocatePostmilesOutput> {
  const warnings: string[] = []
  let county = input.county ? toCountyCode(input.county) : undefined
  let route = input.route
  let pinInfo: { nearestPm: number; distanceFt: number } | null = null

  try {
    // (b) Resolve route/county from the pin whenever either is missing.
    if (route == null || !county) {
      const found = await lookupPin(pin)
      if (!found) {
        return {
          county: county ?? '',
          route: route ?? 0,
          district: county ? countyToDistrict(county) : null,
          pin: null,
          warnings: ['The dropped pin is not within 2 km of any state highway, so no route or postmile could be found here.'],
        }
      }
      if (found.radiusM === PIN_RADIUS_RETRY_M)
        warnings.push(`Nearest state highway is about ${found.distanceFt} ft away (nothing within 500 m of the pin).`)
      // More than one route nearby: hand back candidates instead of guessing.
      if (found.candidates.length > 1 && (route == null || !county)) {
        return {
          county: found.county,
          route: found.route,
          district: countyToDistrict(found.county),
          pin: { nearestPm: found.nearestPm, distanceFt: found.distanceFt },
          candidates: found.candidates,
          warnings,
        }
      }
      county = county ?? found.county
      route = route ?? found.route
      pinInfo = { nearestPm: found.nearestPm, distanceFt: found.distanceFt }
    }

    // (a) Resolve the segment when postmiles are given.
    let segment: PostmileSegment | undefined
    if (input.beginPm != null && county && route != null) {
      segment = (await lookupSegment(county, route, input.beginPm, input.endPm, input.pmPrefix, pin, warnings)) ?? undefined
    }

    return {
      county: county ?? '',
      route: route ?? 0,
      district: county ? countyToDistrict(county) : null,
      pin: pinInfo,
      segment,
      warnings,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The Caltrans postmile service could not be reached.' }
  }
}

/** Test seam: clear the in-memory response cache. */
export function _clearPostmileCache() {
  cache.clear()
}
