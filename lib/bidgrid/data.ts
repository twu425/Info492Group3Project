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

const item = (
  code: string,
  description: string,
  family: ItemFamily,
  unit: Unit,
  basePrice: number,
  typicalQty: number,
): ItemDef => ({ code, description, family, unit, basePrice, typicalQty })

export const ITEM_CATALOG: ItemDef[] = [
  item('731502', 'MINOR CONCRETE (MISCELLANEOUS CONSTRUCTION)', 'Minor Concrete', 'CY', 1250, 40),
  item('731504', 'MINOR CONCRETE (CURB AND GUTTER)', 'Minor Concrete', 'LF', 52, 1800),
  item('731510', 'MINOR CONCRETE (SIDEWALK)', 'Minor Concrete', 'SQFT', 15, 9000),
  item('731521', 'MINOR CONCRETE (CURB RAMP)', 'Minor Concrete', 'EA', 4200, 24),
  item('510053', 'STRUCTURAL CONCRETE, BRIDGE', 'Structural Concrete', 'CY', 1700, 900),
  item('510060', 'STRUCTURAL CONCRETE, RETAINING WALL', 'Structural Concrete', 'CY', 1050, 650),
  item('510086', 'STRUCTURAL CONCRETE, APPROACH SLAB (TYPE N)', 'Structural Concrete', 'CY', 1450, 180),
  item('510092', 'STRUCTURAL CONCRETE, BRIDGE FOOTING', 'Structural Concrete', 'CY', 880, 1200),
  item('839701', 'CONCRETE BARRIER (TYPE 60)', 'Concrete Barrier', 'LF', 135, 4200),
  item('839726', 'CONCRETE BARRIER (TYPE 736)', 'Concrete Barrier', 'LF', 190, 1600),
  item('839752', 'CONCRETE BARRIER (TYPE 842)', 'Concrete Barrier', 'LF', 240, 1200),
  item('401050', 'JOINTED PLAIN CONCRETE PAVEMENT', 'PCC Pavement', 'CY', 390, 3000),
  item('401108', 'JOINTED PLAIN CONCRETE PAVEMENT (RAPID STRENGTH CONCRETE)', 'PCC Pavement', 'CY', 640, 800),
  item('404092', 'SEAL PAVEMENT JOINT', 'PCC Pavement', 'LF', 3.4, 12000),
  item('390132', 'HOT MIX ASPHALT (TYPE A)', 'Hot Mix Asphalt', 'TON', 88, 12000),
  item('390136', 'MINOR HOT MIX ASPHALT', 'Hot Mix Asphalt', 'TON', 195, 400),
  item('394090', 'PLACE HOT MIX ASPHALT DIKE (TYPE A)', 'Hot Mix Asphalt', 'LF', 8.5, 2500),
  item('390137', 'RUBBERIZED HOT MIX ASPHALT (GAP GRADED)', 'Rubberized HMA', 'TON', 102, 6000),
  item('390138', 'RUBBERIZED HOT MIX ASPHALT (OPEN GRADED)', 'Rubberized HMA', 'TON', 118, 2500),
  item('260203', 'CLASS 2 AGGREGATE BASE (CY)', 'Aggregate Base', 'CY', 70, 3000),
  item('260201', 'CLASS 2 AGGREGATE BASE', 'Aggregate Base', 'TON', 44, 5000),
  item('250401', 'CLASS 4 AGGREGATE SUBBASE', 'Aggregate Base', 'CY', 52, 2000),
  item('153103', 'COLD PLANE ASPHALT CONCRETE PAVEMENT', 'Cold Planing', 'SQFT', 0.7, 120000),
  item('153104', 'COLD PLANE ASPHALT CONCRETE PAVEMENT (0.15\' MAX)', 'Cold Planing', 'SQFT', 0.52, 160000),
  item('190101', 'ROADWAY EXCAVATION', 'Roadway Excavation', 'CY', 30, 25000),
  item('192037', 'STRUCTURE EXCAVATION (RETAINING WALL)', 'Roadway Excavation', 'CY', 88, 1500),
  item('190110', 'LEAD COMPLIANCE PLAN', 'Roadway Excavation', 'LS', 4200, 1),
  item('198010', 'IMPORTED BORROW', 'Embankment', 'CY', 26, 18000),
  item('198001', 'IMPORTED BORROW (TON)', 'Embankment', 'TON', 20, 20000),
  item('193003', 'STRUCTURE BACKFILL (BRIDGE)', 'Embankment', 'CY', 130, 1200),
  item('160101', 'CLEARING AND GRUBBING', 'Clearing & Grubbing', 'LS', 60000, 1),
  item('160111', 'REMOVE TREE', 'Clearing & Grubbing', 'EA', 1650, 12),
  item('650014', '18" REINFORCED CONCRETE PIPE', 'Reinforced Concrete Pipe', 'LF', 195, 600),
  item('650018', '24" REINFORCED CONCRETE PIPE', 'Reinforced Concrete Pipe', 'LF', 260, 500),
  item('650026', '36" REINFORCED CONCRETE PIPE', 'Reinforced Concrete Pipe', 'LF', 390, 300),
  item('665012', '12" CORRUGATED STEEL PIPE (.064" THICK)', 'Corrugated Steel Pipe', 'LF', 110, 300),
  item('665018', '18" CORRUGATED STEEL PIPE (.079" THICK)', 'Corrugated Steel Pipe', 'LF', 150, 250),
  item('665024', '24" CORRUGATED STEEL PIPE (.079" THICK)', 'Corrugated Steel Pipe', 'LF', 195, 200),
  item('705011', 'DRAINAGE INLET', 'Drainage Inlets', 'EA', 7000, 10),
  item('705410', 'DRAINAGE INLET (TYPE GO)', 'Drainage Inlets', 'EA', 8800, 6),
  item('703233', 'GRATED LINE DRAIN', 'Drainage Inlets', 'LF', 300, 200),
  item('520102', 'BAR REINFORCING STEEL (BRIDGE)', 'Reinforcing Steel', 'TON', 3300, 300),
  item('520103', 'BAR REINFORCING STEEL (RETAINING WALL)', 'Reinforcing Steel', 'TON', 2950, 120),
  item('520110', 'BAR REINFORCING STEEL (EPOXY COATED) (BRIDGE)', 'Reinforcing Steel', 'TON', 4400, 60),
  item('499005', 'MECHANICALLY STABILIZED EMBANKMENT', 'Retaining Wall', 'SQFT', 78, 6000),
  item('517250', 'SOLDIER PILE WALL', 'Retaining Wall', 'SQFT', 135, 3000),
  item('499160', 'CRIB WALL', 'Retaining Wall', 'SQFT', 56, 2500),
  item('830131', 'SOUND WALL (MASONRY BLOCK)', 'Sound Wall', 'SQFT', 50, 12000),
  item('830132', 'SOUND WALL (MASONRY BLOCK ON BARRIER)', 'Sound Wall', 'SQFT', 66, 4000),
  item('830140', 'SOUND WALL (PRECAST PANEL)', 'Sound Wall', 'SQFT', 72, 6000),
  item('840504', '4" THERMOPLASTIC TRAFFIC STRIPE', 'Thermoplastic Striping', 'LF', 0.7, 40000),
  item('840506', '8" THERMOPLASTIC TRAFFIC STRIPE', 'Thermoplastic Striping', 'LF', 1.3, 12000),
  item('840515', 'THERMOPLASTIC PAVEMENT MARKING', 'Thermoplastic Striping', 'SQFT', 6, 2500),
  item('810230', 'PAVEMENT MARKER (RETROREFLECTIVE)', 'Pavement Markers', 'EA', 5.5, 3000),
  item('810110', 'PAVEMENT MARKER (NON-REFLECTIVE)', 'Pavement Markers', 'EA', 3.2, 4000),
  item('820107', 'DELINEATOR (CLASS 1)', 'Roadside Signs', 'EA', 70, 120),
  item('820840', 'ROADSIDE SIGN - ONE POST', 'Roadside Signs', 'EA', 390, 40),
  item('820850', 'ROADSIDE SIGN - TWO POST', 'Roadside Signs', 'EA', 880, 15),
  item('870009', 'SIGNAL AND LIGHTING', 'Traffic Signals', 'LS', 290000, 1),
  item('870208', 'MODIFY SIGNAL AND LIGHTING', 'Traffic Signals', 'LS', 125000, 1),
  item('870255', 'INTERCONNECTION CONDUIT AND CABLE', 'Traffic Signals', 'LF', 42, 2500),
  item('860201', 'LIGHTING SYSTEM', 'Lighting', 'LS', 165000, 1),
  item('860090', 'LIGHTING (TEMPORARY)', 'Lighting', 'LS', 23000, 1),
  item('860251', 'LIGHTING POLE (TYPE 15)', 'Lighting', 'EA', 7200, 20),
  item('832001', 'METAL BEAM GUARD RAILING', 'Metal Beam Guardrail', 'LF', 44, 2500),
  item('839561', 'RAIL TENSIONING ASSEMBLY', 'Metal Beam Guardrail', 'EA', 1500, 8),
  item('839584', 'ALTERNATIVE IN-LINE TERMINAL SYSTEM', 'Metal Beam Guardrail', 'EA', 3900, 8),
  item('210010', 'MOVE-IN/MOVE-OUT (EROSION CONTROL)', 'Erosion Control', 'EA', 1700, 4),
  item('210270', 'ROLLED EROSION CONTROL PRODUCT (NETTING)', 'Erosion Control', 'SQFT', 0.6, 30000),
  item('210430', 'HYDROSEED', 'Erosion Control', 'SQFT', 0.11, 120000),
  item('208000', 'IRRIGATION SYSTEM', 'Irrigation', 'LS', 150000, 1),
  item('206400', 'CHECK AND TEST EXISTING IRRIGATION FACILITIES', 'Irrigation', 'LS', 14000, 1),
  item('208304', 'WATER METER', 'Irrigation', 'EA', 11000, 2),
  item('204099', 'PLANT ESTABLISHMENT WORK', 'Planting', 'LS', 42000, 1),
  item('204001', 'PLANT (GROUP A)', 'Planting', 'EA', 26, 800),
  item('204005', 'PLANT (GROUP E)', 'Planting', 'EA', 88, 120),
]

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

