'use client'

import { cn } from '@/lib/utils'

interface BidderLinkProps {
  name: string
  onOpen: (name: string) => void
  className?: string
  title?: string
}

/**
 * A bidder name that opens the Bidder view. Carries the morph attributes the
 * detail modal uses to fly the label into the header, and stops propagation so
 * it works inside clickable table rows and list items.
 */
export function BidderLink({ name, onOpen, className, title }: BidderLinkProps) {
  return (
    <button
      type="button"
      data-morph-host=""
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(name)
      }}
      className={cn(
        'rounded-sm text-left transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none',
        className,
      )}
    >
      <span data-morph="">{name}</span>
    </button>
  )
}
