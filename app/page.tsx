import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/landing/landing-page'

export const metadata: Metadata = {
  title: 'BidGrid — Price heavy civil work from real bids',
  description:
    'An agent-assisted estimating tool for public heavy civil work, built on real Caltrans bid data.',
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ea?: string | string[] }> }) {
  // The explorer used to live at "/", so old shared contract links (/?ea=...) go to its new address.
  const { ea } = await searchParams
  if (typeof ea === 'string') redirect(`/explore?ea=${encodeURIComponent(ea)}`)

  return <LandingPage />
}