/* ---------- Bidders ---------- */

export type PricingBehavior = 'low' | 'mid' | 'high' | 'erratic'
export type FirmSize = 'small' | 'mid' | 'large'

export interface BidderProfile {
  name: string
  home: District
  /** `null` means a general contractor that bids every kind of work. */
  specialties: Category[] | null
  behavior: PricingBehavior
  size: FirmSize
}

const firm = (
  name: string,
  home: District,
  specialties: Category[] | null,
  behavior: PricingBehavior,
  size: FirmSize,
): BidderProfile => ({ name, home, specialties, behavior, size })

export const BIDDER_PROFILES: BidderProfile[] = [
  firm('SHASTA PEAK CONSTRUCTORS', 2, null, 'mid', 'mid'),
  firm('MT LASSEN PAVING CO', 2, ['Paving', 'Earthwork'], 'low', 'small'),
  firm('NORTHSTATE AGGREGATES & GRADING', 2, ['Earthwork', 'Paving'], 'erratic', 'small'),
  firm('TRINITY RIVER CIVIL', 2, ['Drainage', 'Earthwork', 'Landscape & Erosion'], 'high', 'small'),
  firm('CAPITOL CITY CONSTRUCTORS', 3, null, 'mid', 'large'),
  firm('DELTA HEAVY CIVIL', 3, null, 'low', 'mid'),
  firm('AMERICAN RIVER PAVING', 3, ['Paving'], 'low', 'mid'),
  firm('FOOTHILL DRAINAGE & UTILITY', 3, ['Drainage', 'Earthwork'], 'mid', 'small'),
  firm('SIERRA SIGNAL & LIGHTING', 3, ['Traffic & Electrical'], 'erratic', 'small'),
  firm('GOLDEN STATE CONSTRUCTORS', 4, null, 'mid', 'large'),
  firm('BAYSIDE HEAVY CIVIL', 4, null, 'high', 'large'),
  firm('SIERRA BRIDGEWORKS', 4, ['Structures', 'Concrete'], 'mid', 'mid'),
  firm('REDWOOD CONCRETE CO', 4, ['Concrete'], 'low', 'small'),
  firm('DIABLO VALLEY BUILDERS', 4, ['Concrete', 'Drainage', 'Earthwork'], 'erratic', 'mid'),
  firm('MISSION ELECTRIC WORKS', 4, ['Traffic & Electrical'], 'high', 'small'),
  firm('COASTLINE BARRIER SYSTEMS', 4, ['Concrete', 'Traffic & Electrical'], 'low', 'small'),
  firm('HARBOR FREEWAY CONSTRUCTORS', 7, null, 'mid', 'large'),
  firm('SAN GABRIEL CIVIL', 7, null, 'low', 'mid'),
  firm('ARROYO ENGINEERING CONTRACTORS', 7, ['Structures', 'Concrete'], 'high', 'mid'),
  firm('PACIFIC GRADE & PAVE', 7, ['Paving', 'Earthwork'], 'low', 'mid'),
  firm('ANGELES STRIPING & SIGN', 7, ['Traffic & Electrical'], 'mid', 'small'),
  firm('LOS PADRES LANDSCAPE CO', 7, ['Landscape & Erosion'], 'erratic', 'small'),
  firm('INLAND EMPIRE CONSTRUCTORS', 8, null, 'low', 'large'),
  firm('MOJAVE AGGREGATE & CONCRETE', 8, ['Paving', 'Concrete', 'Earthwork'], 'mid', 'mid'),
  firm('CUCAMONGA WALL SYSTEMS', 8, ['Structures'], 'mid', 'mid'),
  firm('DESERT SUN ELECTRIC', 8, ['Traffic & Electrical'], 'low', 'small'),
  firm('TORREY PINES CONSTRUCTORS', 11, null, 'high', 'large'),
  firm('PALOMAR PAVING & GRADING', 11, ['Paving', 'Earthwork'], 'mid', 'mid'),
  firm('CUYAMACA DRAINAGE WORKS', 11, ['Drainage', 'Landscape & Erosion'], 'erratic', 'small'),
  firm('COASTAL SAGE ENVIRONMENTAL', 11, ['Landscape & Erosion'], 'low', 'small'),
]

