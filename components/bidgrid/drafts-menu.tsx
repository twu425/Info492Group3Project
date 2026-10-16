'use client'

import { FileStack, MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createDraftId, deleteDraft, formatRelative, saveDraft, type Draft } from '@/lib/bidgrid/drafts'
import { formatDistrict, formatUsdWhole } from '@/lib/bidgrid/format'
import { useNow } from '@/lib/bidgrid/preferences'
import { cn } from '@/lib/utils'

interface DraftsMenuProps {
  drafts: Draft[]
  activeDraftId: string | null
  onOpen: (id: string) => void
}

type RowMode = { id: string; kind: 'rename' | 'delete' } | null

export function DraftsMenu({ drafts, activeDraftId, onOpen }: DraftsMenuProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<RowMode>(null)
  const now = useNow()

  const rename = (draft: Draft, name: string) => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== draft.name) saveDraft({ ...draft, name: trimmed, updatedAt: Date.now() })
    setMode(null)
  }

  const duplicate = (draft: Draft) => {
    const t = Date.now()
    saveDraft({ ...draft, id: createDraftId(), name: `${draft.name} (copy)`, createdAt: t, updatedAt: t })
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setMode(null)
      }}
    >
      <PopoverTrigger className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        <FileStack aria-hidden="true" />
        Drafts
        {drafts.length > 0 && (
          <span className="ml-0.5 rounded-sm bg-foreground/10 px-1 font-mono text-[10px] text-foreground">{drafts.length}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">Drafts</p>
          <p className="text-xs text-muted-foreground">Stored in this browser</p>
        </div>

        {drafts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">
            No drafts yet. Drop a pin on the map, describe the work, then save it from the estimate drawer.
          </p>
        ) : (
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto p-1">
            {drafts.map((d) => {
              const rowMode = mode?.id === d.id ? mode.kind : null
              const active = d.id === activeDraftId

              if (rowMode === 'delete') {
                return (
                  <li key={d.id} role="alert" className="flex items-center gap-2 rounded-md bg-foreground/[0.04] px-2.5 py-2.5">
                    <p className="min-w-0 flex-1 truncate text-sm text-foreground">{`Delete “${d.name}”?`}</p>
                    <button
                      type="button"
                      onClick={() => setMode(null)}
                      className="rounded-md px-2 py-1 text-xs text-subtle-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      autoFocus
                      onClick={() => {
                        deleteDraft(d.id)
                        setMode(null)
                      }}
                      className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                    >
                      Delete
                    </button>
                  </li>
                )
              }

              return (
                <li key={d.id} className="group relative flex items-stretch rounded-md hover:bg-foreground/[0.04]">
                  {rowMode === 'rename' ? (
                    <form
                      className="flex min-w-0 flex-1 px-2 py-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        rename(d, new FormData(e.currentTarget).get('name') as string)
                      }}
                    >
                      <label htmlFor={`rename-${d.id}`} className="sr-only">
                        Draft name
                      </label>
                      <input
                        id={`rename-${d.id}`}
                        name="name"
                        defaultValue={d.name}
                        autoFocus
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={(e) => rename(d, e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            e.stopPropagation()
                            setMode(null)
                          }
                        }}
                        className="h-7 w-full rounded-md border bg-background px-2 text-sm text-foreground focus:border-foreground/25 focus:outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onOpen(d.id)
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {active && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />}
                          <span className="truncate text-sm font-medium text-foreground">{d.name}</span>
                          {active && <span className="sr-only">(open)</span>}
                        </span>
                        <span className="shrink-0 font-mono text-sm text-foreground">
                          {d.p50Total != null ? formatUsdWhole(d.p50Total) : '—'}
                        </span>
                      </span>
                      <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">
                          {`${d.county} County · ${formatDistrict(d.district)} · ${d.items.length} item${d.items.length === 1 ? '' : 's'}`}
                        </span>
                        <span className="shrink-0">{formatRelative(d.updatedAt, now)}</span>
                      </span>
                    </button>
                  )}

                  {rowMode !== 'rename' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${d.name}`}
                        className="my-2 mr-1 flex size-7 shrink-0 items-center justify-center self-start rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                      >
                        <MoreHorizontal aria-hidden="true" className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => setMode({ id: d.id, kind: 'rename' })}>Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(d)}>Duplicate</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setMode({ id: d.id, kind: 'delete' })}
                          className={cn('text-primary focus:text-primary')}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
