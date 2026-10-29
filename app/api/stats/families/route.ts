import { NextRequest, NextResponse } from 'next/server'

import { familyStats } from '@/lib/bidgrid/db'
import type { ContractFilters } from '@/lib/bidgrid/contract-types'

export const dynamic = 'force-dynamic'

export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const filters: ContractFilters = {
    districts: sp.get('districts')?.split(',').map(Number).filter((n) => !Number.isNaN(n)),
    families: sp.get('families')?.split(',').filter(Boolean),
    yearMin: sp.get('yearMin') ? Number(sp.get('yearMin')) : undefined,
    yearMax: sp.get('yearMax') ? Number(sp.get('yearMax')) : undefined,
    q: sp.get('q') || undefined,
  }
  return NextResponse.json({ families: familyStats(filters) })
}
