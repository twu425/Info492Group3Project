import { anthropic } from '@ai-sdk/anthropic'
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
} from 'ai'
import { z } from 'zod'
import {
  clientTools,
  searchComparablesInput,
  TOOL_DESCRIPTIONS,
  type BuildUIMessage,
  type SearchComparablesOutput,
} from '@/lib/bidgrid/build-tools'
import { UNITS, type Unit } from '@/lib/bidgrid/data'
import { estimateBidItems, estimateItem, nearestCounty, resolveItem } from '@/lib/bidgrid/estimate'
import { formatDistrict, formatQty, formatUnitPrice, itemLabel } from '@/lib/bidgrid/format'
import { SYSTEM_PROMPT } from '@/lib/bidgrid/system-prompt'

export const maxDuration = 60

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(200),
  draftId: z.string().max(100).optional(),
  pin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  items: z
    .array(
      z.object({
        id: z.string().max(20),
        itemCode: z.string().max(20),
        description: z.string().max(200),
        quantity: z.number(),
        unit: z.enum(UNITS as [Unit, ...Unit[]]),
        unitPrice: z.number().positive().optional(),
        source: z.enum(['assistant', 'user']).optional(),
      }),
    )
    .max(100)
    .default([]),
  edits: z.array(z.string().max(300)).max(30).default([]),
  scope: z
    .record(
      z.string().max(60),
      z.object({
        value: z.union([z.string().max(200), z.number()]),
        unit: z.string().max(20).optional(),
        source: z.enum(['user', 'assumed']),
      }),
    )
    .default({}),
})

