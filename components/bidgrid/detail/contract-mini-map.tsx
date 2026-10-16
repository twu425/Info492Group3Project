'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { STYLE_URL } from '@/lib/bidgrid/maplibre'
import { MapSkeleton } from './map-skeleton'

interface ContractMiniMapProps {
  lat: number
  lng: number
  color: string
  label: string
}

export function ContractMiniMap({ lat, lng, color, label }: ContractMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: [lng, lat],
      zoom: 9.5,
      interactive: false,
      fadeDuration: 0,
      attributionControl: { compact: true },
    })
    map.once('load', () => setLoaded(true))
    const el = document.createElement('div')
    el.className = 'map-marker'
    el.dataset.selected = 'true'
    el.style.setProperty('--c', color)
    new Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      map.remove()
    }
  }, [lat, lng, color])

  return (
    <div className="relative size-full">
      <div ref={containerRef} role="img" aria-label={label} className="size-full" />
      {!loaded && <MapSkeleton className="absolute inset-0" />}
    </div>
  )
}
