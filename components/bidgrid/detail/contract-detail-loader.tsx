'use client'

import { useContract } from '@/lib/bidgrid/api'
import type { ContractDetail } from '@/lib/bidgrid/contract-types'
import type { Contract, ItemFamily, LineItem } from '@/lib/bidgrid/data'
import { DeferredView } from '../loading'
import { ContractView } from './contract-view'

/** Map the API's ContractDetail onto the UI's Contract shape. */
function adapt(d: ContractDetail): Contract {
  return {
    ea: d.ea,
    district: d.district,
    county: d.county,
    route: d.route ?? 0,
    postmileStart: d.postmileStart ?? 0,
    postmileEnd: d.postmileEnd ?? 0,
    bidOpenDate: d.bidOpenDate,
    projectType: d.projectType,
    typeOfWork: d.typeOfWork,
    lat: d.lat ?? 0,
    lng: d.lng ?? 0,
    primaryFamily: d.primaryFamily as ItemFamily,
    families: d.families as ItemFamily[],
    pdfUrl: d.pdfUrl,
    bidders: d.bidders,
    lineItems: d.lineItems.map(
      (li): LineItem => ({
        itemCode: li.itemCode,
        description: li.description,
        family: li.family as ItemFamily,
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
        bidder: li.bidder,
      }),
    ),
  }
}

/** Fetches a contract from /api/contracts/[ea] and renders it, showing a loading state. */
export function ContractDetailLoader({
  ea,
  active,
  onOpenItem,
  onOpenBidder,
}: {
  ea: string
  active: boolean
  onOpenItem: (item: LineItem) => void
  onOpenBidder: (name: string) => void
}) {
  const { data, loading, error } = useContract(ea)
  if (error) {
    return <p className="p-6 text-sm text-muted-foreground">{`Contract ${ea} couldn't be loaded.`}</p>
  }
  return (
    <DeferredView loading={loading || !data} label={`Loading ${ea}…`}>
      {data && (
        <ContractView
          contract={adapt(data)}
          active={active}
          onOpenItem={onOpenItem}
          onOpenBidder={onOpenBidder}
        />
      )}
    </DeferredView>
  )
}
