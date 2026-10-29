'use client'

import { ArrowLeft, Building2, ChevronRight, MapPin, X } from 'lucide-react'
import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type AnimationEvent } from 'react'
import { Button } from '@/components/ui/button'
import { type ItemFamily, type LineItem } from '@/lib/bidgrid/data'
import { FAMILY_COLORS, shortItemName } from '@/lib/bidgrid/format'
import { cn } from '@/lib/utils'
import { BidderDetailLoader } from './bidder-detail-loader'
import { FamilyDetailLoader } from '../family/family-detail-loader'
import { ContractDetailLoader } from './contract-detail-loader'

export type DetailView =
  | {
      kind: 'family'
      family: ItemFamily
      itemCode: string | null
      /** The clicked item's description, so the header names the item, not the (often
       * generic, e.g. "Other") family. Null when opened at the family level. */
      itemLabel: string | null
      highlightId: string | null
      /** Highlight every bid from this bidder on the trend chart. */
      highlightBidder: string | null
      sourceEa: string | null
    }
  | { kind: 'contract'; ea: string }
  | { kind: 'bidder'; name: string }

export const familyDetail = (family: ItemFamily, itemCode: string | null = null): DetailView => ({
  kind: 'family',
  family,
  itemCode,
  itemLabel: null,
  highlightId: null,
  highlightBidder: null,
  sourceEa: null,
})

export const lineItemDetail = (ea: string, item: LineItem): DetailView => ({
  kind: 'family',
  family: item.family,
  itemCode: item.itemCode,
  itemLabel: item.description,
  highlightId: `${ea}-${item.itemCode}-${item.bidder}`,
  highlightBidder: null,
  sourceEa: ea,
})

/** Open another item within a family as its own view. */
export const itemDetail = (family: ItemFamily, itemCode: string, label: string): DetailView => ({
  kind: 'family',
  family,
  itemCode,
  itemLabel: label,
  highlightId: null,
  highlightBidder: null,
  sourceEa: null,
})

export const familyForBidder = (family: ItemFamily, bidder: string): DetailView => ({
  kind: 'family',
  family,
  itemCode: null,
  itemLabel: null,
  highlightId: null,
  highlightBidder: bidder,
  sourceEa: null,
})

export const bidderDetail = (name: string): DetailView => ({ kind: 'bidder', name })

/** The contract the main map should ring while a view is showing. */
export const focusedEa = (view: DetailView) =>
  view.kind === 'contract' ? view.ea : view.kind === 'family' ? view.sourceEa : null

interface Entry {
  id: number
  view: DetailView
}

interface MorphOrigin {
  left: number
  top: number
  height: number
  fontSize: number
}

const FLASH_MS = 100
const MORPH_MS = 250

const viewLabel = (v: DetailView) =>
  v.kind === 'family'
    ? v.itemLabel
      ? shortItemName(v.itemLabel)
      : v.family
    : v.kind === 'contract'
      ? v.ea
      : v.name

const viewKindLabel = (v: DetailView) =>
  v.kind === 'family' ? (v.itemLabel ? 'Line item' : 'Item family') : v.kind === 'contract' ? 'Contract' : 'Bidder'

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function crumbSlots(count: number): (number | 'gap')[] {
  if (count <= 4) return Array.from({ length: count }, (_, i) => i)
  return [0, 'gap', count - 2, count - 1]
}

/**
 * Finds the clickable element a navigation came from. Map markers and chart dots
 * carry their EA in a tooltip, so those look up the label within their scope.
 */
function findMorphHost(target: Element) {
  return target.closest('[data-morph-host], tbody tr, .map-marker')
}

function findMorphText(host: Element) {
  return (
    host.querySelector('[data-morph]') ??
    host.closest('[data-morph-scope]')?.querySelector('[data-morph]') ??
    host
  )
}

interface DetailModalProps {
  initial: DetailView
  onClose: () => void
  onShowOnMap: (ea: string) => void
  onViewChange: (view: DetailView) => void
}

