import { NextRequest, NextResponse } from 'next/server'

import { listContracts } from '@/lib/bidgrid/db'
import type { ContractFilters } from '@/lib/bidgrid/contract-types'

export const dynamic = 'force-dynamic'

function parseFilters(sp: URLSearchParams): ContractFilters {
  const nums = (key: string) =>
    sp.get(key)?.split(',').map(Number).filter((n) => !Number.isNaN(n)) ?? undefined
  const list = (key: string) => sp.get(key)?.split(',').filter(Boolean) ?? undefined
  const num = (key: string) => (sp.get(key) ? Number(sp.get(key)) : undefined)
  return {
    districts: nums('districts'),
    families: list('families'),
    yearMin: num('yearMin'),
    yearMax: num('yearMax'),
    q: sp.get('q') || undefined,
  }
}

export function GET(req: NextRequest) {
  const contracts = listContracts(parseFilters(req.nextUrl.searchParams))
  return NextResponse.json({ contracts })
}
