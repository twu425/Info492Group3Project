'use client'

import { CornerDownLeft, Search } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CATEGORY_COLORS } from '@/lib/bidgrid/format'
import { FAMILY_CATEGORY } from '@/lib/bidgrid/data'
import { SEARCH_TYPE_LABEL, search, type SearchResult, type SearchType } from '@/lib/bidgrid/search'
import { cn } from '@/lib/utils'
import type { DetailView } from './detail/detail-modal'

function resultDot(result: SearchResult): string | null {
  if (result.target.kind === 'family') return CATEGORY_COLORS[FAMILY_CATEGORY[result.target.family]]
  return null
}

function toView(result: SearchResult): DetailView {
  if (result.target.kind === 'family') {
    return {
      kind: 'family',
      family: result.target.family,
      itemCode: result.target.itemCode,
      highlightId: null,
      highlightBidder: null,
      sourceEa: null,
    }
  }
  if (result.target.kind === 'bidder') {
    return { kind: 'bidder', name: result.target.name }
  }
  return { kind: 'contract', ea: result.target.ea }
}

interface GlobalSearchProps {
  onOpenView: (view: DetailView) => void
}

export function GlobalSearch({ onOpenView }: GlobalSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const results = useMemo(() => search(query), [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.defaultPrevented) return
      e.preventDefault()
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // showModal / close in sync with state; reset query and selection each time it opens.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setQuery('')
      setActive(0)
      dialog.showModal()
      inputRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => setActive(0), [query])

  // Keep the active row scrolled into view as you arrow through results.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const select = (result: SearchResult | undefined) => {
    if (!result) return
    setOpen(false)
    onOpenView(toView(result))
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (results.length ? (i + 1) % results.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      select(results[active])
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search families, items, contracts, and bidders"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-8 w-full items-center gap-2 rounded-md border bg-surface px-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-64"
      >
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Search…</span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border bg-background px-1 font-mono text-[10px] text-muted-foreground sm:flex">
          ⌘K
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Search"
        className="command-palette fixed left-1/2 top-[12vh] m-0 w-[90vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-surface p-0 text-foreground shadow-2xl shadow-black/50"
        onCancel={(e) => {
          e.preventDefault()
          setOpen(false)
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false)
        }}
      >
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b px-3.5">
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-controls="search-results"
              aria-activedescendant={results[active] ? `search-${active}` : undefined}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Search families, items, contracts, bidders…"
              className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
            />
          </div>

          {query.trim() === '' ? (
            <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">
              Search item families, item codes, descriptions, contract EAs, project types, and bidder names.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-muted-foreground">{`No matches for "${query.trim()}".`}</p>
          ) : (
            <ul ref={listRef} id="search-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
              {results.map((result, i) => {
                const prev = results[i - 1]
                const showHeader = !prev || prev.type !== result.type
                const dot = resultDot(result)
                return (
                  <Fragment key={result.id}>
                    {showHeader && <GroupHeader type={result.type} />}
                    <li>
                      <button
                        type="button"
                        id={`search-${i}`}
                        role="option"
                        aria-selected={i === active}
                        data-active={i === active}
                        onClick={() => select(result)}
                        onPointerMove={() => setActive(i)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left',
                          i === active ? 'bg-foreground/[0.07]' : 'hover:bg-foreground/[0.04]',
                        )}
                      >
                        {dot ? (
                          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: dot }} />
                        ) : (
                          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border border-muted-foreground/60" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              'truncate text-sm text-foreground',
                              result.type === 'contract' && 'font-mono',
                            )}
                          >
                            {result.title}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{result.subtitle}</span>
                        </span>
                        {i === active && (
                          <CornerDownLeft aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </li>
                  </Fragment>
                )
              })}
            </ul>
          )}

          <div className="flex items-center gap-3 border-t px-3.5 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-background px-1 font-mono">↑</kbd>
              <kbd className="rounded border bg-background px-1 font-mono">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-background px-1 font-mono">↵</kbd>
              to open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-background px-1 font-mono">esc</kbd>
              to close
            </span>
          </div>
        </div>
      </dialog>
    </>
  )
}

function GroupHeader({ type }: { type: SearchType }) {
  return (
    <li aria-hidden="true" className="eyebrow px-2.5 pb-1 pt-2.5 first:pt-1">
      {SEARCH_TYPE_LABEL[type]}
    </li>
  )
}
