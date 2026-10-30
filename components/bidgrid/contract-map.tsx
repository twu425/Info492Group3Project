'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { ChevronDown } from 'lucide-react'
import { Map as MapLibreMap, Marker, NavigationControl, Popup, type GeoJSONSource } from 'maplibre-gl'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { CATEGORIES, CONTRACTS, type Contract, type ItemFamily } from '@/lib/bidgrid/data'
import { CATEGORY_COLORS, FAMILY_COLORS } from '@/lib/bidgrid/format'
import type { LatLng } from '@/lib/bidgrid/estimate'
import { STYLE_URL } from '@/lib/bidgrid/maplibre'
import { usePersistentBoolean } from '@/lib/bidgrid/preferences'
import { cn } from '@/lib/utils'
import type { MapSegment } from './build/build-drawer'

interface ContractMapProps {
  contracts: Contract[]
  activeFamilies: Set<ItemFamily>
  selectedEa: string | null
  /** Contract shown in the detail modal; ringed and kept in view behind the backdrop. */
  focusEa: string | null
  onSelect: (ea: string) => void
  pin: LatLng | null
  /** A located highway segment to draw as a line (from the showSegment tool). */
  segment: MapSegment | null
  hoveredEa: string | null
  onMapClick: (point: LatLng) => void
  draftPins: DraftPin[]
  onOpenDraft: (id: string) => void
  /** Collapsed state of the filter sidebar; a change re-centers the focused target. */
  sidebarCollapsed: boolean
  /** Whether the build drawer overlay is open (covers the right of the map). */
  drawerOpen: boolean
  /** A build drawer is open and its pin may only move via placement mode. */
  pinLocked: boolean
  /** Replace-pin placement mode is active. */
  placing: boolean
  /** The proposed new pin location while placing. */
  candidatePin: LatLng | null
  onPlaceCandidate: (point: LatLng) => void
  onConfirmPin: () => void
  onCancelPin: () => void
}

export interface DraftPin {
  id: string
  name: string
  lat: number
  lng: number
}

function displayFamily(c: Contract, active: Set<ItemFamily>): ItemFamily {
  if (active.has(c.primaryFamily)) return c.primaryFamily
  return c.families.find((f) => active.has(f)) ?? c.primaryFamily
}

