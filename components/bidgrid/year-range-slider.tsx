'use client'

import { MAX_YEAR, MIN_YEAR } from '@/lib/bidgrid/data'

interface YearRangeSliderProps {
  value: [number, number]
  onChange: (v: [number, number]) => void
}

export function YearRangeSlider({ value, onChange }: YearRangeSliderProps) {
  const [from, to] = value
  const span = MAX_YEAR - MIN_YEAR
  const left = ((from - MIN_YEAR) / span) * 100
  const right = ((to - MIN_YEAR) / span) * 100

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between font-mono text-sm text-foreground">
        <span>{from}</span>
        <span className="text-muted-foreground">{'–'}</span>
        <span>{to}</span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" aria-hidden="true" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${left}%`, width: `${right - left}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          className="range-dual"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          value={from}
          aria-label="Start bid year"
          onChange={(e) => onChange([Math.min(Number(e.target.value), to), to])}
        />
        <input
          type="range"
          className="range-dual"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step={1}
          value={to}
          aria-label="End bid year"
          onChange={(e) => onChange([from, Math.max(Number(e.target.value), from)])}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-muted-foreground" aria-hidden="true">
        <span>{MIN_YEAR}</span>
        <span>{MAX_YEAR}</span>
      </div>
    </div>
  )
}
