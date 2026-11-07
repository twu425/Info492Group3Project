import type { Metadata } from 'next'
import { LandingPage } from '@/components/landing/landing-page'

export const metadata: Metadata = {
  title: 'BidGrid — Price heavy civil work from real bids',
  description:
    'An agent-assisted estimating tool for public heavy civil work, built on real Caltrans bid data.',
}

export default function WelcomePage() {
  return <LandingPage />
}
