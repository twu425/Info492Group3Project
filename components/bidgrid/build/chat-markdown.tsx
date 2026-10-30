'use client'

import Markdown, { defaultUrlTransform, type Components } from 'react-markdown'

// react-markdown strips unknown URL schemes by default (anti-injection); keep our custom
// `ea:` contract links, and sanitize everything else as usual.
const urlTransform = (url: string) => (url.startsWith('ea:') ? url : defaultUrlTransform(url))

/** A specific Caltrans EA, e.g. 03-0N9104. */
const EA_RE = /\b\d{2}-[0-9A-Z]{5,7}\b/g

/**
 * Turn bare EAs in prose into clickable links as a fallback, without touching EAs that are
 * already inside a markdown link target (…](ea:03-0N9104)) — those are preceded by ":".
 */
function linkifyEas(text: string): string {
  return text.replace(/(^|[\s(])(\d{2}-[0-9A-Z]{5,7})\b/g, (_m, pre: string, ea: string) => `${pre}[${ea}](ea:${ea})`)
}

/**
 * Renders assistant chat text as markdown (bold, lists, links, code). A link whose target is
 * `ea:<EA>` opens that contract's detail view instead of navigating; other links open in a tab.
 */
export function ChatMarkdown({
  text,
  onOpenContract,
}: {
  text: string
  onOpenContract?: (ea: string) => void
}) {
  const components: Components = {
    p: ({ children }) => <p className="text-sm leading-relaxed text-foreground">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="my-0.5 ml-4 list-disc space-y-0.5 text-sm leading-relaxed text-foreground">{children}</ul>,
    ol: ({ children }) => <ol className="my-0.5 ml-4 list-decimal space-y-0.5 text-sm leading-relaxed text-foreground">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5">{children}</li>,
    code: ({ children }) => (
      <code className="rounded bg-foreground/[0.06] px-1 py-0.5 font-mono text-[12px]">{children}</code>
    ),
    a: ({ href, children }) => {
      const ea = href?.startsWith('ea:') ? href.slice(3) : undefined
      if (ea && onOpenContract) {
        return (
          <button
            type="button"
            onClick={() => onOpenContract(ea)}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {children}
          </button>
        )
      }
      if (ea) return <>{children}</> // no handler: show the label as plain text
      return (
        <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
          {children}
        </a>
      )
    },
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Markdown components={components} urlTransform={urlTransform}>
        {linkifyEas(text)}
      </Markdown>
    </div>
  )
}
