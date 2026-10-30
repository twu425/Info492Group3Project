import rawContractsJson from './contracts.generated.json'
import { classifyFamily } from './classify'

export type Category =
  | 'Concrete'
  | 'Paving'
  | 'Earthwork'
  | 'Drainage'
  | 'Structures'
  | 'Traffic & Electrical'
  | 'Landscape & Erosion'
  | 'General & Site Work'
  | 'Other'

export type ItemFamily =
  | 'Minor Concrete'
  | 'Structural Concrete'
  | 'Concrete Barrier'
  | 'PCC Pavement'
  | 'Hot Mix Asphalt'
  | 'Rubberized HMA'
  | 'Aggregate Base'
  | 'Cold Planing'
  | 'Roadway Excavation'
  | 'Embankment'
  | 'Clearing & Grubbing'
  | 'Reinforced Concrete Pipe'
  | 'Corrugated Steel Pipe'
  | 'Drainage Inlets'
  | 'Reinforcing Steel'
  | 'Retaining Wall'
  | 'Sound Wall'
  | 'Thermoplastic Striping'
  | 'Pavement Markers'
  | 'Roadside Signs'
  | 'Traffic Signals'
  | 'Lighting'
  | 'Metal Beam Guardrail'
  | 'Erosion Control'
  | 'Irrigation'
  | 'Planting'
  | 'Bridge Deck & Rehab'
  | 'Piles & Shoring'
  | 'Structural Steel'
  | 'Seal Coats & Surface Treatments'
  | 'Fencing'
  | 'Mobilization'
  | 'Traffic Control'
  | 'Project Overhead'
  | 'Water Pollution Control'
  | 'Other'

// Real bid data carries many unit codes (SQYD, LB, WDAY, HR, STA, …), so Unit is
// an open string. UNITS stays the short list the AI estimator offers.
export type Unit = string
export type District = number

