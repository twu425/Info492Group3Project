/** The small dashboard strip at the top of /quotes and /inbox: counts, plus how long the oldest request has waited. */
export function ExchangeCounts({ counts, oldest }: { counts: { label: string; value: number }[]; oldest: { label: string; since: string } | null }) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {counts.map((c) => (
        <div key={c.label} className="flex flex-col-reverse gap-1 rounded-lg border bg-surface p-3">
          <dt className="text-xs text-subtle-foreground">{c.label}</dt>
          <dd className="text-2xl font-semibold tracking-tight">{c.value}</dd>
        </div>
      ))}
      {oldest && (
        <div className="col-span-2 flex flex-col-reverse gap-1 rounded-lg border bg-surface p-3 sm:col-span-4">
          <dt className="text-xs text-subtle-foreground">{oldest.label}</dt>
          <dd className="text-sm font-medium">{waitedFor(oldest.since)}</dd>
        </div>
      )}
    </dl>
  )
}

/** "3 days", "2 h 5 min", "just now". */
export function waitedFor(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  if (minutes < 1) return 'Waiting just now'
  if (minutes < 60) return `Waiting ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Waiting ${hours} h ${minutes % 60} min`
  const days = Math.floor(hours / 24)
  return `Waiting ${days} day${days === 1 ? '' : 's'}`
}
