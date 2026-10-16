'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { QuarterBids } from '@/lib/bidgrid/bidder'

interface BidHistoryChartProps {
  quarters: QuarterBids[]
}

const TICK = { fontFamily: 'var(--font-mono)', fontSize: 11, fill: 'var(--muted-foreground)' }

function quarterLabel(time: number) {
  const d = new Date(time)
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}

interface TooltipPayload {
  active?: boolean
  payload?: { payload: QuarterBids }[]
}

function ChartTooltip({ active, payload }: TooltipPayload) {
  if (!active || !payload?.length) return null
  const q = payload[0].payload
  return (
    <div className="rounded-md border bg-surface p-2.5 text-xs shadow-lg shadow-black/40">
      <p className="mb-1.5 font-mono text-[13px] text-foreground">{quarterLabel(q.time)}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: 'var(--primary)' }} />
          Won
        </dt>
        <dd className="text-right font-mono text-foreground">{q.won}</dd>
        <dt className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: 'var(--border)' }} />
          Lost
        </dt>
        <dd className="text-right font-mono text-subtle-foreground">{q.lost}</dd>
      </dl>
    </div>
  )
}

export function BidHistoryChart({ quarters }: BidHistoryChartProps) {
  const maxTotal = useMemo(() => Math.max(1, ...quarters.map((q) => q.won + q.lost)), [quarters])

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={quarters} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
        <XAxis
          dataKey="time"
          tickFormatter={(t: number) => String(new Date(t).getUTCFullYear())}
          axisLine={false}
          tickLine={false}
          tick={TICK}
          tickMargin={8}
          interval="preserveStartEnd"
          minTickGap={28}
        />
        <YAxis
          type="number"
          domain={[0, maxTotal]}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
          tick={TICK}
          width={28}
          tickCount={Math.min(maxTotal + 1, 5)}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--foreground)', fillOpacity: 0.04 }} />
        <Bar dataKey="lost" stackId="bids" fill="var(--border)" isAnimationActive={false} />
        <Bar dataKey="won" stackId="bids" fill="var(--primary)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}
