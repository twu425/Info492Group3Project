'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CONTRACTS,
  DISTRICTS,
  ITEM_FAMILIES,
  MAX_YEAR,
  MIN_YEAR,
  type District,
  type ItemFamily,
} from '@/lib/bidgrid/data'
import { getDraft, useDrafts, type Draft } from '@/lib/bidgrid/drafts'
import type { LatLng } from '@/lib/bidgrid/estimate'
import { usePersistentBoolean } from '@/lib/bidgrid/preferences'
import { AppHeader } from './app-header'
import { BuildDrawer, type BuildDrawerHandle } from './build/build-drawer'
import type { DraftPin } from './contract-map'
import { DetailModal, focusedEa, type DetailView } from './detail/detail-modal'
import { DraftsMenu } from './drafts-menu'
import { FilterSidebar, type Filters } from './filter-sidebar'
import { GlobalSearch } from './global-search'

const ContractMap = dynamic(() => import('./contract-map').then((m) => m.ContractMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map…</div>
  ),
})

interface OpenDetail {
  key: number
  view: DetailView
}

export function Explorer({ initialEa }: { initialEa: string | null }) {
  const [filters, setFilters] = useState<Filters>({
    families: new Set<ItemFamily>(ITEM_FAMILIES),
    districts: new Set<District>(DISTRICTS),
    yearRange: [MIN_YEAR, MAX_YEAR],
  })
  const [selectedEa, setSelectedEa] = useState<string | null>(initialEa)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [detail, setDetail] = useState<OpenDetail | null>(() =>
    initialEa ? { key: 0, view: { kind: 'contract', ea: initialEa } } : null,
  )
  const [focusEa, setFocusEa] = useState<string | null>(null)
  const [pin, setPin] = useState<LatLng | null>(null)
  const [placingPin, setPlacingPin] = useState(false)
  const [candidatePin, setCandidatePin] = useState<LatLng | null>(null)
  const [drawerMounted, setDrawerMounted] = useState(false)
  const lastPin = useRef<LatLng | null>(null)
  const [buildSession, setBuildSession] = useState(0)
  const [hoveredEa, setHoveredEa] = useState<string | null>(null)
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const drawerRef = useRef<BuildDrawerHandle>(null)
  const drafts = useDrafts()
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentBoolean('bidgrid:sidebar-collapsed', false)
  const [draftPinsVisible, setDraftPinsVisible] = usePersistentBoolean('bidgrid:draft-pins', true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, dialog, [contenteditable="true"]')) return
      e.preventDefault()
      setSidebarCollapsed((c) => !c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSidebarCollapsed])

  const selectContract = (ea: string | null) => {
    setSelectedEa(ea)
    window.history.replaceState(null, '', ea ? `/?ea=${encodeURIComponent(ea)}` : '/')
  }

  const openDetail = (view: DetailView) => setDetail({ key: Date.now(), view })
  const openContract = (ea: string) => openDetail({ kind: 'contract', ea })

  const closeDetail = () => {
    setDetail(null)
    setFocusEa(null)
  }

  const showOnMap = (ea: string) => {
    closeDetail()
    selectContract(ea)
  }

  const cancelReplacePin = () => {
    setPlacingPin(false)
    setCandidatePin(null)
  }

  const beginReplacePin = () => {
    setCandidatePin(null)
    setPlacingPin(true)
  }

  const confirmReplacePin = () => {
    if (!candidatePin) return
    setPin(candidatePin)
    drawerRef.current?.notifyPinReplaced(candidatePin)
    setPlacingPin(false)
    setCandidatePin(null)
  }

  // Escape leaves placement mode.
  useEffect(() => {
    if (!placingPin) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      cancelReplacePin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placingPin])

  // Keep the drawer mounted through its slide-out so it can animate closed.
  useEffect(() => {
    if (pin) {
      lastPin.current = pin
      setDrawerMounted(true)
      return
    }
    if (!drawerMounted) return
    const t = setTimeout(() => setDrawerMounted(false), 220)
    return () => clearTimeout(t)
  }, [pin, drawerMounted])

  const dropPin = (point: LatLng) => {
    if (!pin) {
      setInitialDraft(null)
      setBuildSession((s) => s + 1)
      selectContract(null)
    }
    setPin(point)
  }

  const finishCloseBuild = () => {
    setPin(null)
    setHoveredEa(null)
    setInitialDraft(null)
    setActiveDraftId(null)
    cancelReplacePin()
  }

  const loadDraft = (draft: Draft) => {
    selectContract(null)
    setHoveredEa(null)
    setInitialDraft(draft)
    setActiveDraftId(draft.id)
    setBuildSession((s) => s + 1)
    setPin(draft.pin)
    cancelReplacePin()
  }

  const openDraft = (id: string) => {
    const draft = getDraft(id)
    if (!draft || (pin && activeDraftId === id)) return
    if (pin && drawerRef.current) drawerRef.current.requestClose(() => loadDraft(draft))
    else loadDraft(draft)
  }

  const draftPins: DraftPin[] = useMemo(
    () =>
      draftPinsVisible
        ? drafts
            .filter((d) => !(pin && d.id === activeDraftId))
            .map((d) => ({ id: d.id, name: d.name, lat: d.pin.lat, lng: d.pin.lng }))
        : [],
    [drafts, draftPinsVisible, pin, activeDraftId],
  )

  const visible = useMemo(
    () =>
      CONTRACTS.filter((c) => {
        const year = Number(c.bidOpenDate.slice(0, 4))
        return (
          filters.districts.has(c.district) &&
          year >= filters.yearRange[0] &&
          year <= filters.yearRange[1] &&
          c.families.some((f) => filters.families.has(f))
        )
      }),
    [filters],
  )

  // Keep the selected or modal-focused contract on the map even if the filters hide it.
  const mapContracts = useMemo(() => {
    const extra = CONTRACTS.filter(
      (c) => (c.ea === focusEa || c.ea === selectedEa) && !visible.includes(c),
    )
    return extra.length ? [...visible, ...extra] : visible
  }, [visible, focusEa, selectedEa])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <AppHeader
        onToggleFilters={() => setFiltersOpen((o) => !o)}
        filtersOpen={filtersOpen}
        search={<GlobalSearch onOpenView={openDetail} />}
        actions={<DraftsMenu drafts={drafts} activeDraftId={pin ? activeDraftId : null} onOpen={openDraft} />}
      />
      <div className="relative min-h-0 flex-1">
        {/* The map fills the whole area at a fixed size and never resizes when panels toggle. */}
        <main className="absolute inset-0" aria-label="Contract map">
          <h1 className="sr-only">BidGrid contract map</h1>
          <ContractMap
            contracts={mapContracts}
            activeFamilies={filters.families}
            selectedEa={selectedEa}
            focusEa={focusEa}
            onSelect={openContract}
            pin={pin}
            hoveredEa={hoveredEa}
            onMapClick={dropPin}
            draftPins={draftPins}
            onOpenDraft={openDraft}
            sidebarCollapsed={sidebarCollapsed}
            drawerOpen={pin !== null}
            pinLocked={pin !== null && !placingPin}
            placing={placingPin}
            candidatePin={candidatePin}
            onPlaceCandidate={setCandidatePin}
            onConfirmPin={confirmReplacePin}
            onCancelPin={cancelReplacePin}
          />
          {!pin && !selectedEa && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border bg-surface/90 px-3 py-1.5 text-xs text-subtle-foreground">
              Click anywhere on the map to start an estimate
            </p>
          )}
        </main>
        <FilterSidebar
          filters={filters}
          onChange={setFilters}
          visibleCount={visible.length}
          totalCount={CONTRACTS.length}
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((c) => !c)}
          draftPinsVisible={draftPinsVisible}
          onToggleDraftPins={() => setDraftPinsVisible((v) => !v)}
          draftCount={drafts.length}
        />
        {drawerMounted && (
          <BuildDrawer
            key={buildSession}
            ref={drawerRef}
            chatId={initialDraft?.id ?? `build-${buildSession}`}
            open={pin !== null}
            pin={(pin ?? lastPin.current)!}
            initialDraft={initialDraft}
            placing={placingPin}
            onReplacePin={beginReplacePin}
            onActiveDraftChange={setActiveDraftId}
            onOpenContract={openContract}
            onHoverContract={setHoveredEa}
            onOpenDetail={openDetail}
            onClose={finishCloseBuild}
          />
        )}
      </div>
      {detail && (
        <DetailModal
          key={detail.key}
          initial={detail.view}
          onClose={closeDetail}
          onShowOnMap={showOnMap}
          onViewChange={(view) => setFocusEa(focusedEa(view))}
        />
      )}
    </div>
  )
}
