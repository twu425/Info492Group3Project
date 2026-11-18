'use server'

import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { can, comparePrice, parseRole, priceCheckLabel, ROLE_COOKIE, type Evidence, type RequestInput, type RequestItem } from '@/lib/roles'
import { readStore, updateStore, type DraftedBy, type QuoteRequest } from '@/lib/roles-store'

// Same model as the Build assistant (app/api/build/route.ts).
const MODEL = 'claude-sonnet-5-5'
const MAX_BODY = 2000
const MAX_ITEMS = 30

type Result = { ok: true } | { error: string }
type DraftResult = { text: string } | { error: string }

async function currentRole() {
  return parseRole((await cookies()).get(ROLE_COOKIE)?.value)
}

const money = (n: number | null) => (n == null ? 'n/a' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

/** Who wrote the text: the assistant if the person started from its draft, with `edited` if they changed it. */
function authorship(body: string, draft: string | null | undefined): { draftedBy: DraftedBy; edited: boolean } {
  return draft ? { draftedBy: 'assistant', edited: draft.trim() !== body.trim() } : { draftedBy: 'person', edited: false }
}

function cleanText(value: unknown, { required }: { required: boolean }): string | null {
  if (typeof value !== 'string') return required ? null : ''
  const text = value.trim()
  if (text.length > MAX_BODY) return null
  return required && !text ? null : text
}

/** Throws a message the page shows to the person. */
class Refused extends Error {}

function refresh() {
  for (const p of ['/inbox', '/quotes', '/log']) revalidatePath(p)
}

async function run(change: () => Promise<void>): Promise<Result> {
  try {
    await change()
    refresh()
    return { ok: true }
  } catch (e) {
    if (e instanceof Refused) return { error: e.message }
    return { error: 'Something went wrong saving that. Try again.' }
  }
}

function findRequest(requests: QuoteRequest[], id: string) {
  const r = requests.find((x) => x.id === id)
  if (!r) throw new Refused('That request no longer exists.')
  return r
}

// ---------- Checking what the browser sends ----------

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

function cleanEvidence(e: unknown): Evidence | null {
  if (!e || typeof e !== 'object') return null
  const v = e as Record<string, unknown>
  const num = (x: unknown) => (finite(x) && x >= 0 ? x : null)
  return { low: num(v.low), typical: num(v.typical), high: num(v.high), pastBids: finite(v.pastBids) ? Math.max(0, Math.round(v.pastBids)) : 0 }
}

function cleanInput(input: RequestInput): RequestInput {
  const items: RequestItem[] = (Array.isArray(input?.items) ? input.items : []).slice(0, MAX_ITEMS).flatMap((i) => {
    const itemId = str(i?.itemId, 80)
    const description = str(i?.description, 200)
    if (!itemId || !description || !finite(i?.quantity) || i.quantity <= 0) return []
    return [{ itemId, itemCode: str(i.itemCode, 20), description, quantity: i.quantity, unit: str(i.unit, 12), evidence: cleanEvidence(i.evidence) }]
  })
  return {
    estimateId: str(input?.estimateId, 80),
    estimateName: str(input?.estimateName, 120) || 'Untitled estimate',
    location: str(input?.location, 120),
    scope: (Array.isArray(input?.scope) ? input.scope : []).slice(0, 20).map((s) => str(s, 200)).filter(Boolean),
    items,
  }
}

function itemLines(items: RequestItem[]) {
  return items.map((i) => `- ${i.description}${i.itemCode ? ` (item ${i.itemCode})` : ''}: ${qty(i.quantity)} ${i.unit}`)
}

// ---------- Assistant drafts (text only; the assistant never sends, prices or applies anything) ----------

async function draft(instructions: string[], prompt: string[], maxOutputTokens = 800): Promise<DraftResult> {
  try {
    const { text } = await generateText({
      model: anthropic(MODEL),
      maxOutputTokens,
      instructions: instructions.join('\n'),
      prompt: prompt.filter(Boolean).join('\n'),
    })
    return text.trim() ? { text: text.trim() } : { error: 'The assistant returned an empty draft. Write it yourself.' }
  } catch {
    return { error: 'The assistant couldn’t draft this right now. Write it yourself.' }
  }
}

const PLAIN_WORDS = 'Use plain construction words: say "past bids", not "comparables"; say "low / typical / high", not percentiles. No markdown.'

/** Drafts the cover message for a quote request. It is given no prices at all, so it can't leak the estimator's number. */
export async function draftRequest(input: RequestInput): Promise<DraftResult> {
  if (!can(await currentRole(), 'request')) return { error: 'Only the estimator can draft a quote request.' }
  const clean = cleanInput(input)
  if (!clean.items.length) return { error: 'Pick at least one item to request a quote on.' }
  return draft(
    [
      'You draft a short request for quote from a general contractor estimator to a subcontractor on a public Caltrans highway bid.',
      'Ask the subcontractor for unit prices on the listed items and for any exclusions or assumptions.',
      'Write 3 to 5 plain sentences, polite and specific, mentioning the location and any scope notes that matter for pricing. No greeting line, no sign-off.',
      'Do not list the items again in full; they are attached. Never state, guess or hint at any price.',
      PLAIN_WORDS,
    ],
    [
      `Estimate: ${clean.estimateName}`,
      clean.location ? `Location: ${clean.location}` : '',
      clean.scope.length ? `Scope notes:\n${clean.scope.map((s) => `- ${s}`).join('\n')}` : '',
      `Items attached:\n${itemLines(clean.items).join('\n')}`,
    ],
  )
}

/** Drafts the sub's notes to go with their prices: assumptions and exclusions, never new prices. */
export async function draftQuoteNote(requestId: string, prices: Record<string, number>): Promise<DraftResult> {
  if (!can(await currentRole(), 'quote')) return { error: 'Only the subcontractor can draft quote notes.' }
  const r = (await readStore()).requests.find((x) => x.id === requestId)
  if (!r || r.status !== 'sent') return { error: 'This request isn’t waiting on a quote.' }
  const asked = r.messages.find((m) => m.kind === 'request')?.body ?? ''
  const thread = r.messages.filter((m) => m.kind === 'clarify' || m.kind === 'reply')
  return draft(
    [
      'You draft the notes a subcontractor sends with a quote to a general contractor on a public Caltrans highway bid.',
      'List the likely assumptions and exclusions for this work (for example traffic control, testing, mobilization, material escalation, working hours) in 2 to 4 plain sentences.',
      'Do not change, suggest or comment on the prices; the subcontractor sets them. No greeting line, no sign-off.',
      PLAIN_WORDS,
    ],
    [
      `Location: ${r.location}`,
      r.scope.length ? `Scope notes: ${r.scope.join('; ')}` : '',
      `Request from the estimator: ${asked}`,
      thread.length ? `Earlier questions and replies:\n${thread.map((m) => `${m.from}: ${m.body}`).join('\n')}` : '',
      `Items quoted:\n${r.items.map((i) => `- ${i.description}: ${qty(i.quantity)} ${i.unit}${finite(prices?.[i.itemId]) ? ` at ${money(prices[i.itemId])}` : ' (not quoted)'}`).join('\n')}`,
    ],
  )
}

/** The assistant's short read of a returned quote, for the estimator. Price checks are worked out in code first. */
async function summarizeQuote(r: QuoteRequest, prices: Record<string, number>, notes: string): Promise<string | null> {
  const lines = r.items.map((i) => {
    const p = prices[i.itemId]
    if (!finite(p)) return `- ${i.description}: not quoted`
    return `- ${i.description}: ${money(p)} per ${i.unit} (${priceCheckLabel(comparePrice(p, i.evidence))}; past bids low / typical / high ${money(i.evidence?.low ?? null)} / ${money(i.evidence?.typical ?? null)} / ${money(i.evidence?.high ?? null)})`
  })
  const res = await draft(
    [
      'You summarize a subcontractor quote for the general contractor estimator in 2 sentences.',
      'Say which prices are outside the past-bid range, and point out any exclusions or assumptions in the notes that the estimator must cover elsewhere.',
      'Do not recommend whether to use the quote; the estimator decides. ' + PLAIN_WORDS,
    ],
    [`Items:\n${lines.join('\n')}`, notes ? `Sub's notes: ${notes}` : 'The sub left no notes.'],
    300,
  )
  return 'text' in res ? res.text : null
}

// ---------- The exchange: every action checks the role and the request's status, then logs ----------

/** The estimator sends a quote request. `draft` is the assistant's original text, if they started from it. */
export async function sendRequest(input: { request: RequestInput; body: string; draft: string | null }): Promise<Result & { id?: string }> {
  let id: string | undefined
  const res = await run(async () => {
    if (!can(await currentRole(), 'request')) throw new Refused('Only the estimator can request quotes.')
    const body = cleanText(input.body, { required: true })
    if (!body) throw new Refused('Write a message first (up to 2,000 characters).')
    const clean = cleanInput(input.request)
    if (!clean.estimateId) throw new Refused('Open an estimate first.')
    if (!clean.items.length) throw new Refused('Pick at least one item to request a quote on.')
    const time = new Date().toISOString()
    const who = authorship(body, input.draft)

    await updateStore((store) => {
      id = `RFQ-${String(store.requests.length + 1).padStart(3, '0')}`
      store.requests.push({
        id,
        ...clean,
        status: 'sent',
        messages: [{ from: 'estimator', kind: 'request', body, ...who, time }],
        quote: null,
        decisions: {},
        createdAt: time,
      })
      store.log.push({ time, role: 'estimator', action: 'request', requestId: id, ...who, detail: `${clean.items.length} item${clean.items.length === 1 ? '' : 's'}` })
    })
  })
  return 'ok' in res ? { ...res, id } : res
}

/** The sub asks the estimator a question before quoting. */
export async function askClarification(input: { requestId: string; body: string }): Promise<Result> {
  return run(async () => {
    if (!can(await currentRole(), 'clarify')) throw new Refused('Only the subcontractor can ask about a request.')
    const body = cleanText(input.body, { required: true })
    if (!body) throw new Refused('Write your question first (up to 2,000 characters).')
    const time = new Date().toISOString()
    await updateStore((store) => {
      const r = findRequest(store.requests, input.requestId)
      if (r.status !== 'sent') throw new Refused('This request isn’t waiting on you.')
      r.status = 'needs_info'
      r.messages.push({ from: 'sub', kind: 'clarify', body, draftedBy: 'person', edited: false, time })
      store.log.push({ time, role: 'sub', action: 'clarify', requestId: r.id, draftedBy: 'person', edited: false })
    })
  })
}

/** The estimator answers the sub's question, and the request goes back to the sub. */
export async function replyClarification(input: { requestId: string; body: string }): Promise<Result> {
  return run(async () => {
    if (!can(await currentRole(), 'reply')) throw new Refused('Only the estimator can reply to a question.')
    const body = cleanText(input.body, { required: true })
    if (!body) throw new Refused('Write your reply first (up to 2,000 characters).')
    const time = new Date().toISOString()
    await updateStore((store) => {
      const r = findRequest(store.requests, input.requestId)
      if (r.status !== 'needs_info') throw new Refused('There is no open question on this request.')
      r.status = 'sent'
      r.messages.push({ from: 'estimator', kind: 'reply', body, draftedBy: 'person', edited: false, time })
      store.log.push({ time, role: 'estimator', action: 'reply', requestId: r.id, draftedBy: 'person', edited: false })
    })
  })
}

/** The sub sends their prices. The assistant then writes a short read for the estimator; it never changes a price. */
export async function submitQuote(input: { requestId: string; prices: Record<string, number>; notes: string; draft: string | null }): Promise<Result> {
  return run(async () => {
    if (!can(await currentRole(), 'quote')) throw new Refused('Only the subcontractor can send a quote.')
    const notes = cleanText(input.notes, { required: false })
    if (notes == null) throw new Refused('Notes can be up to 2,000 characters.')

    const before = (await readStore()).requests.find((x) => x.id === input.requestId)
    if (!before) throw new Refused('That request no longer exists.')
    if (before.status !== 'sent') throw new Refused('This request isn’t waiting on a quote.')
    const prices: Record<string, number> = {}
    for (const item of before.items) {
      const p = input.prices?.[item.itemId]
      if (p == null) continue
      if (!finite(p) || p <= 0 || p > 1e9) throw new Refused(`Enter a price above zero for ${item.description}, or leave it blank.`)
      prices[item.itemId] = Math.round(p * 100) / 100
    }
    if (!Object.keys(prices).length) throw new Refused('Enter a price for at least one item.')

    const summary = await summarizeQuote(before, prices, notes)
    const time = new Date().toISOString()
    const who = notes ? authorship(notes, input.draft) : { draftedBy: 'person' as const, edited: false }

    await updateStore((store) => {
      const r = findRequest(store.requests, input.requestId)
      if (r.status !== 'sent') throw new Refused('This request isn’t waiting on a quote.')
      r.status = 'quoted'
      r.quote = { prices, notes, summary, time }
      r.messages.push({ from: 'sub', kind: 'quote', body: notes, ...who, time })
      const n = Object.keys(prices).length
      store.log.push({ time, role: 'sub', action: 'quote', requestId: r.id, ...who, detail: `${n} price${n === 1 ? '' : 's'}` })
    })
  })
}

/** The estimator uses or declines one quoted price. Only the estimator's click changes the estimate. */
export async function decideItem(input: { requestId: string; itemId: string; decision: 'used' | 'declined' }): Promise<Result> {
  return run(async () => {
    if (!can(await currentRole(), 'decide')) throw new Refused('Only the estimator decides which prices go in the bid.')
    if (input.decision !== 'used' && input.decision !== 'declined') throw new Refused('Pick use or decline.')
    const time = new Date().toISOString()
    await updateStore((store) => {
      const r = findRequest(store.requests, input.requestId)
      if (r.status !== 'quoted' || !r.quote) throw new Refused('This request has no open quote.')
      const item = r.items.find((i) => i.itemId === input.itemId)
      if (!item || r.quote.prices[item.itemId] == null) throw new Refused('That item wasn’t quoted.')
      if (r.decisions[item.itemId]) throw new Refused('You already decided on this price.')
      r.decisions[item.itemId] = input.decision
      if (Object.keys(r.quote.prices).every((id) => r.decisions[id])) r.status = 'closed'
      store.log.push({
        time,
        role: 'estimator',
        action: input.decision === 'used' ? 'use' : 'decline',
        requestId: r.id,
        draftedBy: 'person',
        edited: false,
        detail: `${item.description} at ${money(r.quote.prices[item.itemId])}`,
      })
    })
  })
}

/** Requests for one estimate, for the Build table. Estimator only. */
export async function quotesForEstimate(estimateId: string): Promise<QuoteRequest[]> {
  if (!can(await currentRole(), 'request') || typeof estimateId !== 'string') return []
  return (await readStore()).requests.filter((r) => r.estimateId === estimateId)
}
