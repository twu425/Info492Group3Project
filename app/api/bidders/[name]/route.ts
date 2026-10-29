import { NextRequest, NextResponse } from 'next/server'

import { getBidder } from '@/lib/bidgrid/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const bidder = getBidder(decodeURIComponent(name))
  if (!bidder) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ bidder })
}
