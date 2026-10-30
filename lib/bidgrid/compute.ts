/**
 * Exact dimension → quantity arithmetic. Language models are unreliable at arithmetic and
 * quantities are the biggest source of estimate error, so the agent delegates every
 * conversion here instead of computing in its head. Pure and deterministic.
 */

export type ComputeOperation = 'area' | 'tonnage' | 'volume' | 'linear'

export interface ComputeInput {
  operation: ComputeOperation
  /** Length in feet (or give lengthMiles). */
  lengthFt?: number
  lengthMiles?: number
  widthFt?: number
  /** Multiplies the width (e.g. 2 lanes × 24 ft), default 1. */
  lanes?: number
  /** Depth/thickness in feet (tonnage and volume). */
  depthFt?: number
  /** lb per cubic foot for tonnage; defaults to compacted HMA (145). */
  densityLbPerCf?: number
  /** Supply an area directly instead of length × width. */
  areaSqft?: number
}

export interface ComputeResultOk {
  quantity: number
  unit: string
  /** Human-readable arithmetic the agent can show the user verbatim. */
  formula: string
  detail: Record<string, number>
}
export type ComputeOutput = ComputeResultOk | { error: string }

/** Compacted hot mix asphalt, lb/ft³ — a standard mix-design figure. */
export const HMA_DENSITY_LB_PER_CF = 145
const r2 = (n: number) => Math.round(n * 100) / 100

function lengthFt(i: ComputeInput): number | null {
  if (i.lengthFt != null) return i.lengthFt
  if (i.lengthMiles != null) return i.lengthMiles * 5280
  return null
}

function areaSqft(i: ComputeInput): number | null {
  if (i.areaSqft != null) return i.areaSqft
  const L = lengthFt(i)
  if (L != null && i.widthFt != null) return L * i.widthFt * (i.lanes ?? 1)
  return null
}

function areaExpr(i: ComputeInput): string {
  if (i.areaSqft != null) return `${r2(i.areaSqft)} SF`
  const L = i.lengthMiles != null ? `${i.lengthMiles} mi × 5280` : `${i.lengthFt} ft`
  const lanes = i.lanes && i.lanes !== 1 ? ` × ${i.lanes} lanes` : ''
  return `${L}${lanes} × ${i.widthFt} ft`
}

export function computeQuantity(i: ComputeInput): ComputeOutput {
  switch (i.operation) {
    case 'area': {
      const area = areaSqft(i)
      if (area == null) return { error: 'area needs areaSqft, or lengthFt (or lengthMiles) and widthFt.' }
      const sqyd = area / 9
      return {
        quantity: r2(sqyd),
        unit: 'SQYD',
        formula: `${areaExpr(i)} = ${r2(area)} SF ÷ 9 = ${r2(sqyd)} SY`,
        detail: { areaSqft: r2(area), areaSqyd: r2(sqyd) },
      }
    }
    case 'tonnage': {
      const area = areaSqft(i)
      if (area == null || i.depthFt == null) return { error: 'tonnage needs depthFt and an area (areaSqft, or length × width).' }
      const density = i.densityLbPerCf ?? HMA_DENSITY_LB_PER_CF
      const cf = area * i.depthFt
      const tons = (cf * density) / 2000
      return {
        quantity: r2(tons),
        unit: 'TON',
        formula: `${areaExpr(i)} = ${r2(area)} SF × ${i.depthFt} ft = ${r2(cf)} CF × ${density} lb/CF ÷ 2000 = ${r2(tons)} TON`,
        detail: { areaSqft: r2(area), volumeCf: r2(cf), density, tons: r2(tons) },
      }
    }
    case 'volume': {
      const area = areaSqft(i)
      if (area == null || i.depthFt == null) return { error: 'volume needs depthFt and an area (areaSqft, or length × width).' }
      const cf = area * i.depthFt
      const cy = cf / 27
      return {
        quantity: r2(cy),
        unit: 'CY',
        formula: `${areaExpr(i)} = ${r2(area)} SF × ${i.depthFt} ft = ${r2(cf)} CF ÷ 27 = ${r2(cy)} CY`,
        detail: { areaSqft: r2(area), volumeCf: r2(cf), volumeCy: r2(cy) },
      }
    }
    case 'linear': {
      const L = lengthFt(i)
      if (L == null) return { error: 'linear needs lengthFt or lengthMiles.' }
      const lf = L * (i.lanes ?? 1)
      const base = i.lengthMiles != null ? `${i.lengthMiles} mi × 5280` : `${i.lengthFt} ft`
      const lanes = i.lanes && i.lanes !== 1 ? ` × ${i.lanes}` : ''
      return {
        quantity: r2(lf),
        unit: 'LF',
        formula: `${base}${lanes} = ${r2(lf)} LF`,
        detail: { lengthFt: r2(lf) },
      }
    }
  }
}
