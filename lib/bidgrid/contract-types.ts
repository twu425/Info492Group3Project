/**
 * Shapes returned by the /api endpoints. Pure types (no runtime imports) so both
 * the server DB layer and the client fetchers can share them.
 */

export interface BidderRow {
  name: string
  rank: number
  total: number
}

export interface LineItemRow {
  itemCode: string
  itemFlag: string
  description: string
  family: string
  unit: string
  quantity: number
  unitPrice: number
  totalPrice: number
  bidder: string
  bidderRank: number
}

export interface LocationRow {
  county: string
  route: number | null
  pmPrefix: string
  beginPm: number | null
  endPm: number | null
  centroidLon: number | null
  centroidLat: number | null
  nPoints: number
  geocodeLevel: string
}

/** Lightweight row for the explorer list / map (no line items). */
export interface ContractSummary {
  ea: string
  district: number
  county: string
  route: number | null
  postmileStart: number | null
  postmileEnd: number | null
  bidOpenDate: string
  projectType: string
  typeOfWork: string
  primaryFamily: string
  families: string[]
  lat: number | null
  lng: number | null
  numBidders: number
  numItems: number
  lowBidder: string
  lowTotal: number
}

/** Full contract detail (fetched when a contract is opened). */
export interface ContractDetail extends ContractSummary {
  bidders: BidderRow[]
  lineItems: LineItemRow[]
  locations: LocationRow[]
  /** Link to the official Caltrans bid-summary PDF. */
  pdfUrl: string | null
}

export interface FamilyStat {
  family: string
  category: string
  contractCount: number
  itemCount: number
  lowBidValue: number
}

export interface BidderStat {
  name: string
  bidCount: number
  winCount: number
  wonValue: number
  contracts: { ea: string; rank: number; total: number; bidOpenDate: string; primaryFamily: string }[]
}

export interface Meta {
  districts: number[]
  families: string[]
  minYear: number
  maxYear: number
  contractCount: number
}

export interface ContractFilters {
  districts?: number[]
  families?: string[]
  yearMin?: number
  yearMax?: number
  q?: string
}
