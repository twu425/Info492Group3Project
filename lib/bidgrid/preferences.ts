'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function readBoolean(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : raw === 'true'
  } catch {
    return fallback
  }
}

export function usePersistentBoolean(key: string, fallback: boolean) {
  const value = useSyncExternalStore(
    subscribe,
    () => readBoolean(key, fallback),
    () => fallback,
  )

  const setValue = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === 'function' ? next(readBoolean(key, fallback)) : next
      try {
        localStorage.setItem(key, String(resolved))
      } catch {
        // Storage disabled: the preference just won't persist.
      }
      listeners.forEach((l) => l())
    },
    [key, fallback],
  )

  return [value, setValue] as const
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
