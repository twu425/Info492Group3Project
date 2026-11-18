// Server only: quote requests and the activity log for the roles demo, kept in data/quote-store.json
// (gitignored). Simple on purpose: one small JSON file, read and rewritten on each change.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RequestItem, Role } from '@/lib/roles'

/** sent: waiting on the sub · needs_info: the sub asked a question · quoted: prices are back · closed: every price decided. */
export type RequestStatus = 'sent' | 'needs_info' | 'quoted' | 'closed'
export type DraftedBy = 'assistant' | 'person'

export interface ExchangeMessage {
  from: Role
  kind: 'request' | 'clarify' | 'reply' | 'quote'
  body: string
  draftedBy: DraftedBy
  /** True when a person changed the assistant's draft before sending. */
  edited: boolean
  time: string
}

export interface Quote {
  /** The sub's unit price per item id. Items the sub left blank aren't quoted. */
  prices: Record<string, number>
  notes: string
  /** The assistant's short read of the quote for the estimator, or null if it couldn't write one. */
  summary: string | null
  time: string
}

export interface QuoteRequest {
  id: string
  estimateId: string
  estimateName: string
  location: string
  scope: string[]
  items: RequestItem[]
  status: RequestStatus
  messages: ExchangeMessage[]
  quote: Quote | null
  /** The estimator's decision per quoted item id. */
  decisions: Record<string, 'used' | 'declined'>
  createdAt: string
}

export type LogAction = 'request' | 'clarify' | 'reply' | 'quote' | 'use' | 'decline'

export interface LogEntry {
  time: string
  role: Role
  action: LogAction
  requestId: string
  draftedBy: DraftedBy
  edited: boolean
  /** Short extra detail, such as the item a price was used for. */
  detail?: string
}

export interface Store {
  requests: QuoteRequest[]
  log: LogEntry[]
}

const FILE = path.join(process.cwd(), 'data', 'quote-store.json')

export async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(FILE, 'utf8')) as Partial<Store>
    return { requests: parsed.requests ?? [], log: parsed.log ?? [] }
  } catch {
    return { requests: [], log: [] }
  }
}

async function writeStore(store: Store) {
  await mkdir(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  await writeFile(tmp, JSON.stringify(store, null, 2))
  await rename(tmp, FILE)
}

// Changes run one at a time, so two quick clicks can't overwrite each other.
let queue: Promise<unknown> = Promise.resolve()

/** Reads the store, applies `change`, and saves. If `change` throws, nothing is saved. */
export function updateStore<T>(change: (store: Store) => T): Promise<T> {
  const run = queue.then(async () => {
    const store = await readStore()
    const result = change(store)
    await writeStore(store)
    return result
  })
  queue = run.catch(() => {})
  return run
}
