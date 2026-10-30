/**
 * Runs the BidGrid estimate agent headlessly for one eval case.
 *
 * Mirrors app/api/build/route.ts (same model, system prompt, tools, step cap) and
 * the browser's client-tool execution in components/bidgrid/build/build-drawer.tsx
 * (resolveItem + estimateBidItems pricing), so the harness measures the real agent.
 *
 * The one deliberate deviation: the scope-only gate that forces a clarifying turn
 * on a brand-new draft is NOT applied, and the case description tells the agent to
 * assume typical values and proceed — so a batch run builds a list instead of
 * stalling on questions. That isolates tool/estimation quality, which is what the
 * phases change.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, tool } from 'ai'
import Database from 'better-sqlite3'
import {
  gatedActiveTools,
  queryBidsInput,
  searchCatalogInput,
  searchComparablesInput,
  searchSimilarProjectsInput,
  TOOL_DESCRIPTIONS,
  addLineItemInput,
  updateLineItemInput,
  removeLineItemInput,
  updateProjectScopeInput,
  type QuantitySource,
} from '../../lib/bidgrid/build-tools'
import { runQueryBids } from '../../lib/bidgrid/query-bids'
import { searchCatalog } from '../../lib/bidgrid/catalog'
import { SYSTEM_PROMPT } from '../../lib/bidgrid/system-prompt'
import {
  describeSimilarProjects,
  estimateBidItems,
  estimateItem,
  resolveItem,
  type EstimateOptions,
  type PriceEstimate,
} from '../../lib/bidgrid/estimate'
import type { ItemFamily } from '../../lib/bidgrid/data'
import type { BuiltItem, ComparableRef, FixtureCase } from './lib'

const MODEL = 'claude-sonnet-5-5'
const STEP_CAP = 8

export type Variant = 'baseline' | 'searchcatalog' | 'similarprojects' | 'querybids'

// The shipped SYSTEM_PROMPT is the full similarprojects loop. To reproduce earlier phases
// for run-to-run-noise measurement, strip/swap these exact blocks. Each must be present in
// SYSTEM_PROMPT or buildPrompt throws — a silent no-op replace would give a wrong config.
const SIMILARPROJECTS_LINE = `- Start by calling searchSimilarProjects with the project description and the item families involved. It returns up to 5 comparable past contracts nearby, each with the line items the low bidder used and their quantity-per-mile. Use that evidence to decide which items belong on the list and to set or sanity-check quantities — scale a quantity-per-mile by this project's length.
`
const SEARCHCATALOG_BLOCK = `- For each work item, call searchCatalog with a short description (and the unit and family when you know them) to get candidate Caltrans catalog items, and pick the itemCode that best matches. Prefer a code you saw in the similar projects when it fits the work.
- Then call searchComparables with that itemCode and the planned quantity, and call addLineItem with the same itemCode, family, description, quantity, unit, and quantitySource ("similar" when you scaled it from a similar project, "user" when the user gave the value, "assumed" otherwise). Passing the chosen itemCode to both keeps the price and the added line on the same catalog item.`
const BASELINE_BLOCK = `- Classify each piece of work into one of the item families below; the app resolves it to a specific Caltrans item from the real bid database. Pass a short, specific description so it resolves to the right item.
- Before adding an item, call searchComparables for it with the planned quantity. Then call addLineItem.`
const QUERYBIDS_BLOCK = `
- searchSimilarProjects, searchCatalog, and searchComparables are the main path for building an estimate — use them first. Use queryBids (read-only SQL over the bid database) only for something they can't answer, e.g. "what other work do contracts on this route usually include?" or a cross-cutting statistic.
- When the user asks an open-ended question about the data rather than to build an estimate (medians, counts, who won the most of something, averages), answer it with queryBids directly. When the question says "the area" (or "around here", "nearby"), it means the pin's county given in the context unless the user names another place — filter your query to that county (or its district) and state which area your answer covers. Report a short plain-language summary of what the rows show — never dump raw rows — and say how many contracts or bids the answer is based on.`

function buildPrompt(variant: Variant): string {
  let p = SYSTEM_PROMPT
  const strip = (needle: string) => {
    if (!p.includes(needle)) throw new Error(`Prompt block not found for variant "${variant}": ${needle.slice(0, 50)}…`)
    return (p = p.replace(needle, ''))
  }
  const swap = (needle: string, repl: string) => {
    if (!p.includes(needle)) throw new Error(`Prompt block not found for variant "${variant}": ${needle.slice(0, 50)}…`)
    return (p = p.replace(needle, repl))
  }
  if (variant !== 'querybids') strip(QUERYBIDS_BLOCK)
  if (variant !== 'querybids' && variant !== 'similarprojects') strip(SIMILARPROJECTS_LINE)
  if (variant === 'baseline') swap(SEARCHCATALOG_BLOCK, BASELINE_BLOCK)
  return p
}

/**
 * A readonly copy of the real DB with one contract's rows removed, so queryBids honors
 * leave-one-out in the estimate eval (raw SQL can't be self-excluded otherwise).
 */