// Account-level failures (bad key, billing, rate limits) are actionable for the user; anything else stays generic.
function describeError(error: unknown): string {
  const status = (error as { statusCode?: number } | null)?.statusCode
  if (status === 401 || status === 403) return 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in Vars.'
  if (status === 429) return 'Anthropic rate limit or credit limit reached. Try again shortly.'
  return 'Something went wrong reaching the assistant.'
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json())
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const { pin, items, edits, draftId, scope } = parsed.data
  const messages = parsed.data.messages as BuildUIMessage[]

  // Dev-only: log the draft id, items, and user edits so context mismatches are easy to spot.
  if (process.env.NODE_ENV !== 'production') {
    console.log(
      '[/api/build]',
      JSON.stringify({
        draftId,
        items: items.map((i) => ({ id: i.id, code: i.itemCode, qty: i.quantity, unit: i.unit, source: i.source })),
        edits,
        scope,
      }),
    )
  }

  const county = nearestCounty(pin)
  const round2 = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)
  // Lump sums are size-matched to the rest of the list, so price them in list context.
  const estimates = estimateBidItems(pin, items)
  const effective = items.map((i, idx) => round2(i.unitPrice ?? estimates[idx]?.p50))
  const estTotal = items.reduce((s, i, idx) => (effective[idx] != null ? s + effective[idx]! * i.quantity : s), 0)
  const snapshot = items
    .map((i, idx) => {
      const price = effective[idx]
      const isLS = i.unit === 'LS'
      const needsPrice = isLS && price == null && i.unitPrice == null
      const share = price != null && estTotal > 0 ? (price * i.quantity) / estTotal : 0
      const priceStr = price != null
        ? ` at ${formatUnitPrice(price)}`
        : needsPrice
          ? ' — no comparable lump-sum price for a project this size; ask the user for a figure'
          : ''
      const tag =
        i.source === 'assistant'
          ? ' (added by you this conversation)'
          : i.source === 'user' || i.unitPrice != null
            ? ' (user-edited)'
            : ''
      const shareStr =
        isLS && share >= 0.3 ? ` — this lump sum is ~${Math.round(share * 100)}% of the estimate total` : ''
      return `- [${i.id}] ${itemLabel(i.description)}: ${formatQty(i.quantity)} ${i.unit}${priceStr}${tag}${shareStr}`
    })
    .join('\n')
  const locationLine = `Location: ${county.name} County, ${formatDistrict(county.district)}`

  const scopeEntries = Object.entries(scope)
  const scopeBlock = scopeEntries.length
    ? `Confirmed project scope — details the user has set or accepted this conversation (recorded via your scope tool). "assumed" means a typical default you used; keep it unless the user corrects it. Don't re-ask for details already here.\n${scopeEntries
        .map(([key, v]) => `- ${key}: ${v.value}${v.unit ? ` ${v.unit}` : ''} (${v.source})`)
        .join('\n')}`
    : ''

  const context = [
    `Pin: ${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)} — nearest data is ${county.name} (${county.code}), ${formatDistrict(county.district)}, ${Math.round(county.miles)} mi away.`,
    scopeBlock,
    items.length
      ? `Current bid items — the live, authoritative list (${items.length} item${items.length === 1 ? '' : 's'}) exactly as the user sees it in the table right now. It overrides everything earlier in the chat, including your own messages and tool results. This list already includes every change from your tool calls so far, including ones in this response. An item you just added appears here once; that is the same item, not a duplicate — do not warn about duplicates for items tagged "(added by you this conversation)". The bracketed key is internal: use it only to target updateLineItem/removeLineItem, and never show or mention it to the user.\n${snapshot}\n${locationLine}`
      : `Current bid items: the list is EMPTY — 0 items. This is the live, authoritative state and overrides everything earlier in the chat (including items you added that the user has since removed). The list is empty right now; do not say it might be out of date or unrefreshed, and do not re-add removed items unless the user asks.\n${locationLine}`,
    edits.length
      ? `Changes the user made manually since your last message (these already happened — do not undo or reverse them):\n${edits.map((e) => `- ${e}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  // Backup guard so the assistant can't skip asking: on the very first user message of a
  // brand-new draft (no items, no saved scope), only updateProjectScope is available. That
  // forces either a text reply (clarifying questions) or a scope save — never a silent item
  // add. Once the user's message already carries the values, the assistant saves them with
  // updateProjectScope; the next step runs with scope no longer empty, so the full tool set
  // is restored and the items are added without asking.
  const firstUserMessage = messages.filter((m) => m.role === 'user').length <= 1
  const gateToScopeOnly = items.length === 0 && Object.keys(scope).length === 0 && firstUserMessage
  const SCOPE_ONLY_TOOLS = ['updateProjectScope'] as const

  const result = streamText({
    model: anthropic('claude-haiku-5-5'),
    instructions: `${SYSTEM_PROMPT}\n\n${context}`,
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(8),
    activeTools: gateToScopeOnly ? SCOPE_ONLY_TOOLS : undefined,
    tools: {
      searchComparables: tool({
        description: TOOL_DESCRIPTIONS.searchComparables,
        inputSchema: searchComparablesInput,
        execute: async ({ itemFamily, quantity, itemCode }): Promise<SearchComparablesOutput> => {
          const item = resolveItem(itemFamily, { itemCode })
          // Size-match lump-sum searches to the rest of the current list, same as the table.
          const isLS = item?.unit === 'LS'
          const referenceTotal = isLS
            ? items.reduce((s, i, idx) => {
                if (i.itemCode === item!.code) return s
                const p = effective[idx]
                return p != null ? s + p * i.quantity : s
              }, 0)
            : 0
          const estimate = item
            ? estimateItem(
                pin,
                item.code,
                quantity,
                isLS ? { referenceTotal: referenceTotal || null, referenceFamilies: [itemFamily] } : undefined,
              )
            : null
          if (!estimate) return { error: `No catalog item found in ${itemFamily}.` }
          return {
            itemCode: estimate.item.code,
            description: estimate.item.description,
            unit: estimate.item.unit,
            comparableCount: estimate.comparables.length,
            p25: estimate.p25,
            p50: estimate.p50,
            p75: estimate.p75,
            comparables: estimate.comparables.slice(0, 10).map((c) => ({
              ea: c.ea,
              bidDate: c.bidDate,
              quantity: c.quantity,
              miles: Math.round(c.miles),
              escalatedUnitPrice: Math.round(c.escalatedPrice * 100) / 100,
            })),
          }
        },
      }),
      ...clientTools,
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream, onError: describeError }),
  })
}