/* ---------- Project types ---------- */

interface ProjectType {
  label: string
  weight: number
  core: ItemFamily[]
  optional: ItemFamily[]
  size: [number, number]
  items: [number, number]
  descriptions: string[]
  districtWeight?: Partial<Record<District, number>>
}

const PROJECT_TYPES: ProjectType[] = [
  {
    label: 'Pavement rehab',
    weight: 30,
    core: ['Hot Mix Asphalt', 'Cold Planing', 'Thermoplastic Striping'],
    optional: ['Rubberized HMA', 'Aggregate Base', 'Pavement Markers', 'Minor Concrete', 'Metal Beam Guardrail', 'Roadside Signs', 'PCC Pavement'],
    size: [1.5e6, 40e6],
    items: [6, 16],
    descriptions: ['PAVEMENT REHABILITATION', 'COLD PLANE AND OVERLAY WITH RHMA', 'CAPM PAVEMENT PRESERVATION', 'ROADWAY REHABILITATION AND SHOULDER WIDENING'],
    districtWeight: { 2: 1.6 },
  },
  {
    label: 'Interchange reconstruction',
    weight: 9,
    core: ['Roadway Excavation', 'Embankment', 'Structural Concrete', 'Reinforcing Steel', 'Hot Mix Asphalt', 'Aggregate Base', 'Reinforced Concrete Pipe', 'Traffic Signals', 'Lighting', 'Thermoplastic Striping'],
    optional: ['Concrete Barrier', 'Retaining Wall', 'Sound Wall', 'Clearing & Grubbing', 'Drainage Inlets', 'Roadside Signs', 'Erosion Control', 'Planting', 'Irrigation', 'Minor Concrete', 'Metal Beam Guardrail'],
    size: [15e6, 80e6],
    items: [15, 20],
    descriptions: ['RECONSTRUCT INTERCHANGE', 'CONSTRUCT NEW INTERCHANGE AND AUXILIARY LANES', 'INTERCHANGE IMPROVEMENTS AND RAMP REALIGNMENT'],
    districtWeight: { 2: 0.15 },
  },
  {
    label: 'Bridge widening',
    weight: 13,
    core: ['Structural Concrete', 'Reinforcing Steel', 'Concrete Barrier', 'Roadway Excavation'],
    optional: ['Embankment', 'Hot Mix Asphalt', 'Aggregate Base', 'Retaining Wall', 'Metal Beam Guardrail', 'Thermoplastic Striping', 'Erosion Control', 'Reinforced Concrete Pipe'],
    size: [4e6, 45e6],
    items: [8, 16],
    descriptions: ['BRIDGE WIDENING AND SEISMIC RETROFIT', 'REPLACE BRIDGE AND APPROACH SLABS', 'WIDEN BRIDGE AND UPGRADE BRIDGE RAIL', 'BRIDGE DECK REHABILITATION'],
  },
  {
    label: 'Safety / barrier upgrade',
    weight: 22,
    core: ['Concrete Barrier', 'Metal Beam Guardrail'],
    optional: ['Hot Mix Asphalt', 'Roadside Signs', 'Thermoplastic Striping', 'Pavement Markers', 'Minor Concrete', 'Clearing & Grubbing', 'Drainage Inlets'],
    size: [0.8e6, 15e6],
    items: [5, 12],
    descriptions: ['REPLACE MEDIAN BARRIER', 'UPGRADE GUARDRAIL AND END TREATMENTS', 'CONSTRUCT MEDIAN BARRIER AND SHOULDER', 'SAFETY IMPROVEMENTS AND RUMBLE STRIPS'],
  },
  {
    label: 'Drainage repair',
    weight: 22,
    core: ['Reinforced Concrete Pipe', 'Drainage Inlets'],
    optional: ['Corrugated Steel Pipe', 'Roadway Excavation', 'Minor Concrete', 'Hot Mix Asphalt', 'Erosion Control', 'Aggregate Base'],
    size: [0.3e6, 8e6],
    items: [5, 11],
    descriptions: ['REPAIR AND REPLACE CULVERTS', 'DRAINAGE SYSTEM RESTORATION', 'REHABILITATE DRAINAGE FACILITIES', 'STORM DAMAGE REPAIR'],
    districtWeight: { 2: 1.4 },
  },
  {
    label: 'ADA curb ramps',
    weight: 24,
    core: ['Minor Concrete'],
    optional: ['Hot Mix Asphalt', 'Thermoplastic Striping', 'Roadside Signs', 'Drainage Inlets', 'Traffic Signals', 'Cold Planing'],
    size: [0.3e6, 6e6],
    items: [5, 10],
    descriptions: ['CONSTRUCT ADA CURB RAMPS AND SIDEWALK', 'UPGRADE PEDESTRIAN FACILITIES', 'CONSTRUCT COMPLETE STREETS IMPROVEMENTS'],
    districtWeight: { 2: 0.4 },
  },
  {
    label: 'Signal / lighting upgrade',
    weight: 18,
    core: ['Traffic Signals', 'Lighting'],
    optional: ['Minor Concrete', 'Roadside Signs', 'Thermoplastic Striping', 'Pavement Markers', 'Hot Mix Asphalt'],
    size: [0.5e6, 10e6],
    items: [5, 10],
    descriptions: ['UPGRADE TRAFFIC SIGNALS AND LIGHTING', 'INSTALL RAMP METERING', 'REPLACE HIGHWAY LIGHTING WITH LED'],
    districtWeight: { 2: 0.5 },
  },
  {
    label: 'Soundwall',
    weight: 10,
    core: ['Sound Wall', 'Reinforcing Steel', 'Roadway Excavation'],
    optional: ['Structural Concrete', 'Concrete Barrier', 'Drainage Inlets', 'Irrigation', 'Planting', 'Erosion Control', 'Clearing & Grubbing'],
    size: [3e6, 30e6],
    items: [6, 13],
    descriptions: ['CONSTRUCT SOUNDWALLS', 'CONSTRUCT SOUNDWALL ON BARRIER', 'NOISE ABATEMENT WALLS'],
    districtWeight: { 2: 0.05, 3: 0.6 },
  },
  {
    label: 'Landscaping',
    weight: 14,
    core: ['Planting', 'Irrigation', 'Erosion Control'],
    optional: ['Clearing & Grubbing', 'Minor Concrete', 'Roadway Excavation', 'Aggregate Base'],
    size: [0.4e6, 6e6],
    items: [5, 11],
    descriptions: ['HIGHWAY PLANTING AND IRRIGATION', 'REPLACEMENT PLANTING', 'ROADSIDE REHABILITATION AND EROSION CONTROL'],
    districtWeight: { 2: 0.3 },
  },
]

