/**
 * Eval + trace replaying the earlier failure: a repaving scope, then "post mile 9 and 10".
 * The agent must call locatePostmiles, confirm the length, draw the segment, and keep
 * building — with no error. Uses the real model, the real Caltrans API, and the real DB.
 *
 * Run: npx tsx eval/harness/postmile-trace.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

for (const line of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, tool, type ModelMessage } from 'ai'
import {
  addLineItemInput,
  gatedActiveTools,
  locatePostmilesInput,
  queryBidsInput,
  searchCatalogInput,
  searchComparablesInput,
  searchSimilarProjectsInput,
  showSegmentInput,
  updateLineItemInput,
  updateProjectScopeInput,
  removeLineItemInput,
  TOOL_DESCRIPTIONS,
  type ProjectScope,
} from '../../lib/bidgrid/build-tools'
import { searchCatalogDb, resolveItemDb } from '../../lib/bidgrid/catalog-db'
import { dbEstimator } from '../../lib/bidgrid/contracts-db'
import { locatePostmiles } from '../../lib/bidgrid/postmiles'
import { queryDb, runQueryBids } from '../../lib/bidgrid/query-bids'
import { SYSTEM_PROMPT } from '../../lib/bidgrid/system-prompt'
import { formatDistrict, itemLabel } from '../../lib/bidgrid/format'
import type { ItemFamily } from '../../lib/bidgrid/data'

const MODEL = 'claude-sonnet-5-5'
const PIN = { lat: 38.666, lng: -120.93 } // On US-50 in El Dorado County, ~PM 9.

interface Row { id: string; itemCode: string; description: string; family: ItemFamily; quantity: number; unit: string }

const est = dbEstimator()
const items: Row[] = []
let scope: ProjectScope = {}
const segmentsDrawn: { label?: string; count: number }[] = []
const locateCalls: { input: unknown; hadSegment: boolean; lengthMi?: number; error?: string }[] = []
let nextId = 1
const round2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)
const priceOf = (id: string) => {
  const idx = items.findIndex((i) => i.id === id)
  return idx === -1 ? null : round2(est.estimateBidItems(PIN, items)[idx]?.p50)
}
const summarize = (r: Row) => ({ name: r.description, qty: r.quantity, unit: r.unit, unitPrice: priceOf(r.id) })

const tools = {
  locatePostmiles: tool({
    description: TOOL_DESCRIPTIONS.locatePostmiles,
    inputSchema: locatePostmilesInput,
    execute: async (input) => {
      const r = await locatePostmiles(input, PIN)
      if ('error' in r) locateCalls.push({ input, hadSegment: false, error: r.error })
      else locateCalls.push({ input, hadSegment: !!r.segment, lengthMi: r.segment?.lengthMi })
      return r
    },
  }),
  showSegment: tool({
    description: TOOL_DESCRIPTIONS.showSegment,
    inputSchema: showSegmentInput,
    execute: async ({ points, label }) => {
      segmentsDrawn.push({ label, count: points.length })
      return { status: 'shown' as const, count: points.length }
    },
  }),
  updateProjectScope: tool({
    description: TOOL_DESCRIPTIONS.updateProjectScope,
    inputSchema: updateProjectScopeInput,
    execute: async ({ values }) => {
      for (const v of values) scope[v.key] = { value: v.value, ...(v.unit ? { unit: v.unit } : {}), source: v.source }
      return { status: 'updated' as const, scope }
    },
  }),
  searchSimilarProjects: tool({
    description: TOOL_DESCRIPTIONS.searchSimilarProjects,
    inputSchema: searchSimilarProjectsInput,
    execute: async ({ itemFamilies }) => {
      const projects = est.describeSimilarProjects(PIN, itemFamilies ?? [], { limit: 5 })
      return projects.length ? { projects } : { error: 'No similar past projects found near this location.' }
    },
  }),
  searchCatalog: tool({
    description: TOOL_DESCRIPTIONS.searchCatalog,
    inputSchema: searchCatalogInput,
    execute: async ({ description, unit, itemFamily }) => {
      const candidates = searchCatalogDb(description, { unit, family: itemFamily, limit: 5 })
      return candidates.length ? { candidates } : { error: `No catalog items match "${description}".` }
    },
  }),
  searchComparables: tool({
    description: TOOL_DESCRIPTIONS.searchComparables,
    inputSchema: searchComparablesInput,
    execute: async ({ itemFamily, quantity, itemCode }) => {
      const item = resolveItemDb(itemFamily, { itemCode })
      const e = item ? est.estimateItem(PIN, item.code, quantity) : null
      if (!e) return { error: `No catalog item found in ${itemFamily}.` }
      return {
        itemCode: e.item.code, description: e.item.description, unit: e.item.unit,
        comparableCount: e.comparables.length, p25: e.p25, p50: e.p50, p75: e.p75,
        comparables: e.comparables.slice(0, 10).map((c) => ({ ea: c.ea, bidDate: c.bidDate, quantity: c.quantity, miles: Math.round(c.miles), escalatedUnitPrice: round2(c.escalatedPrice) })),
      }
    },
  }),
  queryBids: tool({
    description: TOOL_DESCRIPTIONS.queryBids,
    inputSchema: queryBidsInput,
    execute: async ({ sql, purpose }) => runQueryBids(queryDb(), sql, purpose),
  }),
  addLineItem: tool({
    description: TOOL_DESCRIPTIONS.addLineItem,
    inputSchema: addLineItemInput,
    execute: async ({ itemFamily, description, quantity, unit, itemCode }) => {
      const item = resolveItemDb(itemFamily, { itemCode, description, unit })
      if (!item) return { error: 'No matching catalog item.' }
      const existing = items.find((i) => i.itemCode === item.code)
      if (existing) return { status: 'already_exists' as const, item: summarize(existing) }
      const id = `b${nextId++}`
      items.push({ id, itemCode: item.code, description: item.description, family: item.family, quantity, unit: item.unit })
      return { status: 'added' as const, item: summarize(items[items.length - 1]) }
    },
  }),
  updateLineItem: tool({
    description: TOOL_DESCRIPTIONS.updateLineItem,
    inputSchema: updateLineItemInput,
    execute: async ({ id, quantity }) => {
      const t = items.find((i) => i.id === id)
      if (!t) return { status: 'not_found' as const }
      const before = summarize(t)
      t.quantity = quantity
      return { status: 'updated' as const, before, after: summarize(t) }
    },
  }),
  removeLineItem: tool({
    description: TOOL_DESCRIPTIONS.removeLineItem,
    inputSchema: removeLineItemInput,
    execute: async ({ id }) => {
      const idx = items.findIndex((i) => i.id === id)
      if (idx === -1) return { status: 'not_found' as const }
      return { status: 'removed' as const, item: summarize(items.splice(idx, 1)[0]) }
    },
  }),
}

function context(): string {
  const county = est.pinArea(PIN)
  const snapshot = items.length
    ? items.map((i) => `- [${i.id}] ${itemLabel(i.description)}: ${i.quantity} ${i.unit}`).join('\n')
    : 'the list is EMPTY — 0 items.'
  const scopeLine = Object.keys(scope).length
    ? `\nConfirmed scope:\n${Object.entries(scope).map(([k, v]) => `- ${k}: ${v.value}${v.unit ? ` ${v.unit}` : ''} (${v.source})`).join('\n')}`
    : ''
  return `Pin: ${PIN.lat.toFixed(4)}, ${PIN.lng.toFixed(4)} — in ${county.name} County (${county.code}), ${formatDistrict(county.district)}.\nCurrent bid items:\n${snapshot}${scopeLine}`
}

const trimInput = (o: unknown) => {
  const s = JSON.stringify(o)
  return s.length > 180 ? s.slice(0, 177) + '…' : s
}
const trimOutput = (o: unknown) => {
  if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>
    if ('error' in r) return `error: ${r.error}`
    if ('segment' in r && r.segment) { const s = r.segment as Record<string, unknown>; return `county=${r.county} route=${r.route} district=${r.district} lengthMi=${s.lengthMi} pmDiff=${s.pmDifference} distFromPin=${s.distanceFromPinMi}mi warnings=${(r.warnings as string[]).length}` }
    if ('candidates' in r && r.candidates) return `candidates=${(r.candidates as unknown[]).length} (ask which route)`
    if ('status' in r && 'item' in r) { const it = r.item as Record<string, unknown>; return `${r.status}: ${it.name} ${it.qty} ${it.unit} @ ${it.unitPrice}` }
    if ('status' in r) return String(r.status)
    if ('candidates' in r) return `${(r.candidates as unknown[]).length} catalog candidates`
    if ('projects' in r) return `${(r.projects as unknown[]).length} similar projects`
    if ('comparableCount' in r) return `${r.itemCode} ${r.unit} · ${r.comparableCount} comps · p50=${r.p50}`
    if ('rowCount' in r) return `${r.rowCount} rows`
  }
  return trimInput(o)
}

async function turn(label: string, text: string, messages: ModelMessage[], firstUser: boolean) {
  console.log(`\n${'─'.repeat(70)}\n▶ USER (${label}): ${text}\n`)
  messages.push({ role: 'user', content: text })
  const activeTools = gatedActiveTools({ firstUserMessage: firstUser, hasItems: items.length > 0, hasScope: Object.keys(scope).length > 0 })
  const result = await generateText({
    model: anthropic(MODEL),
    system: `${SYSTEM_PROMPT}\n\n${context()}`,
    messages,
    stopWhen: stepCountIs(8),
    activeTools: activeTools as (keyof typeof tools)[] | undefined,
    tools,
  })
  for (const step of result.steps) {
    for (let i = 0; i < step.toolCalls.length; i++) {
      const call = step.toolCalls[i]
      const res = step.toolResults[i] as { output?: unknown } | undefined
      console.log(`  🔧 ${call.toolName}(${trimInput(call.input)})`)
      console.log(`       → ${trimOutput(res?.output)}`)
    }
  }
  if (result.text) console.log(`\n  💬 ASSISTANT: ${result.text}`)
  console.log(`\n  [${result.steps.length} steps · finish: ${result.steps.at(-1)?.finishReason}]`)
  messages.push(...result.response.messages)
  return result
}

async function main() {
  const messages: ModelMessage[] = []
  console.log(`Pin ${PIN.lat}, ${PIN.lng} (US-50, El Dorado County)`)

  await turn('1', "I'm repaving two lanes, 24 ft wide — grind and overlay.", messages, true)
  await turn('2', 'post mile 9 and 10', messages, false)
  const rLast = await turn('3', 'use typical', messages, false)

  // ---- Assertions ----
  console.log(`\n${'═'.repeat(70)}\nRESULT`)
  let fail = 0
  const assert = (name: string, ok: boolean, detail = '') => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` — ${detail}`}`); if (!ok) fail++ }

  const locate = locateCalls.find((c) => c.hadSegment)
  assert('locatePostmiles was called', locateCalls.length > 0)
  assert('it returned a segment', !!locate, JSON.stringify(locateCalls))
  assert('length ≈ 1.0 mile', !!locate && Math.abs((locate.lengthMi ?? 0) - 1.0) < 0.15, String(locate?.lengthMi))
  assert('no locate error', !locateCalls.some((c) => c.error), locateCalls.map((c) => c.error).join('; '))
  const lenScope = Object.entries(scope).find(([, v]) => v.source === 'user' && typeof v.value === 'number' && Math.abs((v.value as number) - 1) < 0.2)
  assert('length recorded in scope (source "user")', !!lenScope, JSON.stringify(scope))
  assert('segment drawn via showSegment', segmentsDrawn.length > 0)
  assert('kept building (items added)', items.length > 0, `${items.length} items`)
  const descs = items.map((i) => i.description.toUpperCase())
  assert('built the grind (a cold plane item)', descs.some((d) => d.includes('COLD PLANE') || d.includes('COLD PLAN')), descs.join(' | '))
  assert('built the overlay (a hot mix asphalt item)', descs.some((d) => d.includes('HOT MIX') || d.includes('ASPHALT CONCRETE') || d.includes('HMA')), descs.join(' | '))
  assert('finished cleanly (finish=stop)', rLast.steps.at(-1)?.finishReason === 'stop')

  console.log(`\n  Final list: ${items.map((i) => `${itemLabel(i.description)} (${i.quantity} ${i.unit})`).join(', ') || '(none)'}`)
  console.log(fail === 0 ? '\nPASS — postmile trace eval' : `\nFAIL — ${fail} assertion(s)`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error('threw:', e); process.exit(1) })
