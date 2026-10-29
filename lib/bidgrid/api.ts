'use client'

/**
 * Typed client fetchers for the /api endpoints, plus small React hooks.
 *
 * This is the seam the UI uses instead of importing the CONTRACTS array: the
 * explorer/map/filters consume the lightweight list; opening a contract or a
 * bidder lazily fetches detail; the family view reads SQL aggregates.
 */

import { useEffect, useState } from 'react'

import type {
  BidderStat,
  ContractDetail,
  ContractFilters,
  ContractSummary,
  FamilyStat,
  Meta,
} from './contract-types'

/* ---------- Global in-flight tracker ----------
 * Every API call goes through getJson(), which bumps a module-level counter.
 * Components subscribe via useGlobalFetching() so a single top-of-page loading
 * bar reflects *all* API activity — no per-call wiring needed. */
let inFlight = 0
const fetchListeners = new Set<(n: number) => void>()

function notifyFetching(delta: number) {
  inFlight = Math.max(0, inFlight + delta)
  fetchListeners.forEach((l) => l(inFlight))
}

/** True while any API request is in flight. Drives the global loading bar. */
export function useGlobalFetching(): boolean {
  const [count, setCount] = useState(inFlight)
  useEffect(() => {
    const listener = (n: number) => setCount(n)
    fetchListeners.add(listener)
    setCount(inFlight)
    return () => {
      fetchListeners.delete(listener)
    }
  }, [])
  return count > 0
}

function qs(filters: ContractFilters): string {
  const p = new URLSearchParams()
  if (filters.districts?.length) p.set('districts', filters.districts.join(','))
  if (filters.families?.length) p.set('families', filters.families.join(','))
  if (filters.yearMin != null) p.set('yearMin', String(filters.yearMin))
  if (filters.yearMax != null) p.set('yearMax', String(filters.yearMax))
  if (filters.q) p.set('q', filters.q)
  const s = p.toString()
  return s ? `?${s}` : ''
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  notifyFetching(1)
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return (await res.json()) as T
  } finally {
    notifyFetching(-1)
  }
}

export const fetchContracts = (f: ContractFilters = {}, signal?: AbortSignal) =>
  getJson<{ contracts: ContractSummary[] }>(`/api/contracts${qs(f)}`, signal).then((r) => r.contracts)

export const fetchContract = (ea: string, signal?: AbortSignal) =>
  getJson<{ contract: ContractDetail }>(`/api/contracts/${encodeURIComponent(ea)}`, signal).then(
    (r) => r.contract,
  )

export const fetchFamilyStats = (f: ContractFilters = {}, signal?: AbortSignal) =>
  getJson<{ families: FamilyStat[] }>(`/api/stats/families${qs(f)}`, signal).then((r) => r.families)

export const fetchBidder = (name: string, signal?: AbortSignal) =>
  getJson<{ bidder: BidderStat }>(`/api/bidders/${encodeURIComponent(name)}`, signal).then(
    (r) => r.bidder,
  )

export const fetchMeta = (signal?: AbortSignal) => getJson<Meta>('/api/meta', signal)

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

/** Generic fetch hook: re-runs when `key` changes; aborts stale requests. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, key: string): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    fn(ctrl.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (err?.name !== 'AbortError') setState({ data: null, loading: false, error: err })
      })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export const useContracts = (f: ContractFilters = {}) =>
  useAsync((signal) => fetchContracts(f, signal), `contracts:${qs(f)}`)

export const useContract = (ea: string | null) =>
  useAsync((signal) => (ea ? fetchContract(ea, signal) : Promise.resolve(null as any)), `contract:${ea}`)

export const useFamilyStats = (f: ContractFilters = {}) =>
  useAsync((signal) => fetchFamilyStats(f, signal), `families:${qs(f)}`)

export const useBidder = (name: string | null) =>
  useAsync((signal) => (name ? fetchBidder(name, signal) : Promise.resolve(null as any)), `bidder:${name}`)
