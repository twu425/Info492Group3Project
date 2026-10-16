'use client'

import { ArrowUp, MapPin, Square, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import type { ChatStatus } from 'ai'
import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import { OPENING_MESSAGE } from '@/lib/bidgrid/system-prompt'
import { cn } from '@/lib/utils'
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

export function BuildChat({
  messages,
  status,
  error,
  pendingEdits,
  chatEvents,
  onSend,
  onStop,
  onRetry,
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

  const last = messages.at(-1)
  const showThinking = status === 'submitted' || (status === 'streaming' && last?.role !== 'assistant')

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
              {m.parts.map((p, i) => {
                if (p.type === 'text') {
                  return p.text.trim() ? (
                    <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {p.text}
                    </p>
                  ) : null
                }
                if (p.type.startsWith('tool-')) return <ToolChip key={i} part={p} />
                return null
              })}
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
            Thinking
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
