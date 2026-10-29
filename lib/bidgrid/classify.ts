import type { ItemFamily } from './data'

/**
 * Classify a Caltrans bid item into one of the UI's item families.
 *
 * Primary signal is the item code, whose leading digits track the Standard
 * Specifications section (39xxxx = HMA, 51xxxx = structural concrete, …). A few
 * light description-keyword rules catch the reorganized "01/03/04" code ranges
 * that span many families. Anything unrecognized falls into 'Other'.
 *
 * Rules are evaluated in order, most specific first.
 */

type Rule = [test: (code: string, desc: string) => boolean, family: ItemFamily]

const starts = (...prefixes: string[]) => (code: string) =>
  prefixes.some((p) => code.startsWith(p))

const CODE_RULES: Rule[] = [
  // --- Paving ---
  [(c, d) => c.startsWith('39') && /RUBBERIZED/.test(d), 'Rubberized HMA'],
  [starts('39'), 'Hot Mix Asphalt'],
  [starts('40', '41', '42'), 'PCC Pavement'],
  [starts('153'), 'Cold Planing'],
  [starts('25', '26', '28', '29'), 'Aggregate Base'],
  [starts('30', '37'), 'Seal Coats & Surface Treatments'],
  // --- Earthwork ---
  [starts('193', '198'), 'Embankment'],
  [starts('19'), 'Roadway Excavation'],
  [starts('16', '17'), 'Clearing & Grubbing'],
  // --- Concrete / structures ---
  [starts('73'), 'Minor Concrete'],
  [starts('51', '53'), 'Structural Concrete'],
  [starts('52'), 'Reinforcing Steel'],
  [starts('48', '49', '57'), 'Piles & Shoring'],
  [starts('55', '59', '75'), 'Structural Steel'],
  [starts('46', '47'), 'Retaining Wall'],
  [starts('58'), 'Sound Wall'],
  [starts('60'), 'Bridge Deck & Rehab'],
  // --- Barriers & guardrail (83 = railings/barriers) ---
  [starts('839'), 'Concrete Barrier'],
  [starts('832', '833', '835'), 'Metal Beam Guardrail'],
  [starts('80'), 'Fencing'],
  // --- Drainage ---
  [starts('65', '61'), 'Reinforced Concrete Pipe'],
  [starts('66', '69'), 'Corrugated Steel Pipe'],
  [starts('70'), 'Drainage Inlets'],
  // --- Traffic & electrical ---
  [starts('84'), 'Thermoplastic Striping'],
  [starts('81'), 'Pavement Markers'],
  [starts('82', '56'), 'Roadside Signs'],
  [(c, d) => starts('77')(c) || (starts('86', '87')(c) && /LIGHTING/.test(d) && !/SIGNAL/.test(d)), 'Lighting'],
  [starts('86', '87'), 'Traffic Signals'],
  // --- Landscape & erosion ---
  [starts('21', '72'), 'Erosion Control'],
  [starts('206', '208'), 'Irrigation'],
  [starts('20', '204'), 'Planting'],
  // --- General & site work ---
  [starts('12'), 'Traffic Control'],
  [starts('13'), 'Water Pollution Control'],
  [starts('08', '09'), 'Project Overhead'],
  [starts('99'), 'Mobilization'],
]

// Fallback: keyword scan for the reorganized code ranges (01/03/04) that carry no section signal.
const KEYWORD_RULES: Rule[] = [
  [(_, d) => /RUBBERIZED/.test(d), 'Rubberized HMA'],
  [(_, d) => /(HOT MIX ASPHALT|\bHMA\b|ASPHALT CONCRETE)/.test(d), 'Hot Mix Asphalt'],
  [(_, d) => /COLD PLANE/.test(d), 'Cold Planing'],
  [(_, d) => /MICRO-?SURFACING|SLURRY SEAL|SEAL COAT|HIGH FRICTION/.test(d), 'Seal Coats & Surface Treatments'],
  [(_, d) => /SOLDIER PILE|SHORING|LAGGING|GROUND ANCHOR|SOIL NAIL/.test(d), 'Piles & Shoring'],
  [(_, d) => /POLYESTER CONCRETE OVERLAY|BRIDGE DECK/.test(d), 'Bridge Deck & Rehab'],
  [(_, d) => /STRUCTURAL STEEL/.test(d), 'Structural Steel'],
  [(_, d) => /GUARDRAIL|GUARD RAIL|MIDWEST/.test(d), 'Metal Beam Guardrail'],
  [(_, d) => /CONCRETE BARRIER/.test(d), 'Concrete Barrier'],
  [(_, d) => /MINOR CONCRETE|CURB RAMP|SIDEWALK|CURB AND GUTTER/.test(d), 'Minor Concrete'],
  [(_, d) => /STRUCTURAL CONCRETE/.test(d), 'Structural Concrete'],
  [(_, d) => /THERMOPLASTIC|TRAFFIC STRIPE|PAVEMENT MARKING/.test(d), 'Thermoplastic Striping'],
  [(_, d) => /REINFORCING STEEL|REINFORCEMENT/.test(d), 'Reinforcing Steel'],
  [(_, d) => /\bFENCE\b|FENCING/.test(d), 'Fencing'],
  [(_, d) => /MOBILIZATION/.test(d), 'Mobilization'],
  [(_, d) => /TRAFFIC CONTROL|TEMPORARY BARRIER|CONSTRUCTION AREA/.test(d), 'Traffic Control'],
  [(_, d) => /WATER POLLUTION|SWPPP|JOB SITE MANAGEMENT|STORM WATER|STORMWATER/.test(d), 'Water Pollution Control'],
  [(_, d) => /EROSION|FIBER ROLL|HYDROSEED|HYDROMULCH|ROCK SLOPE/.test(d), 'Erosion Control'],
]

export function classifyFamily(itemCode: string, description: string): ItemFamily {
  const code = itemCode.trim()
  const desc = (description || '').toUpperCase()
  for (const [test, family] of CODE_RULES) if (test(code, desc)) return family
  for (const [test, family] of KEYWORD_RULES) if (test(code, desc)) return family
  return 'Other'
}
