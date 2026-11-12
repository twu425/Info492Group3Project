import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// All page wording and figures live here. Edit this object to change the text.
const copy = {
  brand: 'BidGrid',
  loginLabel: 'Log in',
  loginHref: '/login',
  newToBidGrid: 'New to BidGrid?',
  walkthroughLabel: 'Watch the walkthrough',
  walkthroughHref: '/walkthrough',

  hero: {
    eyebrow: 'For heavy civil estimators',
    headline: 'Price public heavy civil work from real bids, not guesswork.',
    subhead:
      'Describe your project and an agent finds comparable past Caltrans bid items nearby, then turns them into a bid item list you can check and edit.',
  },

  thesis: {
    eyebrow: "What we're testing",
    quote:
      'We claim that an agent-assisted tool that retrieves comparable past bid items, adjusts them for location and site conditions, and presents them as editable price ranges, can measurably reduce estimate error on public heavy civil projects.',
  },

  howItWorks: {
    eyebrow: 'How it works',
    steps: [
      {
        title: 'Describe the work',
        body: 'Drop a pin on the map and tell the agent what the project involves.',
      },
      {
        title: 'Get comparable items',
        body: 'The agent finds comparable past bid items from within 50 miles of your project.',
      },
      {
        title: 'Make the estimate yours',
        body: 'Edit quantities and unit prices against the P25–P75 market range, then export to CSV.',
      },
    ],
  },

  data: {
    eyebrow: 'Built on real Caltrans bids',
    figures: [
      { value: '239', label: 'contracts' },
      { value: '73,832', label: 'line-item bid rows' },
      { value: '12', label: 'Caltrans districts' },
      { value: 'Jan–Sep 2026', label: 'bid dates' },
    ],
  },

  closing: {
    headline: 'Start your next estimate from real bids.',
  },
}

function LoginButton({ className }: { className?: string }) {
  return (
    <Link href={copy.loginHref} className={cn(buttonVariants({ size: 'lg' }), 'px-4', className)}>
      {copy.loginLabel}
    </Link>
  )
}

function WalkthroughLink({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-subtle-foreground', className)}>
      {copy.newToBidGrid}{' '}
      <Link href={copy.walkthroughHref} className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline">
        {copy.walkthroughLabel} →
      </Link>
    </p>
  )
}

export function LandingPage() {
  return (
    <div>
      {/* Header: line runs edge to edge, content sits in the same centred column as the page */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <span className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-surface p-1 ring-1 ring-border">
              <span className="rounded-[1px] bg-primary" />
              <span className="rounded-[1px] bg-subtle-foreground/40" />
              <span className="rounded-[1px] bg-subtle-foreground/40" />
              <span className="rounded-[1px] bg-subtle-foreground/40" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">{copy.brand}</span>
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        {/* Hero: value proposition */}
        <section className="py-16 sm:py-24">
          <p className="eyebrow">{copy.hero.eyebrow}</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {copy.hero.headline}
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg text-subtle-foreground">{copy.hero.subhead}</p>
          <LoginButton className="mt-8" />
          <WalkthroughLink className="mt-4" />
        </section>

        {/* Thesis */}
        <section className="border-t py-12">
          <h2 className="eyebrow">{copy.thesis.eyebrow}</h2>
          <blockquote className="mx-auto mt-4 max-w-4xl text-lg sm:text-xl">
            {copy.thesis.quote}
          </blockquote>
        </section>

        {/* How it works */}
        <section className="border-t py-12">
          <h2 className="eyebrow">{copy.howItWorks.eyebrow}</h2>
          <ol className="mt-6 grid gap-8 sm:grid-cols-3">
            {copy.howItWorks.steps.map((step, index) => (
              <li key={step.title}>
                <p className="font-mono text-sm text-primary">{index + 1}</p>
                <h3 className="mt-2 font-medium">{step.title}</h3>
                <p className="mt-2 text-sm text-subtle-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Data figures */}
        <section className="border-t py-12">
          <h2 className="eyebrow">{copy.data.eyebrow}</h2>
          <dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {copy.data.figures.map((figure) => (
              <div key={figure.label} className="flex flex-col-reverse gap-1">
                <dt className="text-sm text-subtle-foreground">{figure.label}</dt>
                <dd className="text-2xl font-semibold tracking-tight">{figure.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Closing call to action */}
        <section className="border-t py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">{copy.closing.headline}</h2>
          <LoginButton className="mt-6" />
        </section>
      </main>
    </div>
  )
}
