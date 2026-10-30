/**
 * Unit tests for locatePostmiles with a mocked Caltrans FeatureServer (no network).
 * Run: npx tsx eval/harness/postmiles.test.ts
 */
import { _clearPostmileCache, locatePostmiles, type LocatePostmilesOutput } from '../../lib/bidgrid/postmiles'

type Feature = { attributes: Record<string, string | number | null>; geometry?: { x: number; y: number } }

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ` — ${detail ?? ''}`}`)
  if (!cond) failures++
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

/* ---------- Mock fixtures ---------- */

// LAS Route 139, PM 16.0–24.0. Coordinates interpolate begin→end; Odometer rises by
// 0.994375/mi so max−min over the 8-mile span = 7.955 (a slight realignment under 5%).
const LAS_BEGIN = { lat: 40.5506, lng: -120.6308 }
const LAS_END = { lat: 40.657, lng: -120.6574 }
function lasFeatures(): Feature[] {
  const feats: Feature[] = []
  const steps = 80 // PM 16.0 → 24.0 by 0.1
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const pm = 16 + t * 8
    const lat = LAS_BEGIN.lat + t * (LAS_END.lat - LAS_BEGIN.lat)
    const lng = LAS_BEGIN.lng + t * (LAS_END.lng - LAS_BEGIN.lng)
    const odometer = 100 + (pm - 16) * (7.955 / 8)
    // A divided-highway tenth: Left and Right vertices that average back to (lat,lng).
    feats.push({ attributes: { County: 'LAS', Route: 139, PMPrefix: '', PM: pm, AlignCode: 'Left', Odometer: odometer }, geometry: { x: lng - 0.0002, y: lat + 0.0001 } })
    feats.push({ attributes: { County: 'LAS', Route: 139, PMPrefix: '', PM: pm, AlignCode: 'Right', Odometer: odometer }, geometry: { x: lng + 0.0002, y: lat - 0.0001 } })
  }
  return feats
}

// Pin with two routes nearby (50 and 49), Route 50 closest.
function twoRouteFeatures(): Feature[] {
  return [
    { attributes: { County: 'ED', Route: 50, PMPrefix: '', PM: 9.0, AlignCode: '', Odometer: 9 }, geometry: { x: -120.7505, y: 38.7347 } },
    { attributes: { County: 'ED', Route: 50, PMPrefix: '', PM: 9.1, AlignCode: '', Odometer: 9.1 }, geometry: { x: -120.7515, y: 38.7352 } },
    { attributes: { County: 'ED', Route: 49, PMPrefix: '', PM: 3.2, AlignCode: '', Odometer: 3.2 }, geometry: { x: -120.7525, y: 38.7360 } },
  ]
}

function installFetch(dispatch: (params: URLSearchParams) => unknown | Promise<unknown>) {
  globalThis.fetch = (async (url: string | URL) => {
    const u = typeof url === 'string' ? url : url.toString()
    const params = new URLSearchParams(u.split('?')[1] ?? '')
    const body = await dispatch(params)
    return { ok: true, status: 200, json: async () => body } as Response
  }) as typeof fetch
}

/* ---------- Tests ---------- */

async function run() {
  const realFetch = globalThis.fetch

  // 1. LAS Route 139 segment (county + route given, so no pin lookup).
  _clearPostmileCache()
  installFetch((p) => (p.has('where') ? { features: lasFeatures() } : { features: [] }))
  const las = (await locatePostmiles({ county: 'LAS', route: 139, beginPm: 16.0, endPm: 24.0 }, LAS_BEGIN)) as Extract<LocatePostmilesOutput, { warnings: string[] }>
  console.log('LAS Route 139 PM 16.0–24.0:')
  check('no error', !('error' in las))
  check('county LAS', las.county === 'LAS', las.county)
  check('route 139', las.route === 139)
  check('district 2 (Lassen)', las.district === 2, String(las.district))
  check('has segment', !!las.segment)
  if (las.segment) {
    const s = las.segment
    check('lengthMi ≈ 7.955', near(s.lengthMi, 7.955, 0.002), String(s.lengthMi))
    check('begin ≈ (40.5506, -120.6308)', near(s.begin.lat, 40.5506, 0.001) && near(s.begin.lng, -120.6308, 0.001), `${s.begin.lat},${s.begin.lng}`)
    check('end ≈ (40.6570, -120.6574)', near(s.end.lat, 40.657, 0.001) && near(s.end.lng, -120.6574, 0.001), `${s.end.lat},${s.end.lng}`)
    check('pmDifference = 8', near(s.pmDifference, 8, 0.001), String(s.pmDifference))
    check('points thinned to ≤ 50', s.points.length <= 50, String(s.points.length))
    check('no realignment warning (<5%)', !las.warnings.some((w) => w.includes('realigned')), las.warnings.join(' | '))
  }

  // 2. Pin near two routes → candidates, no segment.
  _clearPostmileCache()
  installFetch((p) => (p.has('geometry') ? { features: twoRouteFeatures() } : { features: [] }))
  const cand = (await locatePostmiles({}, { lat: 38.7347, lng: -120.7505 })) as Extract<LocatePostmilesOutput, { warnings: string[] }>
  console.log('Pin near two routes:')
  check('no error', !('error' in cand))
  check('has candidates', !!cand.candidates && cand.candidates.length === 2, String(cand.candidates?.length))
  check('closest route is 50', cand.route === 50, String(cand.route))
  check('no segment (asks which route)', !cand.segment)
  check('pin lookup populated', !!cand.pin && cand.pin.nearestPm === 9.0)

  // 3. Postmile not found → warning, no segment.
  _clearPostmileCache()
  installFetch(() => ({ features: [] }))
  const miss = (await locatePostmiles({ county: 'ED', route: 50, beginPm: 999 }, { lat: 38.73, lng: -120.75 })) as Extract<LocatePostmilesOutput, { warnings: string[] }>
  console.log('Postmile not found:')
  check('no error', !('error' in miss))
  check('no segment', !miss.segment)
  check('warns not found', miss.warnings.some((w) => w.toLowerCase().includes('no postmile found')), miss.warnings.join(' | '))

  // 4. API timeout → { error }.
  _clearPostmileCache()
  globalThis.fetch = (async () => {
    const e = new Error('aborted')
    e.name = 'AbortError'
    throw e
  }) as typeof fetch
  const timeout = await locatePostmiles({ county: 'ED', route: 50, beginPm: 9, endPm: 10 }, { lat: 38.73, lng: -120.75 })
  console.log('API timeout:')
  check('returns error', 'error' in timeout)
  check('error mentions timeout', 'error' in timeout && /timed out/.test(timeout.error), 'error' in timeout ? timeout.error : '')

  globalThis.fetch = realFetch
  console.log(failures === 0 ? '\nPASS — postmiles unit tests' : `\nFAIL — ${failures} assertion(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

run()
