import { NextResponse } from 'next/server'

import { getMeta } from '@/lib/bidgrid/db'

export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(getMeta())
}
