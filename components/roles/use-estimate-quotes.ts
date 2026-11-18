'use client'

import { useCallback, useEffect, useState } from 'react'
import { quotesForEstimate } from '@/lib/roles-actions'
import type { QuoteRequest } from '@/lib/roles-store'

const REFRESH_MS = 10_000

/**
 * Quote requests for one saved estimate, kept fresh while the Build drawer is open, so a quote
 * the sub sends shows up on its row without a reload. Estimator only; anyone else gets none.
 */
export function useEstimateQuotes(estimateId: string | null, enabled: boolean) {
  const [requests, setRequests] = useState<QuoteRequest[]>([])

  const refresh = useCallback(async () => {
    if (!estimateId || !enabled) {
      setRequests([])
      return
    }
    setRequests(await quotesForEstimate(estimateId))
  }, [estimateId, enabled])

  useEffect(() => {
    refresh()
    if (!estimateId || !enabled) return
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh, estimateId, enabled])

  /** The newest request that includes this bid item, if any. */
  const latestFor = (itemId: string) => {
    for (let i = requests.length - 1; i >= 0; i--) {
      if (requests[i].items.some((it) => it.itemId === itemId)) return requests[i]
    }
    return null
  }

  return { requests, refresh, latestFor }
}
