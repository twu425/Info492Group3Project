'use client'

import type { BuildUIMessage } from '@/lib/bidgrid/build-tools'
import type { Finding } from '@/lib/bidgrid/check-estimate'
import { plainWords, QUOTABLE_KINDS } from '@/lib/roles'
import { askForQuote } from './quote-events'
import { useRole } from './use-role'

const copy = {
  requestQuote: 'Request a quote',
}

const isQuotable = (kind: Finding['kind']) => (QUOTABLE_KINDS as readonly string[]).includes(kind)

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

/**
 * Lists a check's findings under its chip. When an item has few or no past bids, the estimator
 * gets "Request a quote", which opens the request form above the bid table with that item picked.
 */
export function CheckFindings({ findings }: { findings: Finding[]; messages?: BuildUIMessage[] }) {
  const role = useRole()
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
            {role === 'estimator' && f.itemCode && isQuotable(f.kind) && (
              <button
                type="button"
                onClick={() => askForQuote(f.itemCode!)}
                className="shrink-0 rounded-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {copy.requestQuote}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