export function DetailModal({ initial, onClose, onShowOnMap, onViewChange }: DetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)
  const nextId = useRef(1)
  const [stack, setStack] = useState<Entry[]>(() => [{ id: 0, view: initial }])
  const [index, setIndex] = useState(0)
  /** Index of the pane fading out, while a crossfade runs. */
  const [fadingFrom, setFadingFrom] = useState<number | null>(null)
  const current = stack[index]

  const indexRef = useRef(index)
  const clickSource = useRef<Element | null>(null)
  const morphOrigin = useRef<MorphOrigin | null>(null)
  const pendingNav = useRef<number | null>(null)

  useLayoutEffect(() => {
    indexRef.current = index
  }, [index])

  // showModal before paint so embedded maps measure a visible container.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      dialog?.close()
      if (pendingNav.current) window.clearTimeout(pendingNav.current)
    }
  }, [])

  // Remember what was clicked (or activated by keyboard) so navigation can flash and morph from it.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const record = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return
      clickSource.current = e.target instanceof Element ? findMorphHost(e.target) : null
    }
    dialog.addEventListener('click', record, true)
    dialog.addEventListener('keydown', record, true)
    return () => {
      dialog.removeEventListener('click', record, true)
      dialog.removeEventListener('keydown', record, true)
    }
  }, [])

  const reportView = useEffectEvent((view: DetailView) => onViewChange(view))
  useEffect(() => reportView(current.view), [current.view])

  const paneRefs = useRef(new Map<number, HTMLDivElement>())
  const firstPane = useRef(true)
  // The previous pane goes inert on navigation, which would drop focus to <body>.
  useEffect(() => {
    if (firstPane.current) {
      firstPane.current = false
      return
    }
    paneRefs.current.get(current.id)?.focus({ preventScroll: true })
  }, [current.id])

  // Fly the new header title in from where the clicked label sat (FLIP).
  useLayoutEffect(() => {
    const origin = morphOrigin.current
    const title = titleRef.current
    morphOrigin.current = null
    if (!origin || !title) return
    const final = title.getBoundingClientRect()
    const titleFont = parseFloat(getComputedStyle(title).fontSize)
    if (!final.height || !titleFont) return
    const scale = origin.fontSize / titleFont
    const dx = origin.left - final.left
    const dy = origin.top + origin.height / 2 - (final.top + (final.height * scale) / 2)
    title.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'none' }],
      { duration: MORPH_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    )
  }, [current.id])

  const goBack = useEffectEvent(() => goTo(index - 1))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.key !== 'ArrowLeft') return
      e.preventDefault()
      goBack()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const commitPush = (view: DetailView, animate: boolean) => {
    const from = indexRef.current
    const id = nextId.current++
    setStack((s) => [...s.slice(0, from + 1), { id, view }])
    setFadingFrom(animate ? from : null)
    setIndex(from + 1)
  }

  const push = (view: DetailView) => {
    const host = clickSource.current
    clickSource.current = null
    if (pendingNav.current) return
    if (prefersReducedMotion()) {
      commitPush(view, false)
      return
    }
    if (host) {
      const text = findMorphText(host)
      const rect = text.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        morphOrigin.current = {
          left: rect.left,
          top: rect.top,
          height: rect.height,
          fontSize: parseFloat(getComputedStyle(text).fontSize) || 12,
        }
      }
      host.classList.add('click-flash')
      window.setTimeout(() => host.classList.remove('click-flash'), FLASH_MS * 3)
    }
    pendingNav.current = window.setTimeout(() => {
      pendingNav.current = null
      commitPush(view, true)
    }, host ? FLASH_MS : 0)
  }

  const goTo = (target: number) => {
    if (target < 0 || target >= index) return
    if (pendingNav.current) {
      window.clearTimeout(pendingNav.current)
      pendingNav.current = null
    }
    morphOrigin.current = null
    setIndex(target)
    if (prefersReducedMotion()) {
      setFadingFrom(null)
      setStack((s) => s.slice(0, target + 1))
    } else {
      setFadingFrom(index)
    }
  }

  const finishTransition = (e: AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.animationName !== 'detail-fade-in') return
    setFadingFrom(null)
    setStack((s) => s.slice(0, index + 1))
  }

  const view = current.view
  const crumbs = stack.slice(0, index + 1)
  const pushedFresh = fadingFrom !== null && fadingFrom < index

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="detail-modal-title"
      className="detail-modal m-auto h-[85dvh] max-h-none w-[80vw] max-w-none overflow-hidden rounded-[8px] border bg-surface p-0 text-foreground shadow-2xl shadow-black/50"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => goTo(index - 1)}
              aria-label="Back"
              title="Back (Alt+←)"
              className={cn('-ml-2', index === 0 && 'invisible')}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
            <div className="flex min-w-0 flex-col gap-0.5">
              {index === 0 ? (
                <p className="h-4 text-xs leading-4 text-muted-foreground">{viewKindLabel(view)}</p>
              ) : (
                <nav aria-label="Breadcrumb">
                  <ol className="flex h-4 min-w-0 items-center gap-1 text-xs leading-4 text-muted-foreground">
                    {crumbSlots(crumbs.length).map((slot, i) => {
                      const fresh = pushedFresh && slot === index
                      return (
                        <Fragment key={slot === 'gap' ? 'gap' : crumbs[slot].id}>
                          {i > 0 && (
                            <li aria-hidden="true" className={cn('shrink-0', fresh && 'crumb-in')}>
                              <ChevronRight className="size-3" />
                            </li>
                          )}
                          {slot === 'gap' ? (
                            <li
                              className="shrink-0"
                              title={crumbs
                                .slice(1, -2)
                                .map((c) => viewLabel(c.view))
                                .join(' › ')}
                            >
                              …
                            </li>
                          ) : (
                            <li className={cn('min-w-0', fresh && 'crumb-in')}>
                              {slot === index ? (
                                <span aria-current="page" className="block truncate text-subtle-foreground">
                                  {viewLabel(crumbs[slot].view)}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => goTo(slot)}
                                  className={cn(
                                    'block max-w-48 truncate rounded-sm transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none',
                                    crumbs[slot].view.kind === 'contract' && 'font-mono',
                                  )}
                                >
                                  {viewLabel(crumbs[slot].view)}
                                </button>
                              )}
                            </li>
                          )}
                        </Fragment>
                      )
                    })}
                  </ol>
                </nav>
              )}
              <h1
                id="detail-modal-title"
                className="flex min-w-0 text-2xl font-semibold tracking-tight text-foreground"
              >
                <span ref={titleRef} className="flex min-w-0 origin-top-left items-center gap-2.5">
                  {view.kind === 'family' ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: FAMILY_COLORS[view.family] }}
                      />
                      <span className="truncate">
                        {view.itemLabel ? shortItemName(view.itemLabel) : view.family}
                      </span>
                      {view.itemLabel && (
                        <span className="shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {view.family}
                        </span>
                      )}
                    </>
                  ) : view.kind === 'contract' ? (
                    <>
                      <span className="sr-only">Contract </span>
                      <span className="truncate font-mono font-medium">{view.ea}</span>
                    </>
                  ) : (
                    <>
                      <Building2 aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                      <span className="sr-only">Bidder </span>
                      <span className="truncate">{view.name}</span>
                    </>
                  )}
                </span>
              </h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {view.kind === 'contract' && (
              <Button variant="outline" size="sm" onClick={() => onShowOnMap(view.ea)}>
                <MapPin aria-hidden="true" />
                Show on map
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close details">
              <X aria-hidden="true" />
            </Button>
          </div>
        </header>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {stack.map((entry, i) => {
            const isCurrent = i === index
            const isFading = fadingFrom === i && !isCurrent
            const shown = isCurrent || isFading
            return (
              <div
                key={entry.id}
                ref={(el) => {
                  if (el) paneRefs.current.set(entry.id, el)
                  else paneRefs.current.delete(entry.id)
                }}
                tabIndex={-1}
                inert={!isCurrent}
                onAnimationEnd={isCurrent ? finishTransition : undefined}
                className={cn(
                  'absolute inset-0 overflow-y-auto bg-background focus:outline-none',
                  isCurrent ? 'z-10' : 'z-0',
                  !shown && 'invisible',
                  isCurrent && fadingFrom !== null && 'detail-fade-in',
                  isFading && 'detail-fade-out',
                )}
              >
                <DetailPane view={entry.view} active={shown} onNavigate={push} />
              </div>
            )
          })}
        </div>
      </div>
    </dialog>
  )
}

