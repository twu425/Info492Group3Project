'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai'
import { Crosshair, X } from 'lucide-react'
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import type { BidItem, BuildUIMessage, ProjectScope } from '@/lib/bidgrid/build-tools'
import { CONTRACTS, type ItemFamily } from '@/lib/bidgrid/data'
import { createDraftId, formatRelative, getDraft, saveDraft, useDrafts, type Draft } from '@/lib/bidgrid/drafts'
import {
  distanceMiles,
  estimateBidItems,
  estimateItem,
  nearestCounty,
  rankSimilarProjects,
  resolveItem,
  type LatLng,
  type PriceEstimate,
} from '@/lib/bidgrid/estimate'
import { formatDistrict, formatQty, formatUnitPrice, itemLabel } from '@/lib/bidgrid/format'
import { useNow } from '@/lib/bidgrid/preferences'
import { cn } from '@/lib/utils'
import { familyDetail, type DetailView } from '../detail/detail-modal'
import { BidItems, type PricedBidItem } from './bid-items'
import { BuildChat, type ChatEvent } from './build-chat'
import { SimilarProjects } from './similar-projects'

export interface BuildDrawerHandle {
  requestClose: (then: () => void) => void
  /** Called by the map after the pin is relocated via placement mode. */
  notifyPinReplaced: (pin: LatLng) => void
}

interface BuildDrawerProps {
  ref?: Ref<BuildDrawerHandle>
  /** Stable id for this build's chat, tied to the draft id so histories never mix. */
  chatId: string
  /** False while the drawer is sliding out before unmount. */
  open: boolean
  pin: LatLng
  initialDraft: Draft | null
  /** Replace-pin placement mode is active on the map. */
  placing: boolean
  onReplacePin: () => void
  onOpenContract: (ea: string) => void
  onHoverContract: (ea: string | null) => void
  onOpenDetail: (view: DetailView) => void
  onActiveDraftChange: (id: string | null) => void
  /** Draw a located highway segment on the map (from the showSegment tool). */
  onShowSegment: (segment: MapSegment | null) => void
  onClose: () => void
}

export interface MapSegment {
  points: LatLng[]
  route?: number
  label?: string
}

function nextIdFrom(items: BidItem[]) {
  return items.reduce((max, i) => Math.max(max, Number(i.id.replace(/\D/g, '')) || 0), 0) + 1
}

function signature(pin: LatLng, messages: BuildUIMessage[], items: BidItem[], scope: ProjectScope) {
  return JSON.stringify([pin, messages, items, scope])
}

