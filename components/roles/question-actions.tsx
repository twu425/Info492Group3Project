'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { answerQuestion, draftAnswer, forwardToDesigner } from '@/lib/roles-actions'
import type { Topic } from '@/lib/roles'

const copy = {
  answer: 'Answer',
  forward: 'Forward to designer',
  forwardHint: 'This looks like a design question. Consider forwarding it to the designer.',
  answerLabel: 'Your answer',
  noteLabel: 'Note for the designer (optional)',
  draft: 'Draft with assistant',
  drafting: 'Drafting…',
  draftNote: 'Drafted by the assistant. Check and edit it before you send.',
  sendAnswer: 'Send answer',
  sendForward: 'Forward',
  cancel: 'Cancel',
}

const DESIGN_TOPICS: Topic[] = ['scope', 'quantity', 'spec']

/** Buttons and forms for the person whose turn it is. Only a person sends; the assistant only drafts. */
export function QuestionActions({ questionId, role, topic }: { questionId: string; role: 'gc' | 'designer'; topic: Topic }) {
  const router = useRouter()
  const [mode, setMode] = useState<'answer' | 'forward' | null>(null)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'draft' | 'send' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const open = (m: 'answer' | 'forward') => {
    setMode(m)
    setText('')
    setDraft(null)
    setMessage(null)
  }

  async function getDraft() {
    setBusy('draft')
    setMessage(null)
    const res = await draftAnswer(questionId)
    if ('text' in res) {
      setText(res.text)
      setDraft(res.text)
      setMessage(copy.draftNote)
    } else {
      setMessage(res.error)
    }
    setBusy(null)
  }

  async function send() {
    setBusy('send')
    setMessage(null)
    const res =
      mode === 'forward'
        ? await forwardToDesigner({ questionId, note: text })
        : await answerQuestion({ questionId, body: text, draft })
    setBusy(null)
    if ('error' in res) {
      setMessage(res.error)
      return
    }
    setMode(null)
    router.refresh()
  }

  if (!mode) {
    return (
      <div className="flex flex-col gap-2">
        {role === 'gc' && DESIGN_TOPICS.includes(topic) && <p className="text-xs text-subtle-foreground">{copy.forwardHint}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => open('answer')}>
            {copy.answer}
          </Button>
          {role === 'gc' && (
            <Button type="button" size="sm" variant="outline" onClick={() => open('forward')}>
              {copy.forward}
            </Button>
          )}
        </div>
      </div>
    )
  }

  const id = `${mode}-${questionId}`
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <label htmlFor={id} className="text-xs font-medium">
        {mode === 'answer' ? copy.answerLabel : copy.noteLabel}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={busy === 'draft'}
        placeholder={busy === 'draft' ? copy.drafting : ''}
        className="w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm leading-relaxed placeholder:text-muted-foreground disabled:opacity-70"
      />
      {message && (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mode === 'answer' && (
          <Button type="button" size="sm" variant="outline" onClick={getDraft} disabled={busy !== null}>
            {busy === 'draft' ? copy.drafting : copy.draft}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)} disabled={busy === 'send'}>
            {copy.cancel}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={busy !== null || (mode === 'answer' && !text.trim())}>
            {mode === 'answer' ? copy.sendAnswer : copy.sendForward}
          </Button>
        </div>
      </div>
    </div>
  )
}
