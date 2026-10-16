import { tool, type UIDataTypes, type UIMessage } from 'ai'
import { z } from 'zod'
import { ITEM_CATALOG, ITEM_FAMILIES, UNITS, type ItemFamily, type Unit } from './data'

const familyEnum = z.enum(ITEM_FAMILIES as [ItemFamily, ...ItemFamily[]])
const unitEnum = z.enum(UNITS as [Unit, ...Unit[]])
const itemCodeEnum = z.enum(ITEM_CATALOG.map((i) => i.code) as [string, ...string[]])
const quantity = z.number().positive().max(10_000_000)

export const searchComparablesInput = z.object({
  itemFamily: familyEnum,
  quantity: quantity.describe('Planned quantity in the item unit'),
  itemCode: itemCodeEnum.optional().describe('Specific catalog item code, when known'),
})

export const addLineItemInput = z.object({
  itemFamily: familyEnum,
  description: z.string().min(1).max(200).describe('Short description of the work, e.g. "curb ramp"'),
  quantity,
  unit: unitEnum,
  itemCode: itemCodeEnum.optional().describe('Specific catalog item code, when known'),
})

export const updateLineItemInput = z.object({
  id: z.string().describe('Bid item id, e.g. "b2"'),
  quantity,
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
}

type ToolError = { error: string }

/** Plain-language item summary returned by the mutation tools. Never includes an id/key. */
export interface ItemSummary {
  name: string
  qty: number
  unit: Unit
  unitPrice: number | null
}

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
  searchComparables: { input: z.infer<typeof searchComparablesInput>; output: SearchComparablesOutput }
  addLineItem: { input: z.infer<typeof addLineItemInput>; output: AddLineItemOutput }
  updateLineItem: { input: z.infer<typeof updateLineItemInput>; output: UpdateLineItemOutput }
  removeLineItem: { input: z.infer<typeof removeLineItemInput>; output: RemoveLineItemOutput }
  updateProjectScope: { input: z.infer<typeof updateProjectScopeInput>; output: UpdateProjectScopeOutput }
}

export type BuildMessageMetadata = { edits?: string[] }
export type BuildUIMessage = UIMessage<BuildMessageMetadata, UIDataTypes, BuildUITools>

export interface BidItem {
  id: string
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: Unit
  /** User override for the unit price. When unset, the app uses the comparable P50. */
  unitPrice?: number
}
