import { FAMILY_CATEGORY, ITEM_FAMILIES, type Category, type Contract, type ItemFamily } from './data'

export const familySlug = (f: ItemFamily) => f.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const familyFromSlug = (slug: string) => ITEM_FAMILIES.find((f) => familySlug(f) === slug) ?? null

// A trailing "(LF)" / "(LS)" / "(EA)" … is the item's unit, not a descriptive
// qualifier — strip it so it isn't mistaken for the item's name.
const UNIT_PAREN = /\s*\((?:CF|CY|DAY|EA|GAL|HR|LB|LF|LNMI|LS|MFBM|MO|SQFT|SQYD|STA|TON|WDAY)\)$/i

export function shortItemName(description: string) {
  const d = description.replace(UNIT_PAREN, '')
  const afterComma = d.split(', ').slice(1).join(', ')
  const paren = d.match(/\(([^)]+)\)$/)?.[1]
  const name = afterComma || paren || d
  return name.charAt(0) + name.slice(1).toLowerCase()
}

/** Full item description (unit paren stripped), sentence-cased — for wide columns. */
export function fullItemName(description: string) {
  const d = description.replace(UNIT_PAREN, '')
  return d.charAt(0) + d.slice(1).toLowerCase()
}

const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const formatUsdCompact = (n: number) => usdCompact.format(n)
export const formatDistrict = (d: number) => `D${String(d).padStart(2, '0')}`

export const CATEGORY_COLORS: Record<Category, string> = {
  Concrete: '#a1a1aa',
  Paving: '#b391b0',
  Earthwork: '#b89c78',
  Drainage: '#5fb0b0',
  Structures: '#6f9fe0',
  'Traffic & Electrical': '#d6b54e',
  'Landscape & Erosion': '#85b27f',
  'General & Site Work': '#8f8fb0',
  Other: '#8a8a93',
}

export const FAMILY_COLORS = Object.fromEntries(
  ITEM_FAMILIES.map((f) => [f, CATEGORY_COLORS[FAMILY_CATEGORY[f]]]),
) as Record<ItemFamily, string>

const SHORT_OVERRIDES: Partial<Record<ItemFamily, string>> = {
  'Minor Concrete': 'Minor Conc.',
  'Structural Concrete': 'Structural',
  'Concrete Barrier': 'Barrier',
  'Reinforced Concrete Pipe': 'RCP',
  'Corrugated Steel Pipe': 'CSP',
  'Thermoplastic Striping': 'Striping',
  'Metal Beam Guardrail': 'Guardrail',
  'Clearing & Grubbing': 'Clearing',
  'Roadway Excavation': 'Excavation',
  'Bridge Deck & Rehab': 'Bridge Deck',
  'Piles & Shoring': 'Piles',
  'Structural Steel': 'Steel',
  'Seal Coats & Surface Treatments': 'Seal Coats',
  'Water Pollution Control': 'Water Pollution',
  'Project Overhead': 'Overhead',
  'Traffic Control': 'Traffic Ctrl',
}

export const FAMILY_SHORT = Object.fromEntries(ITEM_FAMILIES.map((f) => [f, SHORT_OVERRIDES[f] ?? f])) as Record<
  ItemFamily,
  string
>

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const qty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export const formatUsd = (n: number) => usd.format(n)
export const formatUsdWhole = (n: number) => usdWhole.format(n)
export const formatQty = (n: number) => qty.format(n)

export const formatUnitPrice = (n: number) => (n >= 100 ? usdWhole.format(n) : usd.format(n))

export function itemLabel(description: string) {
  return description.toLowerCase().replace(/(^|[\s(,])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
}

export function formatLocation(c: Contract) {
  return `${String(c.district).padStart(2, '0')}-${c.county}-${c.route}-PM ${c.postmileStart.toFixed(2)}/${c.postmileEnd.toFixed(2)}`
}
