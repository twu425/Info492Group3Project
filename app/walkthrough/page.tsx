import type { Metadata } from 'next'
import { WalkthroughPage } from '@/components/walkthrough/walkthrough-page'

export const metadata: Metadata = {
  title: 'Walkthrough — BidGrid',
  description: 'A short video walkthrough of building an estimate with BidGrid.',
}

export default function Walkthrough() {
  return <WalkthroughPage />
}
