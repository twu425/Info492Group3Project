'use client'

import { Check, ChevronRight, Minus, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  CATEGORIES,
  CATEGORY_FAMILIES,
  CONTRACTS,
  ITEM_FAMILIES,
  type Category,
  type District,
  type ItemFamily,
} from '@/lib/bidgrid/data'
import { CATEGORY_COLORS } from '@/lib/bidgrid/format'

interface FamilyFilterProps {
  selected: Set<ItemFamily>
  districts: Set<District>
  yearRange: [number, number]
  onChange: (families: Set<ItemFamily>) => void
}

type CheckState = 'on' | 'off' | 'mixed'

function CheckBox({ state, color }: { state: CheckState; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors"
      style={{ borderColor: color, background: state === 'off' ? 'transparent' : color }}
    >
      {state === 'on' && <Check className="size-2.5 text-background" strokeWidth={3.5} />}
      {state === 'mixed' && <Minus className="size-2.5 text-background" strokeWidth={3.5} />}
    </span>
  )
}

export function FamilyFilter({ selected, districts, yearRange, onChange }: FamilyFilterProps) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<Category>>(() => new Set())

  const counts = useMemo(() => {
    const map = new Map<ItemFamily, number>()
    for (const c of CONTRACTS) {
      const year = Number(c.bidOpenDate.slice(0, 4))
      if (!districts.has(c.district) || year < yearRange[0] || year > yearRange[1]) continue
      c.families.forEach((f) => map.set(f, (map.get(f) ?? 0) + 1))
    }
    return map
  }, [districts, yearRange])

  const q = query.trim().toLowerCase()
  const groups = CATEGORIES.map((category) => {
    const categoryMatch = category.toLowerCase().includes(q)
    const families = CATEGORY_FAMILIES[category].filter((f) => !q || categoryMatch || f.toLowerCase().includes(q))
    return { category, families }
  }).filter((g) => g.families.length > 0)

  const setMany = (families: ItemFamily[], on: boolean) => {
    const next = new Set(selected)
    families.forEach((f) => (on ? next.add(f) : next.delete(f)))
    onChange(next)
  }

  const toggleExpanded = (c: Category) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  return (
    <fieldset className="flex min-w-0 flex-col gap-2.5">
      <div className="mb-2.5 flex items-center justify-between">
        <legend className="eyebrow">Item family</legend>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onChange(new Set(ITEM_FAMILIES))}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            All
          </button>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            None
          </button>
        </div>
      </div>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter families"
          aria-label="Filter item families"
          className="h-8 w-full rounded-md border bg-surface pl-8 pr-7 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear family filter"
            className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>

      <ul className="flex flex-col">
        {groups.map(({ category, families }) => {
          const all = CATEGORY_FAMILIES[category]
          const onCount = all.filter((f) => selected.has(f)).length
          const state: CheckState = onCount === 0 ? 'off' : onCount === all.length ? 'on' : 'mixed'
          const isOpen = q.length > 0 || expanded.has(category)
          const color = CATEGORY_COLORS[category]
          const listId = `family-list-${category.replace(/\W+/g, '-')}`

          return (
            <li key={category} className="flex flex-col">
              <div className="flex h-8 items-center gap-1 rounded-md hover:bg-foreground/[0.04]">
                <button
                  type="button"
                  onClick={() => toggleExpanded(category)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${category}`}
                  disabled={q.length > 0}
                  className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')}
                  />
                </button>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={state === 'mixed' ? 'mixed' : state === 'on'}
                  onClick={() => setMany(all, state !== 'on')}
                  className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md pr-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <CheckBox state={state} color={color} />
                  <span
                    title={category}
                    className={cn('min-w-0 flex-1 truncate', state === 'off' ? 'text-muted-foreground' : 'text-foreground')}
                  >
                    {category}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{`${onCount}/${all.length}`}</span>
                </button>
              </div>

              {isOpen && (
                <ul id={listId} className="mb-1 ml-3 flex flex-col border-l pl-2">
                  {families.map((family) => {
                    const checked = selected.has(family)
                    const count = counts.get(family) ?? 0
                    return (
                      <li key={family}>
                        <label
                          className={cn(
                            'flex h-7 min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-foreground/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60',
                            checked ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() => setMany([family], !checked)}
                          />
                          <CheckBox state={checked ? 'on' : 'off'} color={color} />
                          <span title={family} className="min-w-0 flex-1 truncate">
                            {family}
                          </span>
                          <span
                            className="shrink-0 font-mono text-xs text-muted-foreground"
                            aria-label={`${count} matching contracts`}
                          >
                            {count}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
        {groups.length === 0 && (
          <li className="px-2 py-3 text-xs text-muted-foreground">{`No families match "${query}".`}</li>
        )}
      </ul>
    </fieldset>
  )
}
