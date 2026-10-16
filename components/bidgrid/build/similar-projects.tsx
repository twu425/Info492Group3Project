'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { SimilarProject } from '@/lib/bidgrid/estimate'
import { formatUsdCompact } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'

interface SimilarProjectsProps {
  projects: SimilarProject[]
  byScope: boolean
  onHover: (ea: string | null) => void
  onOpen: (ea: string) => void
}

export function SimilarProjects({ projects, byScope, onHover, onOpen }: SimilarProjectsProps) {
  const [open, setOpen] = useState(true)

  return (
    <section aria-labelledby="similar-heading" className="shrink-0 border-b">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="similar-list"
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-foreground/[0.03]"
      >
        <span className="flex items-baseline gap-2">
          <span id="similar-heading" className="eyebrow">
            Similar projects
          </span>
          <span className="text-xs text-muted-foreground">
            {byScope ? 'Ranked by distance, recency, and scope' : 'Ranked by distance'}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 text-muted-foreground transition-transform', !open && '-rotate-90')}
        />
      </button>

      {open && (
        <ul id="similar-list" className="flex gap-2 overflow-x-auto px-4 pb-3" onMouseLeave={() => onHover(null)}>
          {projects.map((p) => (
            <li key={p.contract.ea} className="shrink-0">
              <button
                type="button"
                onClick={() => onOpen(p.contract.ea)}
                onMouseEnter={() => onHover(p.contract.ea)}
                onFocus={() => onHover(p.contract.ea)}
                onBlur={() => onHover(null)}
                className="flex w-52 flex-col gap-1.5 rounded-md border bg-background p-2.5 text-left transition-colors hover:border-foreground/25"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-medium text-foreground">{p.contract.ea}</span>
                  <span className="rounded-sm bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-subtle-foreground">
                    {`${Math.round(p.score * 100)}%`}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {`${p.miles < 10 ? p.miles.toFixed(1) : Math.round(p.miles)} mi · ${p.contract.bidOpenDate}`}
                </span>
                <span className="truncate text-xs text-subtle-foreground" title={p.contract.typeOfWork}>
                  {p.contract.typeOfWork}
                </span>
                <span className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
                  {byScope ? 'Matching items' : 'Low bid'}
                  <span className="font-mono text-xs text-foreground">{formatUsdCompact(p.matchTotal)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
