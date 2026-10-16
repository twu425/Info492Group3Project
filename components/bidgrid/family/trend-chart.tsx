'use client'

import { useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, XAxis, YAxis } from 'recharts'
import type { PricePoint, QuarterStat } from '@/lib/bidgrid/family'
import { formatDistrict, formatQty, formatUsd, formatUsdCompact } from '@/lib/bidgrid/format'

interface TrendChartProps {
  points: PricePoint[]
  quarters: QuarterStat[]
  domain: [number, number]
  color: string
  highlightId?: string | null
  highlightBidder?: string | null
  onOpenContract: (ea: string) => void
}

interface Hovered {
  point: PricePoint
  x: number
  y: number
}

const TICK = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--muted-foreground)' }

export function TrendChart({
  points,
  quarters,
  domain,
  color,
  highlightId,
  highlightBidder,
  onOpenContract,
}: TrendChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<Hovered | null>(null)
  const highlighted = useMemo(
    () => points.filter((p) => p.id === highlightId || (highlightBidder != null && p.bidder === highlightBidder)),
    [points, highlightId, highlightBidder],
  )

  const yearTicks = useMemo(() => {
    const ticks: number[] = []
    for (let y = new Date(domain[0]).getUTCFullYear(); ; y++) {
      const t = Date.UTC(y, 0, 1)
      if (t > domain[1]) break
      if (t >= domain[0]) ticks.push(t)
    }
    return ticks
  }, [domain])

  const yDomain = useMemo<[number, number]>(() => {
    const prices = points.map((p) => p.unitPrice)
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const pad = (hi - lo) * 0.08 || hi * 0.1
    return [Math.max(0, lo - pad), hi + pad]
  }, [points])

  const renderDot = (props: unknown) => {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: PricePoint }
    if (cx === undefined || cy === undefined || !payload) return <g />
    const active = hovered?.point.id === payload.id
    return (
      <g
        data-morph-host=""
        className="cursor-pointer"
        onMouseEnter={() => setHovered({ point: payload, x: cx, y: cy })}
        onMouseLeave={() => setHovered((h) => (h?.point.id === payload.id ? null : h))}
        onClick={() => onOpenContract(payload.ea)}
      >
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle
          cx={cx}
          cy={cy}
          r={active ? 4 : 2.5}
          fill={color}
          fillOpacity={active ? 1 : 0.32}
          stroke={active ? 'var(--background)' : 'none'}
          strokeWidth={1.5}
        />
      </g>
    )
  }

  const renderHighlight = (props: unknown) => {
    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: PricePoint }
    if (cx === undefined || cy === undefined || !payload) return <g />
    return (
      <g
        data-morph-host=""
        className="cursor-pointer"
        onMouseEnter={() => setHovered({ point: payload, x: cx, y: cy })}
        onMouseLeave={() => setHovered((h) => (h?.point.id === payload.id ? null : h))}
        onClick={() => onOpenContract(payload.ea)}
      >
        <circle cx={cx} cy={cy} r={4} fill={color} />
        <circle cx={cx} cy={cy} r={7.5} fill="none" stroke="var(--primary)" strokeWidth={2} />
      </g>
    )
  }

  const flip = hovered ? hovered.x > (wrapperRef.current?.clientWidth ?? 0) / 2 : false

  return (
    <div ref={wrapperRef} data-morph-scope="" className="trend-chart relative size-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis
            type="number"
            dataKey="time"
            domain={domain}
            ticks={yearTicks}
            tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
            axisLine={false}
            tickLine={false}
            tick={TICK}
            tickMargin={8}
            allowDataOverflow
          />
          <YAxis
            type="number"
            domain={yDomain}
            tickFormatter={(v: number) => formatUsdCompact(v)}
            axisLine={false}
            tickLine={false}
            tick={TICK}
            width={56}
            tickCount={5}
          />
          <Area
            data={quarters}
            dataKey="band"
            type="monotone"
            fill={color}
            fillOpacity={0.12}
            stroke="none"
            isAnimationActive={false}
          />
          <Scatter data={points} dataKey="unitPrice" shape={renderDot} isAnimationActive={false} />
          <Line
            data={quarters}
            dataKey="avg"
            type="monotone"
            stroke={color}
            strokeWidth={1.5}
            dot={{ r: 1.75, fill: color, strokeWidth: 0 }}
            activeDot={false}
            isAnimationActive={false}
          />
          {highlighted.length > 0 && (
            <Scatter data={highlighted} dataKey="unitPrice" shape={renderHighlight} isAnimationActive={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {hovered && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 w-52 rounded-md border bg-surface p-2.5 text-xs shadow-lg shadow-black/40"
          style={{
            left: hovered.x,
            top: hovered.y,
            transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
          }}
        >
          <p className="mb-1.5 font-mono text-[13px] text-foreground">
            <span data-morph="">{hovered.point.ea}</span>
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Bid date</dt>
            <dd className="text-right font-mono text-subtle-foreground">{hovered.point.bidDate}</dd>
            <dt className="text-muted-foreground">District</dt>
            <dd className="text-right font-mono text-subtle-foreground">{formatDistrict(hovered.point.district)}</dd>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="text-right font-mono text-subtle-foreground">
              {`${formatQty(hovered.point.quantity)} ${hovered.point.unit}`}
            </dd>
            <dt className="text-muted-foreground">Unit price</dt>
            <dd className="text-right font-mono font-medium text-foreground">{formatUsd(hovered.point.unitPrice)}</dd>
          </dl>
        </div>
      )}
    </div>
  )
}
