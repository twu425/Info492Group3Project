import { NextRequest, NextResponse } from 'next/server'

import { getContract } from '@/lib/bidgrid/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ ea: string }> }) {
  const { ea } = await params
  const contract = getContract(decodeURIComponent(ea))
  if (!contract) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ contract })
}
