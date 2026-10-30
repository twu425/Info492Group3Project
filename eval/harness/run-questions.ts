/**
 * Open-ended data-question eval for queryBids: asks the agent each question with only
 * the queryBids tool, then scores its text answer against a reference computed from the DB
 * (numbers within 2%; strings by distinctive-token match).
 *
 *   npx tsx eval/harness/run-questions.ts [--runs 3]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

for (const line of readFileSync(resolve(__dirname, '../../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, tool } from 'ai'
import { queryBidsInput, TOOL_DESCRIPTIONS } from '../../lib/bidgrid/build-tools'
import { runQueryBids, queryDb } from '../../lib/bidgrid/query-bids'
import { SYSTEM_PROMPT } from '../../lib/bidgrid/system-prompt'
import { QUESTIONS } from './questions'
import { RESULTS_DIR, pct } from './lib'

const runs = process.argv.includes('--runs') ? Number(process.argv[process.argv.indexOf('--runs') + 1]) : 3

/** Numbers in the text, commas stripped. */
function numbersIn(text: string): number[] {
  return (text.match(/\$?\s*[\d,]+(?:\.\d+)?/g) ?? [])
    .map((s) => Number(s.replace(/[$,\s]/g, '')))
    .filter((n) => Number.isFinite(n))
}
function numberMatches(ref: number, text: string, tol = 0.02): boolean {
  const band = Math.max(Math.abs(ref) * tol, ref === Math.round(ref) ? 0.5 : 0) // exact-ish for integers
  return numbersIn(text).some((n) => Math.abs(n - ref) <= band)
}
/** Distinctive tokens (len ≥ 4) of the reference string all appear, or the whole string does. */
function stringMatches(ref: string, text: string): boolean {
  const t = text.toLowerCase()
  if (t.includes(ref.toLowerCase())) return true
  const tokens = ref.toLowerCase().match(/[a-z]{4,}/g) ?? []
  return tokens.length > 0 && tokens.filter((w) => t.includes(w)).length >= Math.min(2, tokens.length)
}

async function askOnce(question: string) {
  const calls: { purpose: string; ok: boolean }[] = []
  const tools = {
    queryBids: tool({
      description: TOOL_DESCRIPTIONS.queryBids,
      inputSchema: queryBidsInput,
      execute: async ({ sql, purpose }) => {
        const res = runQueryBids(queryDb(), sql, purpose)
        calls.push({ purpose, ok: !('error' in res) })
        return res
      },
    }),
  }
  const res = await generateText({
    model: anthropic('claude-sonnet-5-5'),
    system: SYSTEM_PROMPT,
    prompt: question,
    stopWhen: stepCountIs(6),
    tools,
  })
  return { text: res.text, calls, steps: res.steps.length }
}

async function main() {
  const db = queryDb()
  const perCase: Record<string, { refl: string; passes: number; answers: string[] }> = {}
  console.log(`\nqueryBids open-ended question eval — ${QUESTIONS.length} questions × ${runs} runs\n`)

  for (const q of QUESTIONS) {
    const ref = q.reference(db)
    const refStr = typeof ref === 'number' ? (Math.round(ref * 100) / 100).toString() : ref
    perCase[q.id] = { refl: refStr, passes: 0, answers: [] }
    for (let i = 0; i < runs; i++) {
      const { text } = await askOnce(q.question)
      const pass = q.kind === 'number' ? numberMatches(ref as number, text) : stringMatches(ref as string, text)
      if (pass) perCase[q.id].passes++
      perCase[q.id].answers.push(text.replace(/\s+/g, ' ').slice(0, 160))
    }
    const c = perCase[q.id]
    console.log(`  ${q.id.padEnd(24)} ref=${refStr.padEnd(28)} ${c.passes}/${runs} pass`)
    console.log(`      e.g. "${c.answers[0]}"`)
  }

  const totalPass = Object.values(perCase).reduce((s, c) => s + c.passes, 0)
  const totalTrials = QUESTIONS.length * runs
  console.log(`\nOVERALL: ${totalPass}/${totalTrials} (${pct(totalPass / totalTrials)}) correct within tolerance`)

  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(resolve(RESULTS_DIR, 'questions.json'), JSON.stringify({ runs, perCase }, null, 2))
  console.log(`Saved ${resolve(RESULTS_DIR, 'questions.json')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