export const UNITS: Unit[] = ['CY', 'TON', 'LF', 'SQFT', 'EA', 'LS']
export const DISTRICTS: District[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
export const MIN_YEAR = 2016
export const MAX_YEAR = 2026

export const DISTRICT_NAMES: Record<District, string> = {
  1: 'Eureka',
  2: 'Redding',
  3: 'Sacramento',
  4: 'Bay Area',
  5: 'San Luis Obispo',
  6: 'Fresno',
  7: 'Los Angeles',
  8: 'San Bernardino / Riverside',
  9: 'Bishop',
  10: 'Stockton',
  11: 'San Diego',
  12: 'Orange County',
}

export const CATEGORY_FAMILIES: Record<Category, ItemFamily[]> = {
  Concrete: ['Minor Concrete', 'Structural Concrete', 'Concrete Barrier', 'PCC Pavement'],
  Paving: ['Hot Mix Asphalt', 'Rubberized HMA', 'Aggregate Base', 'Cold Planing', 'Seal Coats & Surface Treatments'],
  Earthwork: ['Roadway Excavation', 'Embankment', 'Clearing & Grubbing'],
  Drainage: ['Reinforced Concrete Pipe', 'Corrugated Steel Pipe', 'Drainage Inlets'],
  Structures: [
    'Reinforcing Steel',
    'Retaining Wall',
    'Sound Wall',
    'Bridge Deck & Rehab',
    'Piles & Shoring',
    'Structural Steel',
  ],
  'Traffic & Electrical': [
    'Thermoplastic Striping',
    'Pavement Markers',
    'Roadside Signs',
    'Traffic Signals',
    'Lighting',
    'Metal Beam Guardrail',
    'Fencing',
  ],
  'Landscape & Erosion': ['Erosion Control', 'Irrigation', 'Planting'],
  'General & Site Work': ['Mobilization', 'Traffic Control', 'Project Overhead', 'Water Pollution Control'],
  Other: ['Other'],
}

export const CATEGORIES = Object.keys(CATEGORY_FAMILIES) as Category[]
export const ITEM_FAMILIES: ItemFamily[] = CATEGORIES.flatMap((c) => CATEGORY_FAMILIES[c])
export const FAMILY_CATEGORY = Object.fromEntries(
  CATEGORIES.flatMap((c) => CATEGORY_FAMILIES[c].map((f) => [f, c])),
) as Record<ItemFamily, Category>

export interface Bidder {
  name: string
  rank: number
  total: number
}

export interface LineItem {
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: Unit
  unitPrice: number
  totalPrice: number
  bidder: string
}

export interface Contract {
  ea: string
  district: District
  county: string
  route: number
  postmileStart: number
  postmileEnd: number
  bidOpenDate: string
  projectType: string
  typeOfWork: string
  lat: number
  lng: number
  primaryFamily: ItemFamily
  families: ItemFamily[]
  bidders: Bidder[]
  lineItems: LineItem[]
  /** Link to the official Caltrans bid-summary PDF (detail views only). */
  pdfUrl?: string | null
}

export interface ItemDef {
  code: string
  description: string
  family: ItemFamily
  unit: Unit
  /** 2016 unit price at the typical quantity, District 3 baseline. */
  basePrice: number
  typicalQty: number
}

/* ---------- Geography ---------- */

interface CountyDef {
  code: string
  name: string
  district: District
  lat: number
  lng: number
  spread: number
  routes: number[]
}

const county = (
  code: string,
  name: string,
  district: District,
  lat: number,
  lng: number,
  spread: number,
  routes: number[],
): CountyDef => ({ code, name, district, lat, lng, spread, routes })

const COUNTIES: CountyDef[] = [
  county('SHA', 'Shasta', 2, 40.6, -122.3, 0.18, [5, 299, 44, 273]),
  county('TEH', 'Tehama', 2, 40.1, -122.2, 0.15, [5, 36, 99]),
  county('SIS', 'Siskiyou', 2, 41.6, -122.5, 0.2, [5, 97, 3, 96]),
  county('LAS', 'Lassen', 2, 40.45, -120.6, 0.2, [36, 139, 395]),
  county('TRI', 'Trinity', 2, 40.7, -123.0, 0.15, [299, 3, 36]),
  county('PLU', 'Plumas', 2, 39.95, -120.9, 0.15, [70, 89]),
  county('SAC', 'Sacramento', 3, 38.58, -121.4, 0.12, [5, 50, 80, 99, 160]),
  county('PLA', 'Placer', 3, 38.85, -121.15, 0.1, [80, 65, 49]),
  county('YOL', 'Yolo', 3, 38.6, -121.75, 0.1, [5, 80, 113, 16]),
  county('ED', 'El Dorado', 3, 38.75, -120.75, 0.14, [50, 49]),
  county('BUT', 'Butte', 3, 39.65, -121.65, 0.12, [70, 99, 32, 149]),
  county('SUT', 'Sutter', 3, 39.05, -121.65, 0.08, [99, 20, 113]),
  county('NEV', 'Nevada', 3, 39.25, -121.0, 0.1, [20, 49, 80]),
  county('ALA', 'Alameda', 4, 37.65, -121.92, 0.12, [80, 580, 880, 238, 84]),
  county('CC', 'Contra Costa', 4, 37.92, -121.95, 0.12, [4, 24, 680, 80]),
  county('SCL', 'Santa Clara', 4, 37.25, -121.75, 0.14, [101, 280, 87, 85, 17]),
  county('SM', 'San Mateo', 4, 37.45, -122.3, 0.08, [101, 280, 92, 1, 84]),
  county('SF', 'San Francisco', 4, 37.76, -122.44, 0.03, [80, 101, 280, 1]),
  county('MRN', 'Marin', 4, 38.05, -122.7, 0.08, [101, 1, 37]),
  county('SOL', 'Solano', 4, 38.27, -121.93, 0.1, [80, 680, 12, 37]),
  county('NAP', 'Napa', 4, 38.5, -122.33, 0.08, [29, 12, 121]),
  county('SON', 'Sonoma', 4, 38.52, -122.88, 0.12, [101, 12, 116, 1]),
  county('LA', 'Los Angeles', 7, 34.08, -118.2, 0.22, [5, 10, 405, 110, 710, 101, 210, 60, 605]),
  county('VEN', 'Ventura', 7, 34.33, -119.05, 0.14, [101, 118, 126, 1, 23]),
  county('SBD', 'San Bernardino', 8, 34.1, -117.3, 0.16, [10, 15, 210, 215, 18, 60]),
  county('SBD', 'San Bernardino', 8, 34.55, -117.25, 0.2, [15, 395, 18, 58]),
  county('RIV', 'Riverside', 8, 33.9, -117.3, 0.16, [15, 60, 91, 215, 74, 79]),
  county('RIV', 'Riverside', 8, 33.72, -116.3, 0.2, [10, 111, 86]),
  county('SD', 'San Diego', 11, 32.78, -117.08, 0.13, [5, 8, 15, 805, 163, 52, 94]),
  county('SD', 'San Diego', 11, 33.15, -117.15, 0.14, [5, 15, 78, 76]),
  county('IMP', 'Imperial', 11, 32.85, -115.55, 0.2, [8, 86, 111, 98]),
]

export const COUNTY_CENTERS = COUNTIES.map(({ code, name, district, lat, lng }) => ({ code, name, district, lat, lng }))
export const COUNTY_NAMES: Record<string, string> = Object.fromEntries(COUNTIES.map((c) => [c.code, c.name]))

const DISTRICT_CENTER: Record<District, { lat: number; lng: number }> = {
  2: { lat: 40.6, lng: -122.0 },
  3: { lat: 38.9, lng: -121.3 },
  4: { lat: 37.8, lng: -122.2 },
  7: { lat: 34.1, lng: -118.4 },
  8: { lat: 34.0, lng: -117.1 },
  11: { lat: 32.9, lng: -117.0 },
}

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

/* ---------- Real data (scraped Caltrans bid summaries) ---------- */

export interface RawLineItem {
  itemCode: string
  itemFlag: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  bidder: string
  bidderRank: number
}
export interface RawLocation {
  county: string
  route: number | string
  pmPrefix: string
  beginPm: number | null
  endPm: number | null
  centroidLon: number | null
  centroidLat: number | null
  nPoints: number
  geocodeLevel: string
}
export interface RawContract {
  ea: string
  district: number
  bidOpenDate: string
  bidders: Bidder[]
  lineItems: RawLineItem[]
  locations: RawLocation[]
}

// Coarse district centroids, used only to place the handful of contracts whose
// Location string couldn't be geocoded so they still appear on the map.
const DISTRICT_FALLBACK: Record<number, { lat: number; lng: number }> = {
  1: { lat: 40.8, lng: -123.9 }, 2: { lat: 40.6, lng: -122.3 }, 3: { lat: 38.6, lng: -121.4 },
  4: { lat: 37.7, lng: -122.2 }, 5: { lat: 35.3, lng: -120.6 }, 6: { lat: 36.7, lng: -119.8 },
  7: { lat: 34.1, lng: -118.3 }, 8: { lat: 34.1, lng: -117.3 }, 9: { lat: 37.0, lng: -118.0 },
  10: { lat: 37.9, lng: -121.3 }, 11: { lat: 32.8, lng: -117.1 }, 12: { lat: 33.7, lng: -117.8 },
}

export function buildContract(rc: RawContract): Contract {
  const lineItems: LineItem[] = rc.lineItems.map((li) => ({
    itemCode: li.itemCode,
    description: li.description,
    family: classifyFamily(li.itemCode, li.description),
    quantity: li.quantity,
    unit: li.unit,
    unitPrice: li.unitPrice,
    totalPrice: li.totalPrice,
    bidder: li.bidder,
  }))

  // Rank the families by the low bidder's spend so primaryFamily reflects the
  // project's main work; families[] is everything the low bid touched.
  const spend = new Map<ItemFamily, number>()
  rc.lineItems.forEach((li, i) => {
    if (li.bidderRank !== 1) return
    const fam = lineItems[i].family
    spend.set(fam, (spend.get(fam) ?? 0) + li.totalPrice)
  })
  const ranked = [...spend.entries()].sort((a, b) => b[1] - a[1])
  const primaryFamily: ItemFamily = ranked[0]?.[0] ?? 'Other'
  const families = ITEM_FAMILIES.filter((f) => spend.has(f))

  // Representative location: prefer a precise segment, then the longest extent.
  const loc = [...rc.locations].sort(
    (a, b) =>
      (a.geocodeLevel === 'segment' ? 0 : 1) - (b.geocodeLevel === 'segment' ? 0 : 1) ||
      b.nPoints - a.nPoints,
  )[0]
  const center =
    loc && loc.centroidLat != null && loc.centroidLon != null
      ? { lat: loc.centroidLat, lng: loc.centroidLon }
      : DISTRICT_FALLBACK[rc.district] ?? { lat: 37, lng: -120 }

  return {
    ea: rc.ea,
    district: rc.district,
    county: loc?.county ?? '',
    route: typeof loc?.route === 'number' ? loc.route : 0,
    postmileStart: loc?.beginPm ?? 0,
    postmileEnd: loc?.endPm ?? 0,
    bidOpenDate: rc.bidOpenDate,
    projectType: FAMILY_CATEGORY[primaryFamily] ?? 'Other',
    typeOfWork: ranked.slice(0, 3).map(([f]) => f).join(', ') || 'Other',
    lat: center.lat,
    lng: center.lng,
    primaryFamily,
    families,
    bidders: rc.bidders,
    lineItems,
  }
}

export const CONTRACTS: Contract[] = (rawContractsJson as RawContract[])
  .map(buildContract)
  .sort((a, b) => a.bidOpenDate.localeCompare(b.bidOpenDate))

export function getLowBidder(contract: Contract): Bidder {
  return contract.bidders[0]
}
