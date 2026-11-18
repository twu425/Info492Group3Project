'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { replyClarification } from '@/lib/roles-actions'

const copy = {
  label: 'Your reply to the subcontractor',
  send: 'Send reply',
  sending: 'Sending…',
  note: 'Once you reply, the request goes back to the subcontractor to quote.',
}

/** The estimator answers the sub's question; the request returns to the sub. */
export function ReplyForm({ requestId }: { requestId: string }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setBusy(true)
    setError(null)
    const res = await replyClarification({ requestId, body: text })
    setBusy(false)
    if ('error' in res) return setError(res.error)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <label htmlFor={`reply-${requestId}`} className="text-xs font-medium">
        {copy.label}
      </label>
      <textarea
        id={`reply-${requestId}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full resize-y rounded-md border bg-surface px-2.5 py-2 text-sm leading-relaxed"
      />
      <p role="status" className="text-xs text-muted-foreground">
        {error ?? copy.note}
      </p>
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={send} disabled={busy || !text.trim()}>
          {busy ? copy.sending : copy.send}
        </Button>
      </div>
    </div>
  )
}
