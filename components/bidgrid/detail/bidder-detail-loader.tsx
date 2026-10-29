'use client'

import { useBidder } from '@/lib/bidgrid/api'
import type { ItemFamily } from '@/lib/bidgrid/data'
import { DeferredView } from '../loading'
import { BidderView } from './bidder-view'

/**
 * Gates the bidder view on a real /api/bidders/[name] fetch so opening a bidder
 * shows a loading state (and drives the global loading bar). The view's detailed
 * analytics still compute client-side; this wires the loader + existence check.
 */
export function BidderDetailLoader({
  name,
  active,
  onOpenContract,
  onOpenFamily,
  onOpenBidder,
}: {
  name: string
  active: boolean
  onOpenContract: (ea: string) => void
  onOpenFamily: (family: ItemFamily) => void
  onOpenBidder: (name: string) => void
}) {
  const { loading, error } = useBidder(name)
  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">{`Bidder "${name}" couldn't be loaded.`}</p>
  }
  return (
    <DeferredView loading={loading} label={`Loading ${name}…`}>
      <BidderView
        name={name}
        active={active}
        onOpenContract={onOpenContract}
        onOpenFamily={onOpenFamily}
        onOpenBidder={onOpenBidder}
      />
    </DeferredView>
  )
}
