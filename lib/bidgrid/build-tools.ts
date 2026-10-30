import { tool, type UIDataTypes, type UIMessage } from 'ai'
import { z } from 'zod'
import { ITEM_FAMILIES, type ItemFamily, type Unit } from './data'
import type { LocatePostmilesInput, LocatePostmilesOutput } from './postmiles'
import type { ComputeInput, ComputeOutput } from './compute'
import type { CheckResult } from './check-estimate'
import type { SearchBiddersResult } from './bidders'

const familyEnum = z.enum(ITEM_FAMILIES as [ItemFamily, ...ItemFamily[]])
// Real Caltrans items use many units (SQYD, LB, DAY, STA, CF, …), not just the legacy six,
// so accept any unit string — the authoritative unit comes from the resolved catalog item.
const unitEnum = z.string().min(1).max(12)
// Real Caltrans codes are a 1,600-item space, too large for an enum. Take a free-form
// code (e.g. from searchCatalog) and validate it against the real catalog at execution.
const itemCode = z.string().min(1).max(20)
const quantity = z.number().positive().max(10_000_000)
const quantitySource = z
  .enum(['user', 'similar', 'assumed'])
  .describe('Where the quantity came from: "user" if the user gave it, "similar" if scaled from a similar project, "assumed" for a typical default')

/**
 * Tools allowed on a brand-new draft's first message: scope-setting and read-only data
 * questions only — never a silent item build. This gates estimate *building* (so the
 * assistant asks before adding items) while still letting a first-message data question
 * use queryBids. Shared by the API route and the eval harness so they can't drift.
 */
export const FIRST_MESSAGE_TOOLS = [
  'updateProjectScope',
  'queryBids',
  'locatePostmiles',
  'showSegment',
  'computeQuantity',
  'searchBidders',
] as const

export function gatedActiveTools(o: {
  firstUserMessage: boolean
  hasItems: boolean
  hasScope: boolean
}): BuildToolName[] | undefined {
  const gate = o.firstUserMessage && !o.hasItems && !o.hasScope
  return gate ? [...FIRST_MESSAGE_TOOLS] : undefined
}

export const queryBidsInput = z.object({
  sql: z.string().min(1).max(2000).describe('A single read-only SQL query (SELECT or WITH … SELECT) against the bid database'),
  purpose: z.string().min(1).max(200).describe('One line: what you are trying to find out (for logging)'),
})

export const locatePostmilesInput = z.object({
  beginPm: z.number().min(0).max(2000).optional().describe('Begin postmile, when the user gives one'),
  endPm: z.number().min(0).max(2000).optional().describe('End postmile; omit for a single postmile'),
  route: z.number().int().positive().max(999).optional().describe('State route number, when known; omit to read it from the pin'),
  county: z.string().min(1).max(40).optional().describe('County code or name; omit to read it from the pin'),
  pmPrefix: z.string().min(1).max(3).optional().describe('Postmile prefix letter(s) like R, T, or M, when the postmile has one'),
}) satisfies z.ZodType<LocatePostmilesInput>

export const showSegmentInput = z.object({
  points: z
    .array(z.object({ lat: z.number(), lng: z.number() }))
    .min(2)
    .max(60)
    .describe('The segment polyline points from locatePostmiles, in postmile order'),
  route: z.number().int().positive().optional(),
  label: z.string().max(80).optional().describe('Short label for the segment, e.g. "Route 50 · PM 9–10"'),
})

export const computeQuantityInput = z.object({
  operation: z.enum(['area', 'tonnage', 'volume', 'linear']).describe('area→SQYD, tonnage→TON (asphalt/base), volume→CY (concrete/excavation), linear→LF'),
  lengthFt: z.number().positive().optional(),
  lengthMiles: z.number().positive().optional().describe('Length in miles, converted to feet (×5280)'),
  widthFt: z.number().positive().optional(),
  lanes: z.number().positive().optional().describe('Multiplies the width, e.g. 2 lanes × 24 ft'),
  depthFt: z.number().positive().optional().describe('Depth/thickness in feet (tonnage and volume)'),
  densityLbPerCf: z.number().positive().optional().describe('lb/ft³ for tonnage; defaults to compacted HMA (145)'),
  areaSqft: z.number().positive().optional().describe('Area in square feet, instead of length × width'),
}) satisfies z.ZodType<ComputeInput>

export const checkEstimateInput = z.object({}).describe('No input — reviews the current bid item list')

