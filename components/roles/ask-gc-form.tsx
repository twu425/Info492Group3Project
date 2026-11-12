'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { askQuestion, draftQuestion } from '@/lib/roles-actions'
import { DEFAULT_TOPIC, TOPICS, type QuestionContext, type Topic } from '@/lib/roles'
import { Button } from '@/components/ui/button'

const copy = {
  drafting: 'The assistant is drafting your question…',
  draftNote: 'Drafted by the assistant. Edit it before you send.',
  label: 'Question to the GC',
  topic: 'Topic',
  send: 'Send to GC',
  sending: 'Sending…',
  cancel: 'Cancel',
  sent: 'Sent to the GC.',
  myQuestions: 'See my questions',
}

/** Inline form under a finding: assistant draft, editable by the sub, sent only by the sub. */
export function AskGcForm({ context, onClose }: { context: QuestionContext; onClose: () => void }) {
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [topic, setTopic] = useState<Topic>(DEFAULT_TOPIC[context.findingKind])
  const [drafting, setDrafting] = useState(true)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    draftQuestion(context).then((res) => {
      if (cancelled) return
      if ('text' in res) {
        setText(res.text)
        setDraft(res.text)
        setNote(copy.draftNote)
      } else {
        setNote(res.error)
      }
      setDrafting(false)
    })
    return () => {
      cancelled = true
    }
  }, [context])

  async function send() {
    setSending(true)
    const res = await askQuestion({ context, topic, body: text, draft })
    setSending(false)
    if ('error' in res) setNote(res.error)
    else setSent(true)
  }

  if (sent) {
    return (
      <p role="status" className="mt-2 rounded-md border bg-background p-3 text-xs text-subtle-foreground">
        {copy.sent}{' '}
        <Link href="/questions" className="font-medium text-foreground underline underline-offset-4">
          {copy.myQuestions}
        </Link>
      </p>
    )
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-md border bg-background p-3">
      <label className="text-xs font-medium text-foreground" htmlFor="ask-gc-text">
        {copy.label}
      </label>
      <textarea
        id="ask-gc-text"
        value={drafting ? '' : text}
        onChange={(e) => setText(e.target.value)}
        placeholder={drafting ? copy.drafting : ''}
        disabled={drafting || sending}
        rows={5}
        className="w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground disabled:opacity-70"
      />
      {note && (
        <p role="status" className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-subtle-foreground">
          {copy.topic}
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as Topic)}
            className="h-7 rounded-md border bg-surface pl-2 text-xs capitalize text-foreground"
          >
            {TOPICS.map((t) => (
              <option key={t} value={t} className="capitalize">
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={sending}>
            {copy.cancel}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={drafting || sending || !text.trim()}>
            {sending ? copy.sending : copy.send}
          </Button>
        </div>
      </div>
    </div>
  )
}
