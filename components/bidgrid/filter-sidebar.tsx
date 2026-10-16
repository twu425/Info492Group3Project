'use client'

import { ListFilter, PanelLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DISTRICT_NAMES,
  DISTRICTS,
  ITEM_FAMILIES,
  MAX_YEAR,
  MIN_YEAR,
  type District,
  type ItemFamily,
} from '@/lib/bidgrid/data'
import { FamilyFilter } from './family-filter'
import { YearRangeSlider } from './year-range-slider'

export interface Filters {
  families: Set<ItemFamily>
  districts: Set<District>
  yearRange: [number, number]
}

export function countActiveFilters(f: Filters) {
  let n = 0
  if (f.families.size !== ITEM_FAMILIES.length) n++
  if (f.districts.size !== DISTRICTS.length) n++
  if (f.yearRange[0] !== MIN_YEAR || f.yearRange[1] !== MAX_YEAR) n++
  return n
}

interface FilterSidebarProps {
  filters: Filters
  onChange: (f: Filters) => void
  visibleCount: number
  totalCount: number
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
  draftPinsVisible: boolean
  onToggleDraftPins: () => void
  draftCount: number
}

const DISTRICT_LABEL = DISTRICT_NAMES

type DistrictOption = { id: string; label: string; districts: District[] }
const DISTRICT_OPTIONS: DistrictOption[] = [
  { id: 'all', label: 'All', districts: [...DISTRICTS] },
  ...DISTRICTS.map((d) => ({ id: String(d), label: String(d).padStart(2, '0'), districts: [d] })),
]

function matchesOption(selected: Set<District>, option: DistrictOption) {
  return selected.size === option.districts.length && option.districts.every((d) => selected.has(d))
}

export function FilterSidebar({
  filters,
  onChange,
  visibleCount,
  totalCount,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
  draftPinsVisible,
  onToggleDraftPins,
  draftCount,
}: FilterSidebarProps) {
  const activeDistricts = DISTRICTS.filter((d) => filters.districts.has(d))
  const activeCount = countActiveFilters(filters)

  return (
    <>
      {/* Collapsed rail (desktop): always present behind the sliding content panel. */}
      <div
        inert={!collapsed}
        aria-hidden={!collapsed}
        className="absolute inset-y-0 left-0 z-20 hidden w-12 flex-col items-center gap-1 border-r bg-background py-3 md:flex"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapsed}
          aria-label="Expand filters"
          aria-keyshortcuts="["
          title="Expand filters  ["
        >
          <PanelLeft aria-hidden="true" />
        </Button>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
          className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
        >
          <ListFilter aria-hidden="true" className="size-3.5" />
          {activeCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-semibold text-primary-foreground"
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter panel: slides in/out with a transform so the map never reflows. */}
      <aside
        id="filter-sidebar"
        aria-label="Filters"
        className={cn(
          'absolute inset-y-0 left-0 z-20 flex w-[280px] flex-col overflow-hidden border-r bg-surface transition-transform duration-200 ease-out motion-reduce:transition-none md:bg-background',
          open ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:-translate-x-full' : 'md:translate-x-0',
        )}
      >
        <div className="flex h-full w-[280px] shrink-0 flex-col gap-7 overflow-y-auto overflow-x-hidden p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Filters</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            onClick={onToggleCollapsed}
            aria-label="Collapse filters"
            aria-keyshortcuts="["
            title="Collapse filters  ["
          >
            <PanelLeft aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onClose} aria-label="Close filters">
            <X aria-hidden="true" />
          </Button>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="eyebrow mb-2.5">District</legend>
          <div className="segmented" role="group" aria-label="District">
            {DISTRICT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={matchesOption(filters.districts, opt)}
                aria-label={opt.id === 'all' ? 'All districts' : `District ${opt.id}, ${DISTRICT_LABEL[opt.districts[0]]}`}
                onClick={() => onChange({ ...filters, districts: new Set(opt.districts) })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {activeDistricts.map((d) => DISTRICT_LABEL[d]).join(' + ') || 'No district selected'}
          </p>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="eyebrow mb-2.5">Bid year</legend>
          <YearRangeSlider value={filters.yearRange} onChange={(yearRange) => onChange({ ...filters, yearRange })} />
        </fieldset>

        <FamilyFilter
          selected={filters.families}
          districts={filters.districts}
          yearRange={filters.yearRange}
          onChange={(families) => onChange({ ...filters, families })}
        />

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className="eyebrow mb-2.5">Map layers</legend>
          <button
            type="button"
            role="switch"
            aria-checked={draftPinsVisible}
            onClick={onToggleDraftPins}
            className="flex h-8 items-center gap-2.5 rounded-md border px-2.5 text-sm text-foreground transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <span aria-hidden="true" className="draft-pin-swatch" />
            <span className="flex-1 text-left">Draft pins</span>
            <span className="font-mono text-xs text-muted-foreground">{draftCount}</span>
            <span
              aria-hidden="true"
              className={cn(
                'relative h-4 w-7 shrink-0 rounded-full transition-colors',
                draftPinsVisible ? 'bg-primary' : 'bg-foreground/15',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-3 rounded-full bg-foreground transition-[left]',
                  draftPinsVisible ? 'left-3.5' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </fieldset>

        <div className="mt-auto flex flex-col gap-1 rounded-lg border bg-surface p-3">
          <p className="eyebrow">Contracts shown</p>
          <p className="font-mono text-xl font-medium text-foreground">
            {visibleCount}
            <span className="text-sm text-muted-foreground">{` / ${totalCount}`}</span>
          </p>
          {visibleCount === 0 && <p className="text-xs text-primary">No matches. Try widening your filters.</p>}
        </div>
        </div>
      </aside>
    </>
  )
}
