import { cn } from '@/lib/utils'

export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('size-full bg-surface', className)}>
      <div className="size-full animate-pulse bg-foreground/[0.05] motion-reduce:animate-none" />
    </div>
  )
}
