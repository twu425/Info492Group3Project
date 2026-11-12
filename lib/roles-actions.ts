'use server'

import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { ASKABLE_KINDS, can, parseRole, ROLE_COOKIE, ROLES, TOPICS, type QuestionContext, type Role, type Topic } from '@/lib/roles'
import { readStore, updateStore, type DraftedBy, type Question } from '@/lib/roles-store'

// Same model as the Build assistant (app/api/build/route.ts).
const MODEL = 'claude-sonnet-5-5'
const MAX_BODY = 2000

type Result = { ok: true } | { error: string }

async function currentRole() {
  return parseRole((await cookies()).get(ROLE_COOKIE)?.value)
}

const money = (n: number | null) => (n == null ? 'n/a' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)

function evidenceLine(ev: QuestionContext['evidence']) {
  return ev
    ? `Past bids within 50 miles: ${ev.pastBids}. Unit price low / typical / high: ${money(ev.low)} / ${money(ev.typical)} / ${money(ev.high)}.${
        ev.contracts.length ? ` Example contracts: ${ev.contracts.join(', ')}.` : ''
      }`
    : 'No past-bid summary for this item.'
}

/** Who wrote the text: the assistant if the person started from its draft, with `edited` if they changed it. */
function authorship(body: string, draft: string | null): { draftedBy: DraftedBy; edited: boolean } {
  return draft ? { draftedBy: 'assistant', edited: draft.trim() !== body.trim() } : { draftedBy: 'person', edited: false }
}

function cleanBody(body: unknown): string | null {
  if (typeof body !== 'string') return null
  const text = body.trim()
  return text && text.length <= MAX_BODY ? text : null
}

/** Throws a message the page shows to the person. */
class Refused extends Error {}

