/** Open-ended data-question cases for the queryBids eval, with reference answers
 *  computed directly from the full DB (no leave-one-out — these are global stats). */
import Database from 'better-sqlite3'

export interface QuestionCase {
  id: string
  question: string
  kind: 'number' | 'string'
  /** Ground-truth answer computed from the DB. */
  reference: (db: Database.Database) => number | string
  /** Human-readable note on how the reference is computed. */
  referenceSql: string
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export const QUESTIONS: QuestionCase[] = [
  {
    id: 'median-hma-d2',
    question:
      'In the bid data, what is the median low-bid unit price for Hot Mix Asphalt Type A (item code 390132) in District 2?',
    kind: 'number',
    referenceSql: "median(unit_price) from line_items join contracts where item_code='390132' and bidder_rank=1 and district=2",
    reference: (db) => {
      const rows = db
        .prepare(
          "SELECT li.unit_price p FROM line_items li JOIN contracts c ON c.ea=li.contract_ea WHERE li.item_code='390132' AND li.bidder_rank=1 AND c.district=2",
        )
        .all() as { p: number }[]
      return median(rows.map((r) => r.p))
    },
  },
  {
    id: 'top-paving-firm',
    question: 'Which firm won the most paving contracts?',
    kind: 'string',
    referenceSql: "contracts where project_type='Paving' group by low_bidder order by count desc limit 1",
    reference: (db) =>
      (db
        .prepare("SELECT low_bidder, COUNT(*) n FROM contracts WHERE project_type='Paving' GROUP BY low_bidder ORDER BY n DESC, low_bidder LIMIT 1")
        .get() as { low_bidder: string }).low_bidder,
  },
  {
    id: 'avg-bidders-structures',
    question: 'On average, how many bidders are on structures contracts?',
    kind: 'number',
    referenceSql: "avg(num_bidders) from contracts where project_type='Structures'",
    reference: (db) =>
      (db.prepare("SELECT AVG(num_bidders) a FROM contracts WHERE project_type='Structures'").get() as { a: number }).a,
  },
  {
    id: 'count-d7',
    question: 'How many contracts in the data were bid in District 7?',
    kind: 'number',
    referenceSql: 'count(*) from contracts where district=7',
    reference: (db) => (db.prepare('SELECT COUNT(*) n FROM contracts WHERE district=7').get() as { n: number }).n,
  },
  {
    id: 'distinct-firms',
    question: 'How many distinct contractors placed bids across all contracts in the data?',
    kind: 'number',
    referenceSql: 'count(distinct name) from bidders',
    reference: (db) => (db.prepare('SELECT COUNT(DISTINCT name) n FROM bidders').get() as { n: number }).n,
  },
]
