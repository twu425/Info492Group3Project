import { Explorer } from '@/components/bidgrid/explorer'

export default async function Page({ searchParams }: { searchParams: Promise<{ ea?: string | string[] }> }) {
  const { ea } = await searchParams
  return <Explorer initialEa={typeof ea === 'string' ? ea : null} />
}