function defaultDraftName(messages: BuildUIMessage[], pin: LatLng, countyName: string) {
  const firstUser = messages.find((m) => m.role === 'user')
  const text = firstUser?.parts.find((p) => p.type === 'text')?.text ?? ''
  const words = text
    .split(',')[0]
    .replace(/[^\w\s&/-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ')
  const lead = words ? words[0].toUpperCase() + words.slice(1) : 'Estimate'

  const nearest = CONTRACTS.reduce<{ route: number; miles: number } | null>((best, c) => {
    const miles = distanceMiles(pin, c)
    return !best || miles < best.miles ? { route: c.route, miles } : best
  }, null)
  const place = nearest && nearest.miles < 8 ? `Route ${nearest.route}` : `${countyName} County`
  return `${lead} – ${place}`
}

export function BuildDrawer({
  ref,
  chatId,
  open,
  pin,
  initialDraft,
  placing,
  onReplacePin,
  onOpenContract,
  onHoverContract,
  onOpenDetail,
  onActiveDraftChange,
  onShowSegment,
  onClose,
}: BuildDrawerProps) {
  // Mount off-screen, then slide in on the next frame; slide out when `open` goes false.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const [items, setItems] = useState<BidItem[]>(() => initialDraft?.items ?? [])
  const [scope, setScope] = useState<ProjectScope>(() => initialDraft?.scope ?? {})
  const [pendingEdits, setPendingEdits] = useState<string[]>([])
  const [tableExpanded, setTableExpanded] = useState(true)
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null)
  const [naming, setNaming] = useState(false)
  const [closePrompt, setClosePrompt] = useState<{ then: () => void } | null>(null)
  const [chatEvents, setChatEvents] = useState<ChatEvent[]>([])
  const [pendingDelete, setPendingDelete] = useState<
    { item: BidItem; index: number; eventId: string; source?: 'assistant' | 'user' } | null
  >(null)
  const sentEventIds = useRef<Set<string>>(new Set())
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drafts = useDrafts()
  const savedDraft = draftId ? drafts.find((d) => d.id === draftId) : undefined
  const now = useNow(15_000)

  // Tool handlers and the transport run outside render, so they read the latest state through refs.
  const itemsRef = useRef<BidItem[]>(initialDraft?.items ?? [])
  const scopeRef = useRef<ProjectScope>(initialDraft?.scope ?? {})
  const pinRef = useRef(pin)
  const nextId = useRef(nextIdFrom(initialDraft?.items ?? []))
  const lastSavedSig = useRef<string | null>(
    initialDraft ? signature(initialDraft.pin, initialDraft.messages, initialDraft.items, initialDraft.scope ?? {}) : null,
  )
  const chatIdRef = useRef(chatId)
  // Who last changed each item this conversation. Session-scoped (resets on remount),
  // so it is never persisted into a draft.
  const sourcesRef = useRef(new Map<string, 'assistant' | 'user'>())
  // Manual user changes queued for the next request; read and cleared by the transport
  // so they are sent exactly once (never resent on tool-call continuations).
  const pendingChangesRef = useRef<string[]>([])
  useEffect(() => {
    pinRef.current = pin
  }, [pin])

  const commitItems = (next: BidItem[]) => {
    itemsRef.current = next
    setItems(next)
  }

  const commitScope = (next: ProjectScope) => {
    scopeRef.current = next
    setScope(next)
  }

  const roundPrice = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100) / 100)
  /** Estimate for one item in the context of the whole list (so lump sums are size-matched). */
  const estimateFor = (item: BidItem, all: BidItem[]): PriceEstimate | null => {
    const idx = all.findIndex((i) => i.id === item.id)
    if (idx === -1) return estimateItem(pinRef.current, item.itemCode, item.quantity)
    return estimateBidItems(pinRef.current, all)[idx]
  }
  /** Effective unit price for tool results: the user override, else the comparable P50. */
  const priceOf = (item: BidItem): number | null =>
    roundPrice(item.unitPrice ?? estimateFor(item, itemsRef.current)?.p50)
  const summarize = (item: BidItem) => ({
    name: itemLabel(item.description),
    qty: item.quantity,
    unit: item.unit,
    unitPrice: priceOf(item),
  })

  const [transport] = useState(
    () =>
      new DefaultChatTransport<BuildUIMessage>({
        api: '/api/build',
        prepareSendMessagesRequest: ({ messages, body }) => {
          // Read-and-clear so manual changes are sent once, not again on continuations.
          const edits = pendingChangesRef.current
          pendingChangesRef.current = []
          return {
            body: {
              ...body,
              messages,
              draftId: chatIdRef.current,
              pin: pinRef.current,
              edits,
              scope: scopeRef.current,
              items: itemsRef.current.map(({ id, itemCode, description, quantity, unit, unitPrice }) => ({
                id,
                itemCode,
                description,
                quantity,
                unit,
                unitPrice,
                source: sourcesRef.current.get(id),
              })),
            },
          }
        },
      }),
  )

  const { messages, sendMessage, addToolOutput, status, error, stop, regenerate } = useChat<BuildUIMessage>({
    id: chatId,
    messages: initialDraft?.messages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall({ toolCall }) {
      if (toolCall.dynamic) return
      const current = itemsRef.current

      if (toolCall.toolName === 'addLineItem') {
        const { itemFamily, description, quantity, unit, itemCode, quantitySource } = toolCall.input
        const item = resolveItem(itemFamily, { itemCode, description, unit })
        if (!item) {
          addToolOutput({ tool: 'addLineItem', toolCallId: toolCall.toolCallId, output: { error: 'No matching catalog item.' } })
          return
        }
        const existing = current.find((i) => i.itemCode === item.code)
        if (existing) {
          addToolOutput({
            tool: 'addLineItem',
            toolCallId: toolCall.toolCallId,
            output: { status: 'already_exists', item: summarize(existing) },
          })
          return
        }
        const id = `b${nextId.current++}`
        const added: BidItem = { id, itemCode: item.code, description: item.description, family: item.family, quantity, unit: item.unit, quantitySource: quantitySource ?? 'assumed' }
        commitItems([...current, added])
        sourcesRef.current.set(id, 'assistant')
        addToolOutput({
          tool: 'addLineItem',
          toolCallId: toolCall.toolCallId,
          output: { status: 'added', item: summarize(added) },
        })
      }

      if (toolCall.toolName === 'updateLineItem') {
        const { id, quantity, quantitySource } = toolCall.input
        const target = current.find((i) => i.id === id)
        if (!target) {
          addToolOutput({ tool: 'updateLineItem', toolCallId: toolCall.toolCallId, output: { status: 'not_found' } })
          return
        }
        const before = summarize(target)
        const updated: BidItem = { ...target, quantity, quantitySource: quantitySource ?? target.quantitySource }
        commitItems(current.map((i) => (i.id === id ? updated : i)))
        sourcesRef.current.set(id, 'assistant')
        addToolOutput({
          tool: 'updateLineItem',
          toolCallId: toolCall.toolCallId,
          output: { status: 'updated', before, after: summarize(updated) },
        })
      }

      if (toolCall.toolName === 'removeLineItem') {
        const { id } = toolCall.input
        const target = current.find((i) => i.id === id)
        if (!target) {
          addToolOutput({ tool: 'removeLineItem', toolCallId: toolCall.toolCallId, output: { status: 'not_found' } })
          return
        }
        commitItems(current.filter((i) => i.id !== id))
        sourcesRef.current.delete(id)
        addToolOutput({ tool: 'removeLineItem', toolCallId: toolCall.toolCallId, output: { status: 'removed', item: summarize(target) } })
      }

      if (toolCall.toolName === 'showSegment') {
        const { points, route, label } = toolCall.input
        onShowSegment({ points, route, label })
        addToolOutput({
          tool: 'showSegment',
          toolCallId: toolCall.toolCallId,
          output: { status: 'shown', count: points.length },
        })
      }

      if (toolCall.toolName === 'updateProjectScope') {
        const next = { ...scopeRef.current }
        for (const { key, value, unit, source } of toolCall.input.values) {
          next[key] = { value, ...(unit ? { unit } : {}), source }
        }
        commitScope(next)
        addToolOutput({
          tool: 'updateProjectScope',
          toolCallId: toolCall.toolCallId,
          output: { status: 'updated', scope: next },
        })
      }
    },
  })

  const eventChange = (e: ChatEvent) => (e.kind === 'removed' ? `Removed ${e.label}` : `Moved the pin to ${e.label}`)

  const send = (text: string) => {
    const unsent = chatEvents.filter((e) => !sentEventIds.current.has(e.id))
    // Only genuine user actions; the transport reads this and clears it after one send.
    pendingChangesRef.current = [...pendingEdits, ...unsent.map(eventChange)]
    sendMessage({ text, metadata: pendingEdits.length ? { edits: pendingEdits } : undefined })
    setPendingEdits([])
    unsent.forEach((e) => sentEventIds.current.add(e.id))
  }

  const changeQuantity = (id: string, quantity: number) => {
    const target = itemsRef.current.find((i) => i.id === id)
    if (!target) return
    // A manual edit makes the quantity the user's own.
    commitItems(itemsRef.current.map((i) => (i.id === id ? { ...i, quantity, quantitySource: 'user' } : i)))
    sourcesRef.current.set(id, 'user')
    setPendingEdits((prev) => [
      ...prev,
      `${itemLabel(target.description)}: ${formatQty(target.quantity)} → ${formatQty(quantity)} ${target.unit}`,
    ])
  }

  const rows: PricedBidItem[] = useMemo(() => {
    const ests = estimateBidItems(pin, items)
    return items.map((i, idx) => ({ ...i, estimate: ests[idx] }))
  }, [items, pin])

  const changeUnitPrice = (id: string, unitPrice: number) => {
    const target = itemsRef.current.find((i) => i.id === id)
    if (!target) return
    const prev = target.unitPrice ?? rows.find((r) => r.id === id)?.estimate?.p50 ?? null
    commitItems(itemsRef.current.map((i) => (i.id === id ? { ...i, unitPrice } : i)))
    sourcesRef.current.set(id, 'user')
    setPendingEdits((edits) => [
      ...edits,
      `${itemLabel(target.description)} price: ${prev != null ? formatUnitPrice(prev) : '—'} → ${formatUnitPrice(unitPrice)}`,
    ])
  }

  const resetUnitPrice = (id: string) => {
    const target = itemsRef.current.find((i) => i.id === id)
    if (!target || target.unitPrice == null) return
    commitItems(itemsRef.current.map((i) => (i.id === id ? { ...i, unitPrice: undefined } : i)))
    sourcesRef.current.set(id, 'user')
    setPendingEdits((edits) => [...edits, `${itemLabel(target.description)} price reset to market`])
  }

  const deleteItem = (id: string) => {
    const current = itemsRef.current
    const index = current.findIndex((i) => i.id === id)
    if (index === -1) return
    const item = current[index]
    const source = sourcesRef.current.get(id)
    commitItems(current.filter((i) => i.id !== id))
    sourcesRef.current.delete(id)
    const eventId = `del-${Date.now()}`
    setChatEvents((prev) => [...prev, { id: eventId, kind: 'removed', label: itemLabel(item.description), order: messages.length }])
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    setPendingDelete({ item, index, eventId, source })
    deleteTimer.current = setTimeout(() => setPendingDelete(null), 5000)
  }

  const undoDelete = () => {
    if (!pendingDelete) return
    const { item, index, eventId, source } = pendingDelete
    const next = [...itemsRef.current]
    next.splice(Math.min(index, next.length), 0, item)
    commitItems(next)
    if (source) sourcesRef.current.set(item.id, source)
    setChatEvents((prev) => prev.filter((e) => e.id !== eventId))
    sentEventIds.current.delete(eventId)
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
    setPendingDelete(null)
  }

  useEffect(() => () => {
    if (deleteTimer.current) clearTimeout(deleteTimer.current)
  }, [])

  const families = useMemo(() => {
    const set = new Set<ItemFamily>(items.map((i) => i.family))
    for (const m of messages)
      for (const p of m.parts) if (p.type === 'tool-searchComparables' && p.input?.itemFamily) set.add(p.input.itemFamily)
    return [...set]
  }, [items, messages])

  const similar = useMemo(() => rankSimilarProjects(pin, families), [pin, families])
  const county = nearestCounty(pin)
  const hasWork = messages.length > 0 || items.length > 0
  const defaultName = defaultDraftName(messages, pin, county.name)

  const p50Total = useMemo(() => {
    const priced = rows
      .map((r) => {
        const price = r.unitPrice ?? r.estimate?.p50 ?? null
        return price != null ? (Math.round(price * 100) / 100) * r.quantity : null
      })
      .filter((v): v is number => v != null)
    return priced.length ? priced.reduce((sum, v) => sum + v, 0) : null
  }, [rows])

  const writeDraft = (id: string, name: string, createdAt: number) => {
    saveDraft({
      id,
      name,
      pin,
      county: county.name,
      district: county.district,
      messages,
      items,
      scope,
      p50Total,
      createdAt,
      updatedAt: Date.now(),
    })
    lastSavedSig.current = signature(pin, messages, items, scope)
  }

  const createDraft = (name: string) => {
    const id = createDraftId()
    writeDraft(id, name.trim() || defaultName, Date.now())
    setDraftId(id)
    setNaming(false)
  }

  const flushDraft = () => {
    if (!draftId) return
    const existing = getDraft(draftId)
    if (!existing) return
    if (signature(pin, messages, items, scope) === lastSavedSig.current) return
    writeDraft(draftId, existing.name, existing.createdAt)
  }

  const flushRef = useRef(flushDraft)
  useEffect(() => {
    flushRef.current = flushDraft
  })

  useEffect(() => {
    if (!draftId) return
    const timer = setTimeout(() => flushRef.current(), 1000)
    return () => clearTimeout(timer)
  }, [draftId, messages, items, scope, pin])

  useEffect(() => {
    onActiveDraftChange(savedDraft ? savedDraft.id : null)
  }, [savedDraft, onActiveDraftChange])

  const requestClose = (then: () => void) => {
    if (savedDraft) {
      flushDraft()
      then()
    } else if (hasWork) {
      setNaming(false)
      setClosePrompt({ then })
    } else {
      then()
    }
  }

  const requestCloseRef = useRef(requestClose)
  useEffect(() => {
    requestCloseRef.current = requestClose
  })

  const notifyPinReplaced = (next: LatLng) => {
    const c = nearestCounty(next)
    setChatEvents((prev) => [
      ...prev,
      { id: `loc-${Date.now()}`, kind: 'location', label: `${c.name} County, ${formatDistrict(c.district)}`, order: messages.length },
    ])
  }
  const notifyPinReplacedRef = useRef(notifyPinReplaced)
  useEffect(() => {
    notifyPinReplacedRef.current = notifyPinReplaced
  })

  useImperativeHandle(
    ref,
    () => ({
      requestClose: (then) => requestCloseRef.current(then),
      notifyPinReplaced: (next) => notifyPinReplacedRef.current(next),
    }),
    [],
  )

  return (
    <aside
      aria-label="Build estimate"
      aria-hidden={!open}
      className={cn(
        'absolute inset-y-0 right-0 z-30 flex w-full flex-col overflow-hidden border-l bg-surface transition-transform duration-200 ease-out motion-reduce:transition-none lg:w-[45%] lg:min-w-[480px]',
        entered && open ? 'translate-x-0' : 'translate-x-full pointer-events-none',
      )}
    >
      <header className="relative flex shrink-0 flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="eyebrow truncate">{savedDraft ? savedDraft.name : 'Build estimate'}</p>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {`${county.name} County · ${formatDistrict(county.district)}`}
              </h2>
              <Button
                variant="outline"
                size="xs"
                onClick={onReplacePin}
                disabled={placing}
                aria-pressed={placing}
                className="gap-1"
              >
                <Crosshair aria-hidden="true" />
                {placing ? 'Placing…' : 'Replace pin'}
              </Button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {`${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`}
              {county.miles > 25 && ` · ${Math.round(county.miles)} mi from nearest data`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {savedDraft && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {`Saved · ${formatRelative(savedDraft.updatedAt, now)}`}
              </p>
            )}
            {!naming && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setClosePrompt(null)
                  if (savedDraft) flushDraft()
                  else setNaming(true)
                }}
                disabled={!savedDraft && !hasWork}
              >
                Save draft
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => requestClose(onClose)} aria-label="Close estimate">
              <X aria-hidden="true" />
            </Button>
          </div>
        </div>

        {naming && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              createDraft(new FormData(e.currentTarget).get('name') as string)
            }}
          >
            <label htmlFor="draft-name" className="sr-only">
              Draft name
            </label>
            <input
              id="draft-name"
              name="name"
              defaultValue={defaultName}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setNaming(false)
                }
              }}
              className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm text-foreground focus:border-foreground/25 focus:outline-none"
            />
            <Button type="submit" size="sm">
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </form>
        )}

        {closePrompt && (
          <div
            role="alertdialog"
            aria-labelledby="close-prompt-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                setClosePrompt(null)
              }
            }}
            className="absolute right-3 top-full z-50 mt-2 flex w-64 flex-col gap-3 rounded-lg border bg-surface p-3 shadow-[0_8px_24px_rgb(0_0_0/0.45)]"
          >
            <div className="flex flex-col gap-1">
              <p id="close-prompt-title" className="text-sm font-medium text-foreground">
                Save this draft?
              </p>
              <p className="truncate text-xs text-muted-foreground">{defaultName}</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const { then } = closePrompt
                  setClosePrompt(null)
                  then()
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                autoFocus
                onClick={() => {
                  const { then } = closePrompt
                  writeDraft(createDraftId(), defaultName, Date.now())
                  setClosePrompt(null)
                  then()
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </header>

      <SimilarProjects projects={similar} byScope={families.length > 0} onHover={onHoverContract} onOpen={onOpenContract} />

      <BuildChat
        messages={messages}
        status={status}
        error={error}
        pendingEdits={pendingEdits}
        chatEvents={chatEvents}
        onSend={send}
        onStop={stop}
        onRetry={() => regenerate()}
        onOpenContract={onOpenContract}
      />

      <BidItems
        rows={rows}
        expanded={tableExpanded}
        onToggleExpanded={() => setTableExpanded((e) => !e)}
        onQuantityChange={changeQuantity}
        onUnitPriceChange={changeUnitPrice}
        onUnitPriceReset={resetUnitPrice}
        onDeleteItem={deleteItem}
        onOpenContract={onOpenContract}
        onOpenFamily={(r) => onOpenDetail(familyDetail(r.family, r.itemCode))}
      />

      {pendingDelete && (
        <div
          role="status"
          className="absolute bottom-4 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-sm shadow-[0_8px_24px_rgb(0_0_0/0.45)]"
        >
          <span className="text-foreground">Item removed</span>
          <button type="button" onClick={undoDelete} className="font-medium text-primary hover:underline">
            Undo
          </button>
        </div>
      )}
    </aside>
  )
}
