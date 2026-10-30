import { computeItemStats } from '@/lib/bidgrid/item-stats-db'

/** Per-item stat cards, computed on the server from bidgrid.db. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code || !/^[A-Za-z0-9]{1,20}$/.test(code)) {
    return Response.json({ error: 'A valid item code is required.' }, { status: 400 })
  }
  return Response.json(computeItemStats(code))
}
