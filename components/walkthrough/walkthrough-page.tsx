import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// All page wording and links live here. Edit this object to change the text.
const copy = {
  brand: 'BidGrid',
  homeHref: '/',
  eyebrow: 'New to BidGrid?',
  heading: 'See how BidGrid works',
  intro: 'A short walkthrough of building an estimate: drop a pin, describe the work, and review the bid items the agent finds.',
  // Paste a YouTube or Loom *embed* link here (e.g. https://www.youtube.com/embed/VIDEO_ID).
  // While it's empty, the page shows the placeholder below instead.
  videoEmbedUrl: '',
  videoTitle: 'BidGrid walkthrough',
  placeholder: 'Video walkthrough coming soon',
  closingHeadline: 'Ready to start?',
  loginLabel: 'Log in',
  loginHref: '/login',
}

export function WalkthroughPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6">
      {/* Header */}
      <header className="flex h-14 items-center border-b">
        <Link href={copy.homeHref} className="flex items-center gap-3 rounded-md">
          <span aria-hidden="true" className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-surface p-1 ring-1 ring-border">
            <span className="rounded-[1px] bg-primary" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{copy.brand}</span>
        </Link>
      </header>

      <main className="py-12 sm:py-16">
        {/* Intro */}
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{copy.heading}</h1>
        <p className="mt-4 max-w-2xl text-subtle-foreground">{copy.intro}</p>

        {/* Video, or a placeholder until a link is added above */}
        <div className="mt-8 aspect-video overflow-hidden rounded-lg border bg-surface">
          {copy.videoEmbedUrl ? (
            <iframe
              src={copy.videoEmbedUrl}
              title={copy.videoTitle}
              className="size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <div className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
              {copy.placeholder}
            </div>
          )}
        </div>

        {/* Call to action */}
        <section className="mt-12 border-t pt-12 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">{copy.closingHeadline}</h2>
          <Link href={copy.loginHref} className={cn(buttonVariants({ size: 'lg' }), 'mt-6 px-4')}>
            {copy.loginLabel}
          </Link>
        </section>
      </main>
    </div>
  )
}
