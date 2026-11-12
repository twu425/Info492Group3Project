'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ROLE_ORDER, ROLES, type Role } from '@/lib/roles'
import { setRole } from '@/components/roles/use-role'

// All page wording and links live here. Edit this object to change the text.
// Role names and descriptions live in lib/roles.ts.
const copy = {
  brand: 'BidGrid',
  homeHref: '/',
  heading: 'Log in to BidGrid',
  subhead: 'Choose your role to continue.',
}

export function LoginPage() {
  const router = useRouter()

  // Demo only: no accounts or passwords. The chosen role is kept in a cookie,
  // then the user goes to that role's starting page.
  function chooseRole(role: Role) {
    setRole(role)
    router.push(ROLES[role].home)
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
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

          <ul className="mt-6 space-y-3">
            {ROLE_ORDER.map((role) => (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => chooseRole(role)}
                  className="w-full rounded-md border bg-background px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-foreground/[0.03]"
                >
                  <span className="block text-sm font-medium">{ROLES[role].label}</span>
                  <span className="mt-0.5 block text-sm text-subtle-foreground">{ROLES[role].description}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