export const searchBiddersInput = z.object({
  itemFamilies: z.array(familyEnum).max(20).optional().describe('Narrow to firms that bid these kinds of work'),
  itemCode: z.string().min(1).max(20).optional().describe('Compare firms’ unit prices for this specific code against the median'),
  radiusMi: z.number().positive().max(200).optional().describe('Search radius in miles from the pin (default 50)'),
})

export const searchSimilarProjectsInput = z.object({
  projectDescription: z.string().min(1).max(300).describe('Short description of the overall project and its main work'),
  itemFamilies: z
    .array(familyEnum)
    .max(20)
    .optional()
    .describe('The item families this project involves, to rank past projects by work-type overlap'),
  size: z.number().positive().optional().describe('Rough project size in dollars, when known'),
})

export const searchCatalogInput = z.object({
  description: z.string().min(1).max(200).describe('Plain-language description of the work, e.g. "curb ramp" or "cold plane pavement"'),
  unit: unitEnum.optional().describe('Unit you expect for the item, when known'),
  itemFamily: familyEnum.optional().describe('Narrow the search to one item family, when known'),
})

export const searchComparablesInput = z.object({
  itemFamily: familyEnum,
  quantity: quantity.describe('Planned quantity in the item unit'),
  itemCode: itemCode.optional().describe('Specific catalog item code from searchCatalog, when known'),
})

export const addLineItemInput = z.object({
  itemFamily: familyEnum,
  description: z.string().min(1).max(200).describe('Short description of the work, e.g. "curb ramp"'),
  quantity,
  unit: unitEnum,
  itemCode: itemCode.optional().describe('Specific catalog item code from searchCatalog, when known'),
  quantitySource: quantitySource.optional(),
})

export const updateLineItemInput = z.object({
  id: z.string().describe('Bid item id, e.g. "b2"'),
  quantity,
  quantitySource: quantitySource.optional(),
})

export const removeLineItemInput = z.object({
  id: z.string().describe('Bid item id, e.g. "b2"'),
})

export const updateProjectScopeInput = z.object({
  values: z
    .array(
      z.object({
        key: z.string().min(1).max(60).describe('Scope detail name, e.g. "sidewalk_length" or "lane_count"'),
        value: z.union([z.string().max(200), z.number()]).describe('The confirmed value'),
        unit: z.string().max(20).optional().describe('Unit for the value when it has one, e.g. "LF", "lanes"'),
        source: z.enum(['user', 'assumed']).describe('"user" if the user stated it, "assumed" for a typical default'),
      }),
    )
    .min(1)
    .max(30),
})

