'use client'

import { ArrowUp, ChevronRight, MapPin, Square, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChatStatus } from 'ai'
import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import { OPENING_MESSAGE } from '@/lib/bidgrid/system-prompt'
import { cn } from '@/lib/utils'
import { ChatMarkdown } from './chat-markdown'
import { ToolChip } from './tool-chip'

const EXAMPLES = ['Sidewalk and curb ramps, half mile', 'Bridge deck widening', 'Median barrier replacement, 2,000 LF']

export interface ChatEvent {
  id: string
  kind: 'location' | 'removed'
  label: string
  order: number
}

interface BuildChatProps {
  messages: BuildUIMessage[]
  status: ChatStatus
  error: Error | undefined
  pendingEdits: string[]
  chatEvents: ChatEvent[]
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onOpenContract: (ea: string) => void
}

function EventChip({ event }: { event: ChatEvent }) {
  const removed = event.kind === 'removed'
  const Icon = removed ? Trash2 : MapPin
  return (
    <div className="flex items-center gap-1.5 self-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
      <Icon aria-hidden="true" className="size-3 text-primary" />
      <span>
        {removed ? 'Removed · ' : 'Location changed · '}
        <span className="text-foreground">{event.label}</span>
      </span>
    </div>
  )
}

function EditNotes({ edits }: { edits: string[] }) {
  return (
    <ul className="flex flex-col items-end gap-1">
      {edits.map((e, i) => (
        <li key={i} className="rounded-sm bg-foreground/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {`Edited · ${e}`}
        </li>
      ))}
    </ul>
  )
}

type ToolPart = Extract<BuildUIMessage['parts'][number], { type: `tool-${string}` }>

const isToolPart = (p: BuildUIMessage['parts'][number]): p is ToolPart => p.type.startsWith('tool-')

// Short present-tense verb shown while a step is still running.
const TOOL_ACTION: Record<string, string> = {
  'tool-searchSimilarProjects': 'Finding similar projects',
  'tool-searchCatalog': 'Searching the catalog',
  'tool-searchComparables': 'Pricing items',
  'tool-addLineItem': 'Adding items',
  'tool-updateLineItem': 'Updating items',
  'tool-removeLineItem': 'Removing items',
  'tool-updateProjectScope': 'Noting details',
  'tool-queryBids': 'Querying the data',
  'tool-locatePostmiles': 'Locating postmiles',
  'tool-showSegment': 'Drawing the segment',
  'tool-computeQuantity': 'Calculating quantities',
  'tool-checkEstimate': 'Reviewing the estimate',
  'tool-searchBidders': 'Finding bidders',
}

/** One collapsible summary for a run of tool calls, so a build doesn't stack 15 chips. */
function ToolActivity({ parts }: { parts: ToolPart[] }) {
  const [open, setOpen] = useState(false)
  if (parts.length === 1) return <ToolChip part={parts[0]} />

  const pending = parts.filter((p) => p.state === 'input-streaming' || p.state === 'input-available')
  const busy = pending.length > 0
  const added = parts.filter(
    (p) => p.type === 'tool-addLineItem' && p.state === 'output-available' && !!p.output && !('error' in p.output) && p.output.status === 'added',
  ).length

  // While working, name the current step; once done, recap it in one line.
  const summary = busy
    ? TOOL_ACTION[pending[pending.length - 1].type] ?? 'Working'
    : added > 0
      ? `${added} item${added === 1 ? '' : 's'} added · ${parts.length} steps`
      : `${parts.length} steps`

  return (
    <div className="flex w-full flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1.5 self-start rounded-sm bg-foreground/[0.05] px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {busy ? (
          <span aria-hidden="true" className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
        ) : (
          <ChevronRight aria-hidden="true" className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
        )}
        <span className="truncate">{open ? 'Hide steps' : summary}</span>
      </button>
      {open && (
        <div className="flex flex-col items-start gap-1.5 border-l border-foreground/10 pl-2.5">
          {parts.map((p, i) => (
            <ToolChip key={i} part={p} />
          ))}
        </div>
      )}
    </div>
  )
}

