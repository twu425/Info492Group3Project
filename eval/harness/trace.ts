/** Ad-hoc: trace the agent's steps/tool calls for the first N fixture cases. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
for (const line of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, tool } from 'ai'
import * as bt from '../../lib/bidgrid/build-tools'
import { SYSTEM_PROMPT } from '../../lib/bidgrid/system-prompt'
import { estimateItem, resolveItem } from '../../lib/bidgrid/estimate'
import { FIXTURE_PATH, type FixtureCase } from './lib'

async function main() {
  const fx: FixtureCase[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))
  const n = Number(process.argv[2] ?? 2)
  for (const c of fx.slice(0, n)) {
    console.log('\n======== CASE', c.ea, c.primaryFamily, '========')
    console.log('PROMPT:', c.description)
    const pin = { lat: c.lat, lng: c.lng }
    const items: string[] = []
    const mk = (name: keyof typeof bt.TOOL_DESCRIPTIONS, fn: any) =>
      tool({ description: bt.TOOL_DESCRIPTIONS[name], inputSchema: (bt as any)[name + 'Input'], execute: fn })
    const tools = {
      searchComparables: mk('searchComparables', async ({ itemFamily, quantity, itemCode }: any) => {
        const it = resolveItem(itemFamily, { itemCode })
        const e = it ? estimateItem(pin, it.code, quantity, { excludeEas: [c.ea] }) : null
        return e ? { itemCode: e.item.code, p50: e.p50, comparableCount: e.comparables.length } : { error: 'none' }
      }),
      addLineItem: mk('addLineItem', async (a: any) => {
        const it = resolveItem(a.itemFamily, { itemCode: a.itemCode, description: a.description, unit: a.unit })
        if (!it) return { error: 'no item' }
        items.push(it.code)
        return { status: 'added', item: { name: it.description, qty: a.quantity, unit: it.unit } }
      }),
      updateLineItem: mk('updateLineItem', async () => ({ status: 'not_found' })),
      removeLineItem: mk('removeLineItem', async () => ({ status: 'not_found' })),
      updateProjectScope: mk('updateProjectScope', async () => ({ status: 'updated', scope: {} })),
    }
    const context = `Pin: ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)} — nearest data is ${c.county} County, District ${c.district}.\nCurrent bid items: the list is EMPTY — 0 items.`
    const res = await generateText({
      model: anthropic('claude-sonnet-5-5'),
      system: `${SYSTEM_PROMPT}\n\n${context}`,
      prompt: c.description,
      stopWhen: stepCountIs(8),
      tools,
    })
    console.log('STEPS:', res.steps.length, '  built codes:', items.join(',') || '(none)')
    res.steps.forEach((s: any, i: number) => {
      console.log(`--- step ${i + 1} finish=${s.finishReason}`)
      for (const t of s.toolCalls ?? []) console.log('   tool:', t.toolName, JSON.stringify(t.input).slice(0, 130))
      if (s.text?.trim()) console.log('   text:', s.text.replace(/\n/g, ' ').slice(0, 320))
    })
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
