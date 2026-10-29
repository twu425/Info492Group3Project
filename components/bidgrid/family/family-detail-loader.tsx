'use client'

import { useFamilyStats } from '@/lib/bidgrid/api'
import type { ItemFamily } from '@/lib/bidgrid/data'
import { DeferredView } from '../loading'
import { FamilyView } from './family-view'

/**
 * Gates the family (item) view on a real /api/stats/families fetch so opening it
 * shows a loading state (and drives the global loading bar). The view's charts/
 * table still compute client-side; this wires the loader + existence check.
 */
export function FamilyDetailLoader({
  family,
  initialItem,
  highlightId,
  highlightBidder,
  active,
  onOpenContract,
  onOpenBidder,
  onOpenItem,
}: {
  family: ItemFamily
  initialItem: string | null
  highlightId: string | null
  highlightBidder: string | null
  active: boolean
  onOpenContract: (ea: string) => void
  onOpenBidder: (name: string) => void
  onOpenItem: (itemCode: string, label: string) => void
}) {
  const { loading } = useFamilyStats({ families: [family] })
  return (
    <DeferredView loading={loading} label={`Loading ${family}…`}>
      <FamilyView
        family={family}
        initialItem={initialItem}
        highlightId={highlightId}
        highlightBidder={highlightBidder}
        active={active}
        onOpenContract={onOpenContract}
        onOpenBidder={onOpenBidder}
        onOpenItem={onOpenItem}
      />
    </DeferredView>
  )
}