/* ---------- Random helpers ---------- */

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20261014)
const between = (min: number, max: number) => min + rand() * (max - min)
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const bellNoise = () => (rand() + rand() + rand()) / 3 - 0.5
const round2 = (n: number) => Math.round(n * 100) / 100

function weightedPick<T>(items: readonly T[], weight: (t: T) => number): T {
  const weights = items.map(weight)
  let r = rand() * weights.reduce((s, w) => s + w, 0)
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const LETTERS = 'ABCDEFGHJKLMNPQRTUVWXY'
const usedEas = new Set<string>()
function makeEa(district: District) {
  for (;;) {
    const d = () => String(intBetween(0, 9))
    const l = () => LETTERS[intBetween(0, LETTERS.length - 1)]
    const ea = `${String(district).padStart(2, '0')}-${d()}${l()}${d()}${l()}${d()}${d()}`
    if (!usedEas.has(ea)) {
      usedEas.add(ea)
      return ea
    }
  }
}

/* ---------- Price model ---------- */

const YEAR_MS = 365.25 * 24 * 3600 * 1000
const QTY_ELASTICITY = -0.05

/**
 * Cumulative cost index since Jan 2016: a steady ~3–5%/yr base rate plus one
 * 10–15% jump spread across 2021–2022 (the rest of the years stay on the base).
 */
function costIndex(years: number, baseRate: number, spike: number) {
  let index = 1
  for (let y = 0; y < Math.ceil(years); y++) {
    const year = MIN_YEAR + y
    const fraction = Math.min(1, years - y)
    index *= Math.pow(1 + baseRate, fraction)
    if (year === 2021) index *= Math.pow(1 + spike * 0.4, fraction)
    else if (year === 2022) index *= Math.pow(1 + spike * 0.6, fraction)
  }
  return index
}

const FAMILY_ESCALATION = Object.fromEntries(ITEM_FAMILIES.map((f) => [f, between(0.03, 0.05)])) as Record<
  ItemFamily,
  number
>

/** The one-time 2021–2022 jump, 10–15%; materials-heavy work sat at the top of the band. */
const CATEGORY_SPIKE: Record<Category, number> = {
  Concrete: 0.13,
  Paving: 0.15,
  Earthwork: 0.1,
  Drainage: 0.12,
  Structures: 0.14,
  'Traffic & Electrical': 0.12,
  'Landscape & Erosion': 0.1,
  'General & Site Work': 0.1,
  Other: 0.12,
}

const DISTRICT_FACTOR: Record<District, number> = { 2: 0.95, 3: 1, 4: 1.24, 7: 1.17, 8: 0.97, 11: 1.05 }

/** Haul distance pushes rural Redding prices above the cities on some items. */
const D02_REMOTE: Partial<Record<Category, number>> = {
  Paving: 1.32,
  Concrete: 1.22,
  Structures: 1.18,
  'Traffic & Electrical': 1.12,
}

function engineerPrice(def: ItemDef, district: District, years: number, quantity: number, projectScale: number) {
  const category = FAMILY_CATEGORY[def.family]
  const location = DISTRICT_FACTOR[district] * (district === 2 ? (D02_REMOTE[category] ?? 1) : 1)
  const size = def.unit === 'LS' ? Math.pow(projectScale, 0.7) : Math.pow(quantity / def.typicalQty, QTY_ELASTICITY)
  return def.basePrice * costIndex(years, FAMILY_ESCALATION[def.family], CATEGORY_SPIKE[category]) * location * size
}

function roundQuantity(qty: number, unit: Unit) {
  if (unit === 'LS') return 1
  if (unit === 'EA' || unit === 'CY' || unit === 'TON') return Math.max(1, Math.round(qty))
  if (qty > 50000) return Math.round(qty / 1000) * 1000
  return Math.max(10, Math.round(qty / 10) * 10)
}

const BEHAVIOR: Record<PricingBehavior, { mean: number; spread: number; line: number }> = {
  low: { mean: 0.93, spread: 0.05, line: 0.11 },
  mid: { mean: 1.0, spread: 0.06, line: 0.13 },
  high: { mean: 1.09, spread: 0.06, line: 0.13 },
  erratic: { mean: 1.0, spread: 0.13, line: 0.24 },
}

/* ---------- Contract generation ---------- */

function chooseItems(type: ProjectType): ItemDef[] {
  const target = intBetween(type.items[0], type.items[1])
  const byFamily = (f: ItemFamily) => shuffle(ITEM_CATALOG.filter((i) => i.family === f))
  const chosen: ItemDef[] = []
  const pools = new Map<ItemFamily, ItemDef[]>()

  for (const family of type.core) {
    const pool = byFamily(family)
    const take = Math.min(pool.length, type.core.length === 1 ? intBetween(3, 4) : 1)
    chosen.push(...pool.splice(0, take))
    pools.set(family, pool)
  }
  for (const family of shuffle(type.optional)) {
    if (chosen.length >= target) break
    if (rand() < 0.3) continue
    const pool = byFamily(family)
    chosen.push(...pool.splice(0, Math.min(pool.length, intBetween(1, 2), target - chosen.length)))
  }
  const leftovers = shuffle([...pools.values()].flat())
  while (chosen.length < target && leftovers.length) chosen.push(leftovers.pop()!)
  return chosen.slice(0, 20).sort((a, b) => a.code.localeCompare(b.code))
}

const SIZE_WEIGHT: Record<FirmSize, (total: number) => number> = {
  small: (t) => (t > 15e6 ? 0.05 : t > 5e6 ? 0.5 : 1.4),
  mid: (t) => (t > 50e6 ? 0.3 : 1),
  large: (t) => (t < 2e6 ? 0.15 : t > 10e6 ? 2.2 : 1),
}

function chooseBidders(
  district: District,
  type: ProjectType,
  engineersTotal: number,
  minBidders = 2,
): BidderProfile[] {
  const category = FAMILY_CATEGORY[type.core[0]]
  const count = Math.min(9, Math.max(minBidders, Math.round(2 + Math.pow(rand(), 0.8) * 5 + (engineersTotal > 20e6 ? 2 : 0))))
  const pool = BIDDER_PROFILES.map((b) => {
    const miles = milesBetween(DISTRICT_CENTER[b.home], DISTRICT_CENTER[district])
    const distance = b.home === district ? 6 : miles < 200 ? 1 : b.size === 'large' && engineersTotal > 10e6 ? 0.5 : 0.08
    const specialty = b.specialties === null ? 1 : b.specialties.includes(category) ? 2.4 : 0.06
    return { b, w: distance * specialty * SIZE_WEIGHT[b.size](engineersTotal) }
  })
  const chosen: BidderProfile[] = []
  while (chosen.length < count && pool.length) {
    const next = weightedPick(pool, (p) => p.w)
    chosen.push(next.b)
    pool.splice(pool.indexOf(next), 1)
  }
  return chosen
}

const DISTRICT_COUNTS: [District, number][] = [
  [2, 26],
  [3, 32],
  [4, 38],
  [7, 42],
  [8, 32],
  [11, 30],
]

interface ContractParams {
  district: District
  countyDef: CountyDef
  type: ProjectType
  bidTime: number
  defs: ItemDef[]
  /** Cluster the contract near this point instead of spreading it across the county. */
  center?: { lat: number; lng: number }
  /** Override the drawn project size (used when seeding density with a fixed item set). */
  targetTotal?: number
  minBidders?: number
}

function makeContract({ district, countyDef, type, bidTime, defs, center, targetTotal, minBidders }: ContractParams): Contract {
  const start = Date.UTC(MIN_YEAR, 0, 1)
  const years = (bidTime - start) / YEAR_MS

  const finalTarget = targetTotal ?? Math.exp(between(Math.log(type.size[0]), Math.log(type.size[1])))
  const coreSet = new Set(type.core)
  const typicalTotal = defs.reduce((s, d) => s + d.basePrice * d.typicalQty, 0)
  const scale = finalTarget / typicalTotal

  const engineered = defs.map((def) => {
    const itemScale = coreSet.has(def.family) ? scale : Math.pow(scale, 0.55)
    const quantity = roundQuantity(def.typicalQty * itemScale * Math.exp(between(-0.4, 0.4)), def.unit)
    return { def, quantity, unitPrice: engineerPrice(def, district, years, quantity, scale) }
  })
  const engineersTotal = engineered.reduce((s, e) => s + e.unitPrice * e.quantity, 0)

  const profiles = chooseBidders(district, type, engineersTotal, minBidders)
  const bids = profiles.map((profile) => {
    const style = BEHAVIOR[profile.behavior]
    const specialist = profile.specialties?.includes(FAMILY_CATEGORY[type.core[0]]) ? 0.97 : 1
    const travel = profile.home === district ? 1 : 1.05
    const bidFactor = (style.mean + bellNoise() * style.spread * 2) * specialist * travel
    const unbalancedIdx = rand() < 0.12 ? intBetween(0, engineered.length - 1) : -1

    const lines: LineItem[] = engineered.map(({ def, quantity, unitPrice }, i) => {
      let factor = bidFactor * (1 + bellNoise() * style.line)
      if (i === unbalancedIdx) factor *= rand() < 0.5 ? between(2, 3.5) : between(0.28, 0.48)
      else if (rand() < 0.01) factor *= rand() < 0.5 ? between(1.8, 2.6) : between(0.38, 0.58)
      const price = Math.max(0.01, round2(unitPrice * factor))
      return {
        itemCode: def.code,
        description: def.description,
        family: def.family,
        quantity,
        unit: def.unit,
        unitPrice: price,
        totalPrice: round2(price * quantity),
        bidder: profile.name,
      }
    })
    return { name: profile.name, lines, total: round2(lines.reduce((s, l) => s + l.totalPrice, 0)) }
  })
  bids.sort((a, b) => a.total - b.total)

  // Keep the losing-bid spread realistic: usually 2–25% over the low bid, occasionally
  // up to 40%, never past 60%. Markups are drawn independently then assigned in rank
  // order (closest bid second), so many bidders don't ratchet the spread upward. Each
  // loser is rescaled as a whole, so its line items stay internally consistent
  // (unbalanced items remain unbalanced) and the total matches.
  const lowTotal = bids[0].total
  const losers = bids.length - 1
  if (losers > 0) {
    const markups = Array.from({ length: losers }, () => {
      let m = between(0.02, 0.25)
      if (rand() < 0.15) m = between(0.25, 0.4)
      if (rand() < 0.04) m = between(0.4, 0.58)
      return m
    }).sort((a, b) => a - b)
    for (let i = 1; i < bids.length; i++) {
      const bid = bids[i]
      const factor = bid.total > 0 ? (lowTotal * (1 + markups[i - 1])) / bid.total : 1
      for (const line of bid.lines) {
        line.unitPrice = Math.max(0.01, round2(line.unitPrice * factor))
        line.totalPrice = round2(line.unitPrice * line.quantity)
      }
      bid.total = round2(bid.lines.reduce((s, l) => s + l.totalPrice, 0))
    }
  }

  const pmStart = round2(between(0, 60))
  const families = ITEM_FAMILIES.filter((f) => defs.some((d) => d.family === f))
  const primaryFamily = type.core.find((f) => families.includes(f)) ?? families[0]
  const spreadLat = center ? 0.05 : countyDef.spread
  const spreadLng = center ? 0.08 : countyDef.spread
  const origin = center ?? countyDef

  return {
    ea: makeEa(district),
    district,
    county: countyDef.code,
    route: pick(countyDef.routes),
    postmileStart: pmStart,
    postmileEnd: round2(pmStart + between(0.2, type.size[1] > 20e6 ? 4 : 9)),
    bidOpenDate: new Date(bidTime).toISOString().slice(0, 10),
    projectType: type.label,
    typeOfWork: pick(type.descriptions),
    lat: origin.lat + (rand() - 0.5) * 2 * spreadLat,
    lng: origin.lng + (rand() - 0.5) * 2 * spreadLng,
    primaryFamily,
    families,
    bidders: bids.map((b, i) => ({ name: b.name, rank: i + 1, total: b.total })),
    lineItems: bids.flatMap((b) => b.lines),
  }
}

function generateContract(district: District): Contract {
  const type = weightedPick(PROJECT_TYPES, (t) => t.weight * (t.districtWeight?.[district] ?? 1))
  const countyDef = pick(COUNTIES.filter((c) => c.district === district))
  const bidTime = between(Date.UTC(MIN_YEAR, 0, 1), Date.UTC(MAX_YEAR, 8, 30))
  return makeContract({ district, countyDef, type, bidTime, defs: chooseItems(type) })
}

/** The project type whose core/optional families best cover a seed's forced item set. */
function seedType(defs: ItemDef[]): ProjectType {
  const fams = new Set(defs.map((d) => d.family))
  let best = PROJECT_TYPES[0]
  let bestScore = -1
  for (const t of PROJECT_TYPES) {
    const cover = [...t.core, ...t.optional].filter((f) => fams.has(f)).length
    if (cover > bestScore) {
      bestScore = cover
      best = t
    }
  }
  return best
}

/** Metro centers where estimates are run most; density is guaranteed within 50 mi of these. */
const DENSITY_METROS: { district: District; center: { lat: number; lng: number }; county: string }[] = [
  { district: 4, center: { lat: 37.8, lng: -122.25 }, county: 'ALA' },
  { district: 7, center: { lat: 34.05, lng: -118.24 }, county: 'LA' },
]

/**
 * Guarantee every item code has at least 8 recent comparables (top-3 bidders, last 5 years,
 * within 50 mi) near each metro, so estimates there never fall back to 3 data points.
 * Appends targeted recent contracts that force the still-thin item codes until the floor is met.
 */
function topUpDensity(contracts: Contract[]) {
  const approxEnd = Math.max(...contracts.map((c) => Date.parse(c.bidOpenDate)))
  const cutoff = approxEnd - 5 * YEAR_MS
  // Build to 10 so the runtime floor of 8 holds with margin, even as the 50-mi radius and
  // 5-year window shift slightly between a dropped pin and this metro center.
  const MIN_COMPS = 10

  for (const { district, center, county } of DENSITY_METROS) {
    const countyDef = COUNTIES.find((c) => c.code === county && c.district === district)!
    for (let pass = 0; pass < 12; pass++) {
      const counts = new Map<string, number>()
      for (const c of contracts) {
        if (Date.parse(c.bidOpenDate) < cutoff || milesBetween(center, c) > 50) continue
        const ranks = new Map(c.bidders.map((b) => [b.name, b.rank]))
        for (const li of c.lineItems) {
          if ((ranks.get(li.bidder) ?? 99) <= 3) counts.set(li.itemCode, (counts.get(li.itemCode) ?? 0) + 1)
        }
      }
      const deficient = ITEM_CATALOG.filter((i) => (counts.get(i.code) ?? 0) < MIN_COMPS)
      if (deficient.length === 0) break
      for (let s = 0; s < deficient.length; s += 12) {
        const defs = deficient.slice(s, s + 12).sort((a, b) => a.code.localeCompare(b.code))
        contracts.push(
          makeContract({
            district,
            countyDef,
            type: seedType(defs),
            bidTime: between(cutoff + 0.5 * YEAR_MS, approxEnd - 0.05 * YEAR_MS),
            defs,
            center,
            targetTotal: Math.exp(between(Math.log(3e6), Math.log(25e6))),
            minBidders: 4,
          }),
        )
      }
    }
  }
}

/* ---------- Real data (scraped Caltrans bid summaries) ---------- */

interface RawLineItem {
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
interface RawLocation {
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
interface RawContract {
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

function buildContract(rc: RawContract): Contract {
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