function filteredDb(excludeEa: string): { db: Database.Database; cleanup: () => void } {
  const src = path.join(process.cwd(), 'scraper', 'data', 'bidgrid.db')
  const tmp = path.join(os.tmpdir(), `bidgrid-eval-${excludeEa.replace(/\W/g, '')}-${process.pid}-${Date.now()}.db`)
  fs.copyFileSync(src, tmp)
  const w = new Database(tmp)
  for (const [table, col] of [
    ['contracts', 'ea'],
    ['bidders', 'contract_ea'],
    ['line_items', 'contract_ea'],
    ['contract_families', 'contract_ea'],
    ['locations', 'contract_ea'],
  ] as const) {
    w.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).run(excludeEa)
  }
  w.close()
  const db = new Database(tmp, { readonly: true })
  return { db, cleanup: () => { db.close(); try { fs.unlinkSync(tmp) } catch { /* ignore */ } } }
}

export interface AgentRun {
  built: BuiltItem[]
  comparablesSeen: ComparableRef[]
  /** (description, unit) -> itemCode the agent ended up adding, for item-matching scoring. */
  resolutions: { family: ItemFamily; description: string; unit?: string; chosenCode: string }[]
  /** Each searchCatalog call: the query and the candidate codes it returned. */
  catalogSearches: { query: string; returned: string[] }[]
  /** Each queryBids call: its purpose, SQL, and whether it succeeded. */
  queryBidsCalls: { purpose: string; sql: string; ok: boolean; rowCount?: number }[]
  stepsUsed: number
  hitCap: boolean
  /** finishReason of the final step: 'stop' = model finished, 'length' = truncated, etc. */
  stopReason: string
  text: string
  error?: string
}

interface Row {
  id: string
  itemCode: string
  description: string
  family: ItemFamily
  quantity: number
  unit: string
  quantitySource?: QuantitySource
}

