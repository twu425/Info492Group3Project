// Server only: questions and the activity log for the roles demo, kept in data/roles-store.json
// (gitignored). Simple on purpose: one small JSON file, read and rewritten on each change.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AskableKind, Evidence, Role, Topic } from '@/lib/roles'

export type QuestionStatus = 'with_gc' | 'with_designer' | 'answered'
export type DraftedBy = 'assistant' | 'person'

export interface QuestionMessage {
  from: Role
  to: Role
  kind: 'question' | 'forward' | 'answer'
  body: string
  draftedBy: DraftedBy
  /** True when a person changed the assistant's draft before sending. */
  edited: boolean
  time: string
}

export interface Question {
  id: string
  itemCode?: string
  itemDescription?: string
  findingKind: AskableKind
  findingMessage: string
  topic: Topic
  status: QuestionStatus
  /** Past-bid summary only. The sub's own prices are never stored. */
  evidence: Evidence | null
  messages: QuestionMessage[]
}

export interface LogEntry {
  time: string
  role: Role
  action: 'ask' | 'forward' | 'answer'
  questionId: string
  draftedBy: DraftedBy
  edited: boolean
}

export interface Store {
  questions: Question[]
  log: LogEntry[]
}

const FILE = path.join(process.cwd(), 'data', 'roles-store.json')

export async function readStore(): Promise<Store> {
  try {
    const parsed = JSON.parse(await readFile(FILE, 'utf8')) as Partial<Store>
    return { questions: parsed.questions ?? [], log: parsed.log ?? [] }
  } catch {
    return { questions: [], log: [] }
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
