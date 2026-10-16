'use client'

import { useSyncExternalStore } from 'react'
import type { BidItem, BuildUIMessage, ProjectScope } from './build-tools'
import type { District } from './data'
import type { LatLng } from './estimate'

export interface Draft {
  id: string
  name: string
  pin: LatLng
  county: string
  district: District
  messages: BuildUIMessage[]
  items: BidItem[]
  /** Confirmed scope details recorded by the assistant via updateProjectScope. */
  scope?: ProjectScope
  p50Total: number | null
  createdAt: number
  updatedAt: number
}

// localStorage-backed for now; swap these three functions for API calls to move to a database.
const STORAGE_KEY = 'bidgrid:drafts'
const EMPTY: Draft[] = []
let cache: Draft[] | null = null
const listeners = new Set<() => void>()

function byRecent(a: Draft, b: Draft) {
  return b.updatedAt - a.updatedAt
}

function read(): Draft[] {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    cache = Array.isArray(parsed) ? (parsed as Draft[]).sort(byRecent) : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: Draft[]) {
  cache = [...next].sort(byRecent)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Quota exceeded or storage disabled: keep the in-memory copy so the session still works.
  }
  listeners.forEach((l) => l())
}

export function getDrafts(): Draft[] {
  return read()
}

export function getDraft(id: string): Draft | undefined {
  return read().find((d) => d.id === id)
}

export function saveDraft(draft: Draft) {
  write([draft, ...read().filter((d) => d.id !== draft.id)])
}

export function deleteDraft(id: string) {
  write(read().filter((d) => d.id !== id))
}

export function createDraftId() {
  return crypto.randomUUID()
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return
    cache = null
    listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useDrafts(): Draft[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

export function formatRelative(timestamp: number, now: number) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