export function BuildChat({
  messages,
  status,
  error,
  pendingEdits,
  chatEvents,
  onSend,
  onStop,
  onRetry,
  onOpenContract,
}: BuildChatProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, status, pendingEdits.length, chatEvents.length])

  // A manual-change chip sits before the message that followed it (or at the end).
  const chipsBefore = (index: number) =>
    chatEvents.filter((e) => Math.min(e.order, messages.length) === index)

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    onSend(trimmed)
    setInput('')
  }

  // Keep a "working" indicator up for the whole turn — not just before the first assistant
  // part — so the gap while tools run (searching, querying) isn't dead air. It steps aside
  // only while the assistant is actively streaming visible text, which is its own feedback.
  const last = messages.at(-1)
  const lastPart = last?.role === 'assistant' ? last.parts.at(-1) : undefined
  const streamingText =
    status === 'streaming' && lastPart?.type === 'text' && (lastPart.text?.trim().length ?? 0) > 0
  const showThinking = busy && !streamingText

  return (
    <section aria-label="Estimate chat" className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" aria-live="polite">
        <p className="max-w-[90%] text-sm leading-relaxed text-foreground">{OPENING_MESSAGE}</p>

        {messages.map((m, mi) => (
          <Fragment key={m.id}>
            {chipsBefore(mi).map((e) => (
              <EventChip key={e.id} event={e} />
            ))}
            {m.role === 'user' ? (
            <div className="flex flex-col items-end gap-1.5">
              {m.metadata?.edits && m.metadata.edits.length > 0 && <EditNotes edits={m.metadata.edits} />}
              {m.parts.map((p, i) =>
                p.type === 'text' ? (
                  <p
                    key={i}
                    className="max-w-[85%] whitespace-pre-wrap rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed text-foreground"
                  >
                    {p.text}
                  </p>
                ) : null,
              )}
            </div>
          ) : (
            <div className="flex max-w-[92%] flex-col items-start gap-1.5">
              {(() => {
                // Group consecutive tool calls so a multi-step turn collapses to one line,
                // while assistant text between steps still renders in place.
                const blocks: ReactNode[] = []
                let run: ToolPart[] = []
                const flush = (key: string) => {
                  if (run.length) blocks.push(<ToolActivity key={`tools-${key}`} parts={run} />)
                  run = []
                }
                m.parts.forEach((p, i) => {
                  if (isToolPart(p)) {
                    run.push(p)
                  } else if (p.type === 'text') {
                    flush(String(i))
                    if (p.text.trim()) blocks.push(<ChatMarkdown key={i} text={p.text} onOpenContract={onOpenContract} />)
                  }
                })
                flush('end')
                return blocks
              })()}
            </div>
            )}
          </Fragment>
        ))}

        {chipsBefore(messages.length).map((e) => (
          <EventChip key={e.id} event={e} />
        ))}

        {showThinking && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-primary" />
            Working…
          </p>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs text-subtle-foreground">
            <span className="min-w-0 flex-1 text-pretty">{error.message || 'Something went wrong reaching the assistant.'}</span>
            <button type="button" onClick={onRetry} className="font-medium text-primary hover:underline">
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2 px-4 pb-3">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => submit(ex)}
                className="rounded-md border bg-background px-2.5 py-1 text-xs text-subtle-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        {pendingEdits.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {`${pendingEdits.length} table edit${pendingEdits.length === 1 ? '' : 's'} will be shared with your next message.`}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
          className="flex items-end gap-2 rounded-lg border bg-background p-1.5 focus-within:border-foreground/25"
        >
          <label htmlFor="build-input" className="sr-only">
            Describe the work
          </label>
          <textarea
            id="build-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                submit(input)
              }
            }}
            placeholder="Describe the work…"
            className="field-sizing-content max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              className="flex size-8 shrink-0 items-center justify-center rounded-md border text-foreground hover:bg-foreground/[0.06]"
            >
              <Square aria-hidden="true" className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!input.trim()}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90',
                'disabled:opacity-40',
              )}
            >
              <ArrowUp aria-hidden="true" className="size-4" />
            </button>
          )}
        </form>
      </div>
    </section>
  )
}