export function ContractMap({
  contracts,
  activeFamilies,
  selectedEa,
  focusEa,
  onSelect,
  pin,
  segment,
  hoveredEa,
  onMapClick,
  draftPins,
  onOpenDraft,
  sidebarCollapsed,
  drawerOpen,
  pinLocked,
  placing,
  candidatePin,
  onPlaceCandidate,
  onConfirmPin,
  onCancelPin,
}: ContractMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const markerEls = useRef(new Map<string, HTMLElement>())
  const pinElRef = useRef<HTMLDivElement | null>(null)
  const toastKey = useRef(0)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [toast, setToast] = useState<{ x: number; y: number; key: number } | null>(null)
  const selected = useMemo(() => CONTRACTS.find((c) => c.ea === selectedEa), [selectedEa])
  const handleSelect = useEffectEvent((ea: string) => onSelect(ea))
  const handleOpenDraft = useEffectEvent((id: string) => onOpenDraft(id))
  const handleConfirmPin = useEffectEvent(() => onConfirmPin())
  const handleCancelPin = useEffectEvent(() => onCancelPin())

  // Clicking empty map space: place a candidate while placing, warn while locked, else start an estimate.
  const onCanvasClick = useEffectEvent((point: LatLng, screen: { x: number; y: number }) => {
    if (placing) {
      onPlaceCandidate(point)
    } else if (pinLocked) {
      setToast({ x: screen.x, y: screen.y, key: ++toastKey.current })
    } else {
      onMapClick(point)
    }
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const instance = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [-119.6, 36.4],
      zoom: 5,
      minZoom: 4,
      attributionControl: { compact: true },
    })
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    instance.getCanvas().style.cursor = 'crosshair'
    instance.on('click', (e) => {
      const target = e.originalEvent.target as HTMLElement | null
      if (target?.closest('.map-marker, .draft-pin, .maplibregl-ctrl, .place-candidate, .place-actions')) return
      onCanvasClick({ lat: e.lngLat.lat, lng: e.lngLat.lng }, { x: e.point.x, y: e.point.y })
    })
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(container)
    setMap(instance)
    return () => {
      observer.disconnect()
      instance.remove()
      setMap(null)
    }
  }, [])

  useEffect(() => {
    if (!map) return
    const tooltip = new Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'map-tooltip' })

    const markers = contracts.map((c) => {
      const isSelected = c.ea === selectedEa
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'map-marker'
      el.dataset.selected = String(isSelected)
      el.style.setProperty('--c', FAMILY_COLORS[displayFamily(c, activeFamilies)])
      el.setAttribute('aria-label', `Contract ${c.ea}, bid ${c.bidOpenDate.slice(0, 4)}`)
      el.setAttribute('aria-pressed', String(isSelected))
      if (isSelected) el.style.zIndex = '2'

      const label = document.createElement('div')
      label.className = 'flex max-w-[220px] flex-col gap-0.5'
      const ea = document.createElement('span')
      ea.className = 'font-mono text-foreground'
      ea.textContent = c.ea
      const work = document.createElement('span')
      work.className = 'text-pretty leading-snug text-subtle-foreground'
      work.textContent = c.typeOfWork
      const open = document.createElement('span')
      open.className = 'text-muted-foreground'
      open.textContent = `Bid open ${c.bidOpenDate}`
      label.append(ea, work, open)

      const show = () => tooltip.setLngLat([c.lng, c.lat]).setDOMContent(label).addTo(map)
      const hide = () => tooltip.remove()
      el.addEventListener('mouseenter', show)
      el.addEventListener('focus', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('blur', hide)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handleSelect(c.ea)
      })

      markerEls.current.set(c.ea, el)
      return new Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map)
    })

    return () => {
      tooltip.remove()
      markers.forEach((m) => m.remove())
      markerEls.current.clear()
    }
  }, [map, contracts, activeFamilies, selectedEa])

  useEffect(() => {
    const el = hoveredEa ? markerEls.current.get(hoveredEa) : undefined
    if (!el) return
    el.dataset.hovered = 'true'
    const prevZ = el.style.zIndex
    el.style.zIndex = '3'
    return () => {
      delete el.dataset.hovered
      el.style.zIndex = prevZ
    }
  }, [hoveredEa, contracts, activeFamilies, selectedEa, map])

  useEffect(() => {
    const el = focusEa ? markerEls.current.get(focusEa) : undefined
    if (!el) return
    el.dataset.focused = 'true'
    const prevZ = el.style.zIndex
    el.style.zIndex = '4'
    return () => {
      delete el.dataset.focused
      el.style.zIndex = prevZ
    }
  }, [focusEa, contracts, activeFamilies, selectedEa, map])

  useEffect(() => {
    const target = focusEa ? CONTRACTS.find((c) => c.ea === focusEa) : undefined
    if (!map || !target) return
    map.easeTo({ center: [target.lng, target.lat], duration: 900 })
  }, [map, focusEa])

  useEffect(() => {
    if (!map || draftPins.length === 0) return
    const tooltip = new Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'map-tooltip' })
    const markers = draftPins.map((d) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'draft-pin'
      el.setAttribute('aria-label', `Open draft: ${d.name}`)
      const label = document.createElement('span')
      label.textContent = d.name
      const show = () => tooltip.setLngLat([d.lng, d.lat]).setDOMContent(label).addTo(map)
      const hide = () => tooltip.remove()
      el.addEventListener('mouseenter', show)
      el.addEventListener('focus', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('blur', hide)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        hide()
        handleOpenDraft(d.id)
      })
      return new Marker({ element: el, anchor: 'bottom' }).setLngLat([d.lng, d.lat]).addTo(map)
    })
    return () => {
      tooltip.remove()
      markers.forEach((m) => m.remove())
    }
  }, [map, draftPins])

  useEffect(() => {
    if (!map || !pin) return
    const el = document.createElement('div')
    el.className = 'drop-pin'
    el.setAttribute('role', 'img')
    el.setAttribute('aria-label', 'Estimate location')
    pinElRef.current = el
    const marker = new Marker({ element: el }).setLngLat([pin.lng, pin.lat]).addTo(map)
    return () => {
      marker.remove()
      pinElRef.current = null
    }
  }, [map, pin])

  // Draw a located highway segment (from showSegment) as an amber line, and frame it.
  useEffect(() => {
    if (!map || !segment || segment.points.length < 2) return
    const SOURCE = 'located-segment'
    const LINE = `${SOURCE}-line`
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: segment.points.map((p) => [p.lng, p.lat]) },
    }
    let removed = false
    const draw = () => {
      if (removed || !map.isStyleLoaded()) return
      const existing = map.getSource(SOURCE) as GeoJSONSource | undefined
      if (existing) {
        existing.setData(data)
      } else {
        map.addSource(SOURCE, { type: 'geojson', data })
        map.addLayer({
          id: LINE,
          type: 'line',
          source: SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#f59e0b', 'line-width': 5, 'line-opacity': 0.9 },
        })
      }
      const lats = segment.points.map((p) => p.lat)
      const lngs = segment.points.map((p) => p.lng)
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: { top: 60, bottom: 60, left: sidebarCollapsed ? 80 : 300, right: drawerOpen ? 520 : 60 }, maxZoom: 14, duration: 700 },
      )
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
    return () => {
      removed = true
      if (map.getLayer(LINE)) map.removeLayer(LINE)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
    }
  }, [map, segment, sidebarCollapsed, drawerOpen])

  // Dim the current pin while choosing a replacement location.
  useEffect(() => {
    if (pinElRef.current) pinElRef.current.style.opacity = placing ? '0.4' : '1'
  }, [placing, pin])

  // A locked pin uses the default cursor; otherwise clicking the map does something.
  useEffect(() => {
    if (!map) return
    map.getCanvas().style.cursor = pinLocked ? '' : 'crosshair'
  }, [map, pinLocked])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(id)
  }, [toast])

  // The candidate pin and its Confirm / Cancel controls, shown after a click in placement mode.
  useEffect(() => {
    if (!map || !candidatePin) return
    const pinEl = document.createElement('div')
    pinEl.className = 'drop-pin place-candidate'
    pinEl.setAttribute('role', 'img')
    pinEl.setAttribute('aria-label', 'Proposed new location')
    const pinMarker = new Marker({ element: pinEl }).setLngLat([candidatePin.lng, candidatePin.lat]).addTo(map)

    const actions = document.createElement('div')
    actions.className =
      'place-actions flex items-center gap-1 rounded-lg border bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/0.45)]'
    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = 'flex h-7 items-center rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90'
    confirm.textContent = 'Confirm'
    confirm.addEventListener('click', (ev) => {
      ev.stopPropagation()
      handleConfirmPin()
    })
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-subtle-foreground hover:bg-foreground/[0.06] hover:text-foreground'
    cancel.textContent = 'Cancel'
    cancel.addEventListener('click', (ev) => {
      ev.stopPropagation()
      handleCancelPin()
    })
    actions.append(confirm, cancel)
    const actionsMarker = new Marker({ element: actions, anchor: 'top', offset: [0, 14] })
      .setLngLat([candidatePin.lng, candidatePin.lat])
      .addTo(map)

    return () => {
      pinMarker.remove()
      actionsMarker.remove()
    }
  }, [map, candidatePin])

  // The map container is a fixed full-size element behind the overlay panels, so
  // center the target into the visible gap using padding equal to the space each
  // panel covers. Keep the current zoom if it's already visible; otherwise zoom
  // to a neighborhood-level view. No map.resize() — the container never changes.
  const centerOnTarget = useEffectEvent((animate: boolean) => {
    const el = containerRef.current
    if (!map || !el) return
    const target = selected ? { lng: selected.lng, lat: selected.lat } : pin
    if (!target) return
    const w = el.clientWidth
    const h = el.clientHeight
    const left = w >= 768 ? (sidebarCollapsed ? 48 : 280) : 0
    const right = drawerOpen ? (w >= 1024 ? Math.max(480, w * 0.45) : w) : 0
    const m = 24
    const padding = { top: m, bottom: m, left: left + m, right: right + m }
    const center: [number, number] = [target.lng, target.lat]
    const p = map.project(center)
    const visible = p.x >= padding.left && p.x <= w - padding.right && p.y >= padding.top && p.y <= h - padding.bottom
    if (visible) {
      map.easeTo({ center, padding, duration: animate ? 500 : 0 })
    } else {
      map.flyTo({ center, padding, zoom: Math.max(map.getZoom(), 12), duration: animate ? 800 : 0 })
    }
  })

  // Center on open (draft / Show on map / Replace pin), and re-center whenever a
  // panel opens/closes and changes the visible area. A frame's delay lets the
  // drawer mount first; the panels slide via transform so nothing reflows.
  useEffect(() => {
    if (!map || (!selected && !pin)) return
    const raf = requestAnimationFrame(() => centerOnTarget(true))
    return () => cancelAnimationFrame(raf)
  }, [map, selected, pin, sidebarCollapsed, drawerOpen])

  return (
    <div className="relative size-full" style={{ background: '#17171a' }}>
      <div ref={containerRef} className="size-full" style={{ background: '#17171a' }} />
      <CategoryLegend sidebarCollapsed={sidebarCollapsed} />

      {placing && !candidatePin && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border bg-surface/95 px-3 py-2 text-sm shadow-lg shadow-black/30 backdrop-blur-sm">
            <span className="text-foreground">Click the map to place the new pin</span>
            <button
              type="button"
              onClick={onCancelPin}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div key={toast.key} className="pointer-events-none absolute z-10" style={{ left: toast.x, top: toast.y }}>
          <div className="map-toast -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-md border bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-lg shadow-black/40">
            Use Replace pin to change this location.
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryLegend({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const [collapsed, setCollapsed] = usePersistentBoolean('bidgrid:legend-collapsed', false)
  const listId = 'map-category-legend'

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-3 left-3 z-10 w-44 max-w-[calc(100%-1.5rem)] transition-[left] duration-200 ease-out motion-reduce:transition-none',
        sidebarCollapsed ? 'md:left-[60px]' : 'md:left-[292px]',
      )}
    >
      <div className="pointer-events-auto overflow-hidden rounded-lg border bg-surface/90 shadow-lg shadow-black/30 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className="flex h-8 w-full items-center justify-between gap-2 px-2.5 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="eyebrow">Category</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none',
              collapsed && '-rotate-90',
            )}
          />
        </button>
        {!collapsed && (
          <ul id={listId} className="flex flex-col gap-1.5 border-t px-2.5 py-2">
            {CATEGORIES.map((category) => (
              <li key={category} className="flex items-center gap-2 text-xs text-subtle-foreground">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLORS[category] }}
                />
                <span className="truncate">{category}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
