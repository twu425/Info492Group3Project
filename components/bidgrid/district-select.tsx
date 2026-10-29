'use client'

import { DISTRICT_NAMES, DISTRICTS } from '@/lib/bidgrid/data'
import type { DistrictFilter } from '@/lib/bidgrid/family'
import { cn } from '@/lib/utils'

/**
 * Compact district dropdown. Replaces the segmented button row, which overflowed
 * once the dataset grew to all 12 Caltrans districts. A plain native <select>
 * (matching the app's Item selector) so it uses the single native arrow — no
 * custom chevron, which previously doubled up with the native one.
 */
export function DistrictSelect({
  value,
  onChange,
  className,
  'aria-label': ariaLabel = 'District',
}: {
  value: DistrictFilter
  onChange: (value: DistrictFilter) => void
  className?: string
  'aria-label'?: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      className={cn(
        'h-9 rounded-md border bg-surface px-2.5 text-sm text-foreground',
        className,
      )}
      value={value === 'all' ? 'all' : String(value)}
      onChange={(e) => onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
    >
      <option value="all">All districts</option>
      {DISTRICTS.map((d) => (
        <option key={d} value={d}>
          {`D${String(d).padStart(2, '0')} — ${DISTRICT_NAMES[d]}`}
        </option>
      ))}
    </select>
  )
}
