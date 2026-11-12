'use client'

import { useMemo, useState } from 'react'
import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import { catalogByCode } from '@/lib/bidgrid/catalog'
import type { Finding } from '@/lib/bidgrid/check-estimate'
import { itemLabel } from '@/lib/bidgrid/format'
import { ASKABLE_KINDS, plainWords, type AskableKind, type Evidence, type QuestionContext } from '@/lib/roles'
import { AskGcForm } from './ask-gc-form'
import { useRole } from './use-role'

const isAskable = (kind: Finding['kind']): kind is AskableKind => (ASKABLE_KINDS as readonly string[]).includes(kind)

/** The latest finished check in a message, or null. */
export function finishedCheck(message: BuildUIMessage): Finding[] | null {
  let findings: Finding[] | null = null
  for (const p of message.parts) {
    if (p.type === 'tool-checkEstimate' && p.state === 'output-available' && p.output && 'findings' in p.output) {
      findings = p.output.findings as Finding[]
    }
  }
  return findings && findings.length ? findings : null
}

/** Past-bid evidence per item, from the "Pricing items" results already in the conversation. */
function evidenceByItem(messages: BuildUIMessage[]): Map<string, Evidence> {
  const map = new Map<string, Evidence>()
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type !== 'tool-searchComparables' || p.state !== 'output-available' || !p.output || 'error' in p.output) continue
      const o = p.output
      map.set(o.itemCode, {
        low: o.p25,
        typical: o.p50,
        high: o.p75,
        pastBids: o.comparableCount,
        contracts: [...new Set(o.comparables.map((c) => c.ea))].slice(0, 3),
      })
    }
  }
  return map
}

/** Lists a check's findings under its chip. Subs get "Ask the GC" on scope-type findings. */
export function CheckFindings({ findings, messages }: { findings: Finding[]; messages: BuildUIMessage[] }) {
  const role = useRole()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const evidence = useMemo(() => evidenceByItem(messages), [messages])

  // One stable context object per finding, so the form drafts once per open.
  const contexts = useMemo(
    () =>
      findings.map((f): QuestionContext | null => {
        if (!isAskable(f.kind)) return null
        const item = f.itemCode ? catalogByCode.get(f.itemCode) : undefined
        return {
          findingKind: f.kind,
          findingMessage: plainWords(f.message),
          itemCode: f.itemCode,
          itemDescription: item ? itemLabel(item.description) : undefined,
          evidence: f.itemCode ? (evidence.get(f.itemCode) ?? null) : null,
        }
      }),
    [findings, evidence],
  )

  return (
    <ul className="flex w-full flex-col gap-1.5 border-l border-foreground/10 pl-2.5">
      {findings.map((f, i) => (
        <li key={i} className="text-xs leading-relaxed text-subtle-foreground">
          <div className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className={f.severity === 'warning' ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-up' : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground'}
            />
            <span className="min-w-0 flex-1">{plainWords(f.message)}</span>
            {role === 'sub' && contexts[i] && openIndex !== i && (
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className="shrink-0 rounded-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Ask the GC
              </button>
            )}
          </div>
          {openIndex === i && contexts[i] && <AskGcForm context={contexts[i]!} onClose={() => setOpenIndex(null)} />}
        </li>
      ))}
    </ul>
  )
}