export const TOOL_DESCRIPTIONS = {
  queryBids: `Run one read-only SQL query (SELECT or WITH … SELECT only) against the real Caltrans bid database for questions the other tools don't cover. Returns { columns, rows, rowCount, truncated } (capped at 200 rows), or { error } with the SQLite message so you can fix the query and retry.

Schema — 5 tables, all keyed to a contract by its ea:
- contracts: one row per project. ea (PK), district (1-12), bid_date (YYYY-MM-DD), county, route, postmile_start, postmile_end, lat, lng, project_type, type_of_work, primary_family (dominant material family, overhead excluded), num_bidders, num_items, low_bidder, low_total (winning bid $).
- bidders: one row per (contract, rank). contract_ea, rank (1 = winning low bidder), name, total.
- line_items: one row per (contract, item, bidder) — the full all-bidder bid tab. contract_ea, bidder_rank (1 = low bidder), bidder_name, item_no, item_code (e.g. '390132'), description, family, unit, quantity, unit_price, total_price.
- contract_families: one row per (contract, family) the winning bid touched. contract_ea, family.
- locations: one row per geocoded segment. contract_ea, county, route, begin_pm, end_pm, centroid_lat, centroid_lon, geocode_level.
Joins: line_items.contract_ea = contracts.ea; bidders.contract_ea = contracts.ea; line_items.bidder_rank = bidders.rank (same contract). For "the price someone actually bid", filter bidder_rank = 1 (the winning bid).

Examples:
- Median low-bid unit price for an item code by district: SELECT c.district, COUNT(*) n, unit_price FROM line_items li JOIN contracts c ON c.ea = li.contract_ea WHERE li.item_code = '390132' AND li.bidder_rank = 1 GROUP BY c.district
- Firm with the most paving wins: SELECT low_bidder, COUNT(*) wins FROM contracts WHERE project_type = 'Paving' GROUP BY low_bidder ORDER BY wins DESC
- Avg bidders on structures jobs: SELECT AVG(num_bidders) FROM contracts WHERE project_type = 'Structures'`,
  computeQuantity:
    'Convert dimensions into a bid quantity exactly — ALWAYS use this instead of doing the arithmetic yourself. operation: "area" (length×width → SQYD), "tonnage" (area×depth×density → TON, for asphalt and aggregate base; density defaults to 145 lb/ft³ compacted HMA), "volume" (area×depth → CY, for concrete and excavation), "linear" (length → LF). Give lengthFt or lengthMiles, widthFt, lanes, depthFt as needed. Returns { quantity, unit, formula } — show the formula to the user.',
  checkEstimate:
    'Review the current bid item list before you tell the user it is done — like running tests. Flags missing standard items (mobilization, traffic control, water pollution control), quantities that do not fit together (asphalt tonnage vs. paved area), and prices far from their comparables. Returns { ok, findings[] } with a severity on each. Fix what you can (add a missing item, correct a quantity) and tell the user about the rest. Takes no input.',
  searchBidders:
    'Competitor intelligence from the real bid record: which firms usually bid this kind of work near the pin, how often they win, their median winning total, and — when you pass an itemCode — how their unit prices compare with the median. Pass itemFamilies to focus on the relevant work. Returns up to 6 firms. Use it when the user asks about competitors, who bids here, or win rates.',
  locatePostmiles: `Look up real Caltrans postmiles on the State Highway Network. Two uses: (1) the user gives postmiles (beginPm/endPm, optionally route/county/pmPrefix) — returns the segment's route, county, district, true driven length in miles, begin/end/center coordinates, and polyline points; (2) the user asks where the pin is or what route it's on — omit postmiles and it returns the route, county, and nearest postmile at the pin. Route and county are read from the pin whenever you omit them. Returns { county, route, district, pin:{nearestPm,distanceFt}, segment?, candidates?, warnings[] } or { error }. If "candidates" comes back, more than one route is near the pin — ask the user which one. Always read "warnings" and explain any in plain words. Prefer this result's county/district over the pin's own county when they differ. Available on every turn.`,
  showSegment:
    "Draw a located highway segment on the map as a line. Pass the points array from locatePostmiles (and a short label like \"Route 50 · PM 9–10\"). Call it right after locatePostmiles returns a segment, so the user sees the stretch you're estimating.",
  searchSimilarProjects:
    'Find up to 5 past Caltrans contracts near the pin with similar work. Each returns its location, distance, project type, length in miles, and the low bidder’s biggest line items with their quantity and quantity-per-mile. Call this FIRST to see which catalog items and quantities similar jobs used, then build the item list from that evidence instead of guessing.',
  searchCatalog:
    'Search the real Caltrans item catalog for the codes that best match a plain-language description. Returns up to 5 candidates (code, description, unit, family, score). Call this FIRST for each piece of work to choose a specific itemCode, then pass that code to searchComparables and addLineItem so pricing and the added item refer to the same code.',
  searchComparables:
    'Look up comparable historical Caltrans line items within 50 miles of the pin from the last 5 years at a similar quantity. Returns escalated P25/P50/P75 unit prices and the comparables. Call before adding an item.',
  addLineItem:
    'Add a line item to the bid item list. Pricing is computed by the app from comparables. If the same catalog item is already on the list it is not duplicated; the result status says whether it was added or already present.',
  updateLineItem: 'Change the quantity of an existing bid item, identified by its internal key from the current bid items snapshot.',
  removeLineItem: 'Remove a bid item, identified by its internal key from the current bid items snapshot.',
  updateProjectScope:
    'Record confirmed or changed scope details (dimensions, counts, materials, assumptions) onto the draft. Merges the given values by key, overwriting matching keys, and returns the full current scope. Call it whenever the user confirms or changes a detail — including when they accept a typical default (save that with source "assumed") — before adding or updating bid items.',
} as const

/** Tools executed in the browser; the server only declares them. */
export const clientTools = {
  addLineItem: tool({ description: TOOL_DESCRIPTIONS.addLineItem, inputSchema: addLineItemInput }),
  updateLineItem: tool({ description: TOOL_DESCRIPTIONS.updateLineItem, inputSchema: updateLineItemInput }),
  removeLineItem: tool({ description: TOOL_DESCRIPTIONS.removeLineItem, inputSchema: removeLineItemInput }),
  updateProjectScope: tool({ description: TOOL_DESCRIPTIONS.updateProjectScope, inputSchema: updateProjectScopeInput }),
  showSegment: tool({ description: TOOL_DESCRIPTIONS.showSegment, inputSchema: showSegmentInput }),
}

