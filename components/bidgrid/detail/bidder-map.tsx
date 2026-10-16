'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { BidRecord } from '@/lib/bidgrid/bidder'
import { STYLE_URL } from '@/lib/bidgrid/maplibre'
import { MapSkeleton } from './map-skeleton'

interface BidderMapProps {
  bids: BidRecord[]
  onOpenContract: (ea: string) => void
}

const COLOR = 'var(--primary)'

export function BidderMap({ bids, onOpenContract }: BidderMapProps) {
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
    // Draw lost bids first so won markers sit on top where they overlap.
    const ordered = [...bids].sort((a, b) => Number(a.won) - Number(b.won))

    const markers = ordered.map((bid) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'map-marker'
      el.dataset.hollow = String(!bid.won)
      el.style.setProperty('--c', COLOR)
      el.style.width = '12px'
      el.style.height = '12px'
      el.setAttribute('aria-label', `Open contract ${bid.ea}, ${bid.bidDate}, rank ${bid.rank}${bid.won ? ', won' : ''}`)

      const label = document.createElement('span')
      const ea = document.createElement('span')
      ea.className = 'font-mono'
      ea.dataset.morph = ''
      ea.textContent = bid.ea
      const meta = document.createElement('span')
      meta.className = 'text-muted-foreground'
      meta.textContent = ` · ${bid.bidDate} · ${bid.won ? 'won' : `#${bid.rank}`}`
      label.append(ea, meta)

      const show = () => tooltip.setLngLat([bid.lng, bid.lat]).setDOMContent(label).addTo(map)
      const hide = () => tooltip.remove()
      el.addEventListener('mouseenter', show)
      el.addEventListener('focus', show)
      el.addEventListener('mouseleave', hide)
      el.addEventListener('blur', hide)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handleOpen(bid.ea)
      })
      return new Marker({ element: el }).setLngLat([bid.lng, bid.lat]).addTo(map)
    })

    if (bids.length > 0) {
      const bounds = new LngLatBounds()
      bids.forEach((b) => bounds.extend([b.lng, b.lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 9, duration: hasFitted.current ? 400 : 0 })
      hasFitted.current = true
    }

    return () => {
      tooltip.remove()
      markers.forEach((m) => m.remove())
    }
  }, [map, bids])

  return (
    <div className="relative size-full">
      <div ref={containerRef} data-morph-scope="" className="size-full" />
      {!loaded && <MapSkeleton className="absolute inset-0" />}
    </div>
  )
}