function DetailPane({
  view,
  active,
  onNavigate,
}: {
  view: DetailView
  active: boolean
  onNavigate: (view: DetailView) => void
}) {
  if (view.kind === 'family') {
    return (
      <FamilyDetailLoader
        family={view.family}
        initialItem={view.itemCode}
        highlightId={view.highlightId}
        highlightBidder={view.highlightBidder}
        active={active}
        onOpenContract={(ea) => onNavigate({ kind: 'contract', ea })}
        onOpenBidder={(name) => onNavigate(bidderDetail(name))}
        onOpenItem={(itemCode, label) => onNavigate(itemDetail(view.family, itemCode, label))}
      />
    )
  }
  if (view.kind === 'bidder') {
    return (
      <BidderDetailLoader
        name={view.name}
        active={active}
        onOpenContract={(ea) => onNavigate({ kind: 'contract', ea })}
        onOpenFamily={(family) => onNavigate(familyForBidder(family, view.name))}
        onOpenBidder={(name) => onNavigate(bidderDetail(name))}
      />
    )
  }
  return (
    <ContractDetailLoader
      ea={view.ea}
      active={active}
      onOpenItem={(item) => onNavigate(lineItemDetail(view.ea, item))}
      onOpenBidder={(name) => onNavigate(bidderDetail(name))}
    />
  )
}
