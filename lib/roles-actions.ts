'use server'

import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { cookies } from 'next/headers'
import { ASKABLE_KINDS, can, parseRole, ROLE_COOKIE, type QuestionContext } from '@/lib/roles'

// Same model as the Build assistant (app/api/build/route.ts).
const MODEL = 'claude-sonnet-5-5'

async function currentRole() {
  return parseRole((await cookies()).get(ROLE_COOKIE)?.value)
}

const money = (n: number | null) => (n == null ? 'n/a' : `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`)

/**
 * Drafts a question from a subcontractor to the GC about one check finding.
 * Returns text only. Nothing is sent: the sub edits the draft and sends it themselves.
 */
export async function draftQuestion(ctx: QuestionContext): Promise<{ text: string } | { error: string }> {
  if (!can(await currentRole(), 'ask')) return { error: 'Only the subcontractor estimator can draft a question.' }
  if (!ASKABLE_KINDS.includes(ctx.findingKind) || typeof ctx.findingMessage !== 'string' || ctx.findingMessage.length > 600) {
    return { error: 'This finding can’t be turned into a question.' }
  }

  const ev = ctx.evidence
  const evidence = ev
    ? `Past bids within 50 miles: ${ev.pastBids}. Unit price low / typical / high: ${money(ev.low)} / ${money(ev.typical)} / ${money(ev.high)}.${
        ev.contracts.length ? ` Example contracts: ${ev.contracts.join(', ')}.` : ''
      }`
    : 'No past-bid summary for this item.'

  try {
    const { text } = await generateText({
      model: anthropic(MODEL),
      maxOutputTokens: 1000,
      instructions: [
        'You draft a short question from a subcontractor estimator to the general contractor (GC) on a public highway bid.',
        'The question asks the GC to clarify scope, quantity or specification so the sub can price the work.',
        'Write 2 to 4 plain sentences in the first person, polite and specific. No greeting line, no sign-off, no markdown.',
        "Never state or hint at the subcontractor's own prices or totals. Past-bid figures may be mentioned only as context.",
        'Use plain construction words: say "past bids", not "comparables"; say "low / typical / high", not percentiles.',
      ].join('\n'),
      prompt: [
        `Check finding: ${ctx.findingMessage}`,
        ctx.itemDescription ? `Bid item: ${ctx.itemDescription}${ctx.itemCode ? ` (item ${ctx.itemCode})` : ''}` : '',
        evidence,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    return text.trim() ? { text: text.trim() } : { error: 'The assistant returned an empty draft. Write the question yourself.' }
  } catch {
    return { error: 'The assistant couldn’t draft this right now. Write the question yourself.' }
  }
}