export async function runAgent(c: FixtureCase, variant: Variant = 'similarprojects'): Promise<AgentRun> {
  const pin = { lat: c.lat, lng: c.lng }
  const exclude: EstimateOptions = { excludeEas: [c.ea] }
  const items: Row[] = []
  const comparablesSeen: ComparableRef[] = []
  const resolutions: AgentRun['resolutions'] = []
  const catalogSearches: AgentRun['catalogSearches'] = []
  const queryBidsCalls: AgentRun['queryBidsCalls'] = []
  // queryBids runs against a self-excluded copy of the DB so the eval stays leave-one-out.
  const evalDb = variant === 'querybids' ? filteredDb(c.ea) : null
  let nextId = 1

  const round2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)
  // Price a row exactly as the browser does: estimateBidItems over the whole list, self-excluded.
  const priceOf = (id: string): number | null => {
    const idx = items.findIndex((i) => i.id === id)
    if (idx === -1) return null
    const est = estimateBidItems(pin, items, exclude)[idx]
    return round2(est?.p50)
  }

  const searchSimilarProjectsTool = tool({
    description: TOOL_DESCRIPTIONS.searchSimilarProjects,
    inputSchema: searchSimilarProjectsInput,
    execute: async ({ itemFamilies }) => {
      const projects = describeSimilarProjects(pin, itemFamilies ?? [], { limit: 5, excludeEas: [c.ea] })
      if (projects.length === 0) return { error: 'No similar past projects found near this location.' }
      return { projects }
    },
  })

  const queryBidsTool = tool({
    description: TOOL_DESCRIPTIONS.queryBids,
    inputSchema: queryBidsInput,
    execute: async ({ sql, purpose }) => {
      const res = runQueryBids(evalDb!.db, sql, purpose)
      const ok = !('error' in res)
      queryBidsCalls.push({ purpose, sql, ok, rowCount: ok ? res.rowCount : undefined })
      return res
    },
  })

  const searchCatalogTool = tool({
    description: TOOL_DESCRIPTIONS.searchCatalog,
    inputSchema: searchCatalogInput,
    execute: async ({ description, unit, itemFamily }) => {
      const candidates = searchCatalog(description, { unit, family: itemFamily, limit: 5 })
      catalogSearches.push({ query: description, returned: candidates.map((c) => c.code) })
      if (candidates.length === 0) return { error: `No catalog items match "${description}".` }
      return { candidates }
    },
  })

  const tools = {
    ...(variant === 'querybids' ? { queryBids: queryBidsTool } : {}),
    // searchSimilarProjects in similarprojects + querybids; searchCatalog in all but baseline.
    ...(variant === 'similarprojects' || variant === 'querybids'
      ? { searchSimilarProjects: searchSimilarProjectsTool }
      : {}),
    ...(variant !== 'baseline' ? { searchCatalog: searchCatalogTool } : {}),
    searchComparables: tool({
      description: TOOL_DESCRIPTIONS.searchComparables,
      inputSchema: searchComparablesInput,
      execute: async ({ itemFamily, quantity, itemCode }) => {
        const item = resolveItem(itemFamily, { itemCode })
        const est = item ? estimateItem(pin, item.code, quantity, exclude) : null
        if (!est) return { error: `No catalog item found in ${itemFamily}.` }
        for (const comp of est.comparables)
          comparablesSeen.push({ ea: comp.ea, miles: comp.miles, bidDate: comp.bidDate })
        return {
          itemCode: est.item.code,
          description: est.item.description,
          unit: est.item.unit,
          comparableCount: est.comparables.length,
          p25: est.p25,
          p50: est.p50,
          p75: est.p75,
          comparables: est.comparables.slice(0, 10).map((cp) => ({
            ea: cp.ea,
            bidDate: cp.bidDate,
            quantity: cp.quantity,
            miles: Math.round(cp.miles),
            escalatedUnitPrice: round2(cp.escalatedPrice),
          })),
        }
      },
    }),
    addLineItem: tool({
      description: TOOL_DESCRIPTIONS.addLineItem,
      inputSchema: addLineItemInput,
      execute: async ({ itemFamily, description, quantity, unit, itemCode, quantitySource }) => {
        const item = resolveItem(itemFamily, { itemCode, description, unit })
        if (!item) return { error: 'No matching catalog item.' }
        const existing = items.find((i) => i.itemCode === item.code)
        if (existing)
          return { status: 'already_exists', item: summarize(existing) }
        const id = `b${nextId++}`
        items.push({ id, itemCode: item.code, description: item.description, family: item.family, quantity, unit: item.unit, quantitySource: quantitySource ?? 'assumed' })
        resolutions.push({ family: itemFamily, description, unit, chosenCode: item.code })
        return { status: 'added', item: { name: item.description, qty: quantity, unit: item.unit, unitPrice: priceOf(id) } }
      },
    }),
    updateLineItem: tool({
      description: TOOL_DESCRIPTIONS.updateLineItem,
      inputSchema: updateLineItemInput,
      execute: async ({ id, quantity }) => {
        const target = items.find((i) => i.id === id)
        if (!target) return { status: 'not_found' }
        const before = summarize(target)
        target.quantity = quantity
        return { status: 'updated', before, after: summarize(target) }
      },
    }),
    removeLineItem: tool({
      description: TOOL_DESCRIPTIONS.removeLineItem,
      inputSchema: removeLineItemInput,
      execute: async ({ id }) => {
        const idx = items.findIndex((i) => i.id === id)
        if (idx === -1) return { status: 'not_found' }
        const [gone] = items.splice(idx, 1)
        return { status: 'removed', item: summarize(gone) }
      },
    }),
    updateProjectScope: tool({
      description: TOOL_DESCRIPTIONS.updateProjectScope,
      inputSchema: updateProjectScopeInput,
      execute: async ({ values }) => ({
        status: 'updated',
        scope: Object.fromEntries(values.map((v) => [v.key, { value: v.value, unit: v.unit, source: v.source }])),
      }),
    }),
  }

  function summarize(row: Row) {
    return { name: row.description, qty: row.quantity, unit: row.unit, unitPrice: priceOf(row.id) }
  }

  const context = `Pin: ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)} — nearest data is ${c.county} County, District ${c.district}.\nCurrent bid items: the list is EMPTY — 0 items.`
  const systemPrompt = buildPrompt(variant)

  // Same gating code as the route. Estimate cases carry full scope in the description
  // (the thing the gate protects), so the gate is lifted — matching production once scope
  // is known. This routes the eval through the shared gating rather than ignoring it.
  const activeTools = gatedActiveTools({ firstUserMessage: true, hasItems: false, hasScope: true })

  try {
    const result = await generateText({
      model: anthropic(MODEL),
      system: `${systemPrompt}\n\n${context}`,
      prompt: c.description,
      stopWhen: stepCountIs(STEP_CAP),
      activeTools: activeTools as (keyof typeof tools)[] | undefined,
      tools,
    })
    const built: BuiltItem[] = estimateBidItems(pin, items, exclude).map((est: PriceEstimate | null, i) => ({
      itemCode: items[i].itemCode,
      description: items[i].description,
      family: items[i].family,
      quantity: items[i].quantity,
      unit: items[i].unit,
      unitPrice: round2(est?.p50) ?? null,
      quantitySource: items[i].quantitySource,
    }))
    const stepsUsed = result.steps.length
    return {
      built,
      comparablesSeen,
      resolutions,
      catalogSearches,
      queryBidsCalls,
      stepsUsed,
      hitCap: stepsUsed >= STEP_CAP,
      stopReason: result.steps.at(-1)?.finishReason ?? 'unknown',
      text: result.text,
    }
  } catch (err) {
    return {
      built: [],
      comparablesSeen,
      resolutions,
      catalogSearches,
      queryBidsCalls,
      stepsUsed: 0,
      hitCap: false,
      stopReason: 'error',
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    evalDb?.cleanup()
  }
}