type ToolError = { error: string }

/** Plain-language item summary returned by the mutation tools. Never includes an id/key. */
export interface ItemSummary {
  name: string
  qty: number
  unit: Unit
  unitPrice: number | null
}

export interface CatalogCandidate {
  code: string
  description: string
  unit: Unit
  family: ItemFamily
  score: number
}
export type SearchCatalogOutput = { candidates: CatalogCandidate[] } | ToolError

export interface SimilarProjectItem {
  itemCode: string
  description: string
  unit: Unit
  quantity: number
  quantityPerMile: number | null
}
export interface SimilarProject {
  ea: string
  bidDate: string
  miles: number
  projectType: string
  lengthMiles: number | null
  lowBidTotal: number
  items: SimilarProjectItem[]
}
export type SearchSimilarProjectsOutput = { projects: SimilarProject[] } | ToolError

export type QueryBidsOutput =
  | { columns: string[]; rows: unknown[][]; rowCount: number; truncated: boolean }
  | ToolError

export type LocatePostmilesToolOutput = LocatePostmilesOutput
export type ShowSegmentOutput = { status: 'shown'; count: number }
export type ComputeQuantityOutput = ComputeOutput
export type CheckEstimateOutput = CheckResult
export type SearchBiddersOutput = SearchBiddersResult

export type SearchComparablesOutput =
  | {
      itemCode: string
      description: string
      unit: Unit
      comparableCount: number
      p25: number | null
      p50: number | null
      p75: number | null
      comparables: Array<{ ea: string; bidDate: string; quantity: number; miles: number; escalatedUnitPrice: number }>
    }
  | ToolError

export type AddLineItemOutput =
  | { status: 'added' | 'already_exists'; item: ItemSummary }
  | ToolError
export type UpdateLineItemOutput =
  | { status: 'updated'; before: ItemSummary; after: ItemSummary }
  | { status: 'not_found' }
export type RemoveLineItemOutput = { status: 'removed'; item: ItemSummary } | { status: 'not_found' }

/** A single confirmed scope detail. */
export interface ScopeValue {
  value: string | number
  unit?: string
  source: 'user' | 'assumed'
}
/** The draft's scope: confirmed details keyed by name. */
export type ProjectScope = Record<string, ScopeValue>

export type UpdateProjectScopeOutput = { status: 'updated'; scope: ProjectScope }

export type BuildUITools = {
  queryBids: { input: z.infer<typeof queryBidsInput>; output: QueryBidsOutput }
  locatePostmiles: { input: z.infer<typeof locatePostmilesInput>; output: LocatePostmilesToolOutput }
  showSegment: { input: z.infer<typeof showSegmentInput>; output: ShowSegmentOutput }
  computeQuantity: { input: z.infer<typeof computeQuantityInput>; output: ComputeQuantityOutput }
  checkEstimate: { input: z.infer<typeof checkEstimateInput>; output: CheckEstimateOutput }
  searchBidders: { input: z.infer<typeof searchBiddersInput>; output: SearchBiddersOutput }
  searchSimilarProjects: {
    input: z.infer<typeof searchSimilarProjectsInput>
    output: SearchSimilarProjectsOutput
  }
  searchCatalog: { input: z.infer<typeof searchCatalogInput>; output: SearchCatalogOutput }
  searchComparables: { input: z.infer<typeof searchComparablesInput>; output: SearchComparablesOutput }
  addLineItem: { input: z.infer<typeof addLineItemInput>; output: AddLineItemOutput }
  updateLineItem: { input: z.infer<typeof updateLineItemInput>; output: UpdateLineItemOutput }
  removeLineItem: { input: z.infer<typeof removeLineItemInput>; output: RemoveLineItemOutput }
  updateProjectScope: { input: z.infer<typeof updateProjectScopeInput>; output: UpdateProjectScopeOutput }
}

export type BuildToolName = keyof BuildUITools

export type BuildMessageMetadata = { edits?: string[] }
export type BuildUIMessage = UIMessage<BuildMessageMetadata, UIDataTypes, BuildUITools>

export type QuantitySource = 'user' | 'similar' | 'assumed'

export interface BidItem {
  id: string
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: Unit
  /** User override for the unit price. When unset, the app uses the comparable P50. */
  unitPrice?: number
  /** Where the quantity came from: user-given, scaled from a similar project, or a default. */
  quantitySource?: QuantitySource
}
