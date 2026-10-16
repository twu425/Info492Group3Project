import { FAMILY_CATEGORY, ITEM_FAMILIES, type Category, type Contract, type ItemFamily } from './data'

export const familySlug = (f: ItemFamily) => f.toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const familyFromSlug = (slug: string) => ITEM_FAMILIES.find((f) => familySlug(f) === slug) ?? null

export function shortItemName(description: string) {
  const afterComma = description.split(', ').slice(1).join(', ')
  const paren = description.match(/\(([^)]+)\)$/)?.[1]
  const name = afterComma || paren || description
  return name.charAt(0) + name.slice(1).toLowerCase()
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
