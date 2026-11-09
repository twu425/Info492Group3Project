'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

// All page wording and links live here. Edit this object to change the text.
const copy = {
  brand: 'BidGrid',
  homeHref: '/',
  heading: 'Log in to BidGrid',
  subhead: 'Pick up where you left off on your estimates.',
  emailLabel: 'Email or username',
  passwordLabel: 'Password',
  submitLabel: 'Log in',
  // Demo login: any values are accepted, then the user goes here.
  afterLoginHref: '/explore',
}

const inputClass =
  'mt-1.5 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground'

export function LoginPage() {
  const router = useRouter()

  // Demo only: nothing is checked, stored, or sent anywhere. The browser's `required`
  // check makes sure both fields are filled in before this runs.
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    router.push(copy.afterLoginHref)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href={copy.homeHref} className="mx-auto flex w-fit items-center gap-3 rounded-md">
          <span aria-hidden="true" className="grid size-6 grid-cols-2 gap-0.5 rounded-md bg-surface p-1 ring-1 ring-border">
            <span className="rounded-[1px] bg-primary" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
            <span className="rounded-[1px] bg-subtle-foreground/40" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{copy.brand}</span>
        </Link>

        <div className="mt-8 rounded-lg border bg-surface p-6">
          <h1 className="text-xl font-semibold tracking-tight">{copy.heading}</h1>
          <p className="mt-1 text-sm text-subtle-foreground">{copy.subhead}</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                {copy.emailLabel}
              </label>
              <input id="email" name="email" type="text" autoComplete="username" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">
                {copy.passwordLabel}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className={inputClass}
              />
            </div>
            <Button type="submit" size="lg" className="w-full">
              {copy.submitLabel}
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
