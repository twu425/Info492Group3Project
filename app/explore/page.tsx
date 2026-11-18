import { Explorer } from '@/components/bidgrid/explorer'

export default async function Page({ searchParams }: { searchParams: Promise<{ ea?: string | string[]; draft?: string | string[] }> }) {
  const { ea, draft } = await searchParams
  return <Explorer initialEa={typeof ea === 'string' ? ea : null} initialDraftId={typeof draft === 'string' ? draft : null} />
}
