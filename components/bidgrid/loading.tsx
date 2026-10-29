'use client'

import { Loader2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { useGlobalFetching } from '@/lib/bidgrid/api'
import { cn } from '@/lib/utils'

/** Spinning loader icon. Uses a compositor-promoted animation (see globals.css)
 * so it stays smooth even while the main thread is briefly busy. */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 bidgrid-spin', className)} aria-hidden />
}

/** Centered spinner with an optional label — for panels/sections that are loading. */
export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div
      className={cn('flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground', className)}
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  )
}

/**
 * Shows a loading state until `loading` is false AND the (possibly heavy) child
 * view has had a frame to mount — so the swap stays smooth instead of freezing
 * the spinner on a blocked frame. Mount the children lazily (e.g. `{data && <X/>}`)
 * so their work doesn't run until they're rendered.
 */
export function DeferredView({
  loading,
  label,
  className = 'min-h-[60vh]',
  children,
}: {
  loading: boolean
  label?: string
  className?: string
  children: ReactNode
}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (loading) {
      setReady(false)
      return
    }
    // Let the spinner paint a couple of frames before mounting the heavy view.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [loading])

  if (loading || !ready) return <LoadingState label={label} className={className} />
  return <>{children}</>
}

/**
 * Fixed indeterminate bar at the top of the viewport that is visible whenever ANY
 * API request is in flight (via the central tracker in lib/bidgrid/api.ts). Mount
 * once (in the root layout); every fetch anywhere drives it automatically.
 */
export function GlobalLoadingBar() {
  const fetching = useGlobalFetching()
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden transition-opacity duration-200',
        fetching ? 'opacity-100' : 'opacity-0',
      )}
      role="status"
      aria-hidden={!fetching}
    >
      <div className="loading-bar-indeterminate h-full bg-primary" />
    </div>
  )
}
