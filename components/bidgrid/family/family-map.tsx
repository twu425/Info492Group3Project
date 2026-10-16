'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Unit } from '@/lib/bidgrid/data'
import { formatQty } from '@/lib/bidgrid/format'
import { STYLE_URL } from '@/lib/bidgrid/maplibre'
import { MapSkeleton } from '../detail/map-skeleton'

export interface FamilyMapContract {
  ea: string
  lat: number
  lng: number
  year: string
  quantity: number | null
}

interface FamilyMapProps {
  contracts: FamilyMapContract[]
  color: string
  unit: Unit
  onOpenContract: (ea: string) => void
}

const MIN_SIZE = 7
const MAX_SIZE = 24

export function FamilyMap({ contracts, color, unit, onOpenContract }: FamilyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [loaded, setLoaded] = useState(false)
  const hasFitted = useRef(false)
  const handleOpen = useEffectEvent((ea: string) => onOpenContract(ea))

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const instance = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [-120.2, 36.2],
      zoom: 5,
      minZoom: 4,
      scrollZoom: false,
      fadeDuration: 0,
      attributionControl: { compact: true },
    })
    instance.once('load', () => setLoaded(true))
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right')
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
    const maxQty = Math.max(1, ...contracts.map((c) => c.quantity ?? 0))
    const sized = contracts
      .map((c) => ({
        c,
        size: c.quantity === null ? MIN_SIZE : MIN_SIZE + (MAX_SIZE - MIN_SIZE) * Math.sqrt(c.quantity / maxQty),
      }))
      .sort((a, b) => b.size - a.size)

    const markers = sized.map(({ c, size }) => {
      const qtyLabel = c.quantity === null ? 'item not bid' : `${formatQty(c.quantity)} ${unit}`
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'map-marker'
      el.dataset.sized = String(c.quantity !== null)
      el.dataset.hollow = String(c.quantity === null)
      el.style.setProperty('--c', color)
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      el.setAttribute('aria-label', `Open contract ${c.ea}, ${c.year}, ${qtyLabel}`)

      const label = document.createElement('span')
      const ea = document.createElement('span')
      ea.className = 'font-mono'
      ea.dataset.morph = ''
      ea.textContent = c.ea
      const meta = document.createElement('span')
      meta.className = 'text-muted-foreground'
      meta.textContent = ` · ${c.year} · ${qtyLabel}`
      label.append(ea, meta)

      const show = () => tooltip.setLngLat([c.lng, c.lat]).setDOMContent(label).addTo(map)
      const hide = () => tooltip.remove()
      el.addEventListener('mouseenter', show)
      el.addEventListener('focus', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('blur', hide)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handleOpen(c.ea)
      })
      return new Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(map)
    })

    if (contracts.length > 0) {
      const bounds = new LngLatBounds()
      contracts.forEach((c) => bounds.extend([c.lng, c.lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: hasFitted.current ? 400 : 0 })
      hasFitted.current = true
    }

    return () => {
      tooltip.remove()
      markers.forEach((m) => m.remove())
    }
  }, [map, contracts, color, unit])

  return (
    <div className="relative size-full">
      <div ref={containerRef} data-morph-scope="" className="size-full" />
      {!loaded && <MapSkeleton className="absolute inset-0" />}
    </div>
  )
}
