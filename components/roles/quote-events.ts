'use client'

import { useEffect, useRef } from 'react'

// A finding in the Build chat asks the Build drawer to open the quote form for one item.
// A browser event keeps the chat and the drawer from needing new props between them.
const EVENT = 'bidgrid:request-quote'

export function askForQuote(itemCode: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: itemCode }))
}

export function useQuoteAsks(onAsk: (itemCode: string) => void) {
  const latest = useRef(onAsk)
  latest.current = onAsk
  useEffect(() => {
    const listener = (e: Event) => latest.current((e as CustomEvent<string>).detail)
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [])
}
