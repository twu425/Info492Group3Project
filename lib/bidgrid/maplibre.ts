import { setWorkerUrl } from 'maplibre-gl'

// OpenFreeMap needs no key; set NEXT_PUBLIC_MAPTILER_KEY to use MapTiler's dataviz-dark style instead.
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY
export const STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`
  : 'https://tiles.openfreemap.org/styles/dark'

// Turbopack can't resolve MapLibre's bundled worker, so serve a copy from /public (re-copy after upgrading maplibre-gl).
setWorkerUrl('/maplibre-gl-worker.mjs')