function refresh() {
  for (const p of ['/inbox', '/questions', '/log']) revalidatePath(p)
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

// ---------- Assistant drafts (text only; nothing is ever sent by the assistant) ----------

async function draft(instructions: string[], prompt: string[]): Promise<{ text: string } | { error: string }> {
  try {
    const { text } = await generateText({
      model: anthropic(MODEL),
      maxOutputTokens: 1000,
      instructions: instructions.join('\n'),
      prompt: prompt.filter(Boolean).join('\n'),
    })
    return text.trim() ? { text: text.trim() } : { error: 'The assistant returned an empty draft. Write it yourself.' }
  } catch {
    return { error: 'The assistant couldn’t draft this right now. Write it yourself.' }
  }
}

/** Drafts a question from a subcontractor to the GC about one check finding. */
export async function draftQuestion(ctx: QuestionContext): Promise<{ text: string } | { error: string }> {
  if (!can(await currentRole(), 'ask')) return { error: 'Only the subcontractor estimator can draft a question.' }
  if (!ASKABLE_KINDS.includes(ctx.findingKind) || typeof ctx.findingMessage !== 'string' || ctx.findingMessage.length > 600) {
    return { error: 'This finding can’t be turned into a question.' }
  }
  return draft(
    [
      'You draft a short question from a subcontractor estimator to the general contractor (GC) on a public highway bid.',
      'The question asks the GC to clarify scope, quantity or specification so the sub can price the work.',
      'Write 2 to 4 plain sentences in the first person, polite and specific. No greeting line, no sign-off, no markdown.',
      "Never state or hint at the subcontractor's own prices or totals. Past-bid figures may be mentioned only as context.",
      'Use plain construction words: say "past bids", not "comparables"; say "low / typical / high", not percentiles.',
    ],
    [
      `Check finding: ${ctx.findingMessage}`,
      ctx.itemDescription ? `Bid item: ${ctx.itemDescription}${ctx.itemCode ? ` (item ${ctx.itemCode})` : ''}` : '',
      evidenceLine(ctx.evidence),
    ],
  )
}

/** Drafts an answer for the GC or designer to edit. The designer's prompt holds no sub prices (none are stored). */
export async function draftAnswer(questionId: string): Promise<{ text: string } | { error: string }> {
  const role = await currentRole()
  if (!can(role, 'answer')) return { error: 'Only the GC or the designer can draft an answer.' }
  const q = (await readStore()).questions.find((x) => x.id === questionId)
  if (!q || q.status !== (role === 'gc' ? 'with_gc' : 'with_designer')) return { error: 'This question isn’t waiting on you.' }
  const asked = q.messages.find((m) => m.kind === 'question')?.body ?? ''
  const note = q.messages.find((m) => m.kind === 'forward')?.body
  return draft(
    [
      `You draft a short answer from the ${role === 'gc' ? 'general contractor' : 'designer / owner'} to a subcontractor's question on a public highway bid.`,
      'Write 2 to 4 plain sentences. No greeting line, no sign-off, no markdown.',
      'You do not know the actual plans or specifications. Where a fact is needed (a thickness, a quantity, a spec section), leave a clear placeholder in square brackets, such as [confirm thickness], for the person to fill in.',
      'Use plain construction words: say "past bids", not "comparables".',
    ],
    [
      `Topic: ${q.topic}`,
      q.itemDescription ? `Bid item: ${q.itemDescription}` : '',
      `Question: ${asked}`,
      note ? `Note from the GC: ${note}` : '',
      evidenceLine(q.evidence),
    ],
  )
}

// ---------- The exchange: every action checks the role and the question's status, then logs ----------

/** The sub sends a question to the GC. `draft` is the assistant's original text, if they started from it. */
export async function askQuestion(input: { context: QuestionContext; topic: Topic; body: string; draft: string | null }): Promise<Result> {
  return run(async () => {
    const role = await currentRole()
    if (!can(role, 'ask')) throw new Refused('Only the subcontractor estimator can ask the GC.')
    const body = cleanBody(input.body)
    if (!body) throw new Refused('Write a question first (up to 2,000 characters).')
    const ctx = input.context
    if (!ASKABLE_KINDS.includes(ctx.findingKind)) throw new Refused('This finding can’t be turned into a question.')
    if (!TOPICS.includes(input.topic)) throw new Refused('Pick a topic.')
    const time = new Date().toISOString()
    const who = authorship(body, input.draft)

    await updateStore((store) => {
      const question: Question = {
        id: `Q-${String(store.questions.length + 1).padStart(3, '0')}`,
        itemCode: ctx.itemCode,
        itemDescription: ctx.itemDescription,
        findingKind: ctx.findingKind,
        findingMessage: String(ctx.findingMessage).slice(0, 600),
        topic: input.topic,
        status: 'with_gc',
        evidence: ctx.evidence,
        messages: [{ from: 'sub', to: 'gc', kind: 'question', body, ...who, time }],
      }
      store.questions.push(question)
      store.log.push({ time, role: 'sub', action: 'ask', questionId: question.id, ...who })
    })
  })
}

/** Only the GC can escalate a question to the designer. */
export async function forwardToDesigner(input: { questionId: string; note: string }): Promise<Result> {
  return run(async () => {
    const role = await currentRole()
    if (!can(role, 'forward')) throw new Refused('Only the general contractor can forward a question to the designer.')
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, MAX_BODY) : ''
    const time = new Date().toISOString()

    await updateStore((store) => {
      const q = store.questions.find((x) => x.id === input.questionId)
      if (!q) throw new Refused('That question no longer exists.')
      if (q.status !== 'with_gc') throw new Refused('This question isn’t with the GC any more.')
      q.status = 'with_designer'
      q.messages.push({ from: 'gc', to: 'designer', kind: 'forward', body: note, draftedBy: 'person', edited: false, time })
      store.log.push({ time, role: 'gc', action: 'forward', questionId: q.id, draftedBy: 'person', edited: false })
    })
  })
}

/** The GC answers questions with the GC; the designer answers questions forwarded to them. */
export async function answerQuestion(input: { questionId: string; body: string; draft: string | null }): Promise<Result> {
  return run(async () => {
    const role = await currentRole()
    if (!can(role, 'answer')) throw new Refused('Only the GC or the designer can answer a question.')
    const body = cleanBody(input.body)
    if (!body) throw new Refused('Write an answer first (up to 2,000 characters).')
    const time = new Date().toISOString()
    const who = authorship(body, input.draft)

    await updateStore((store) => {
      const q = store.questions.find((x) => x.id === input.questionId)
      if (!q) throw new Refused('That question no longer exists.')
      const waitingOn: Role = q.status === 'with_gc' ? 'gc' : q.status === 'with_designer' ? 'designer' : 'sub'
      if (waitingOn !== role) throw new Refused(`This question is waiting on ${q.status === 'answered' ? 'no one — it’s already answered' : `the ${ROLES[waitingOn].label}`}.`)
      q.status = 'answered'
      q.messages.push({ from: role!, to: 'sub', kind: 'answer', body, ...who, time })
      store.log.push({ time, role: role!, action: 'answer', questionId: q.id, ...who })
    })
  })
}
