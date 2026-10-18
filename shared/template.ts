import { addDays, diffDays } from './dates'
import { CATEGORY_COLORS, type PhaseCategory } from './types'

// Default interior fit-out template. The ORDER of this list is the real site
// sequence and is intentionally fixed — it is never re-sorted algorithmically.
// Offsets are days on a 140-day (20-week) reference schedule, end exclusive;
// they are scaled to whatever span the project actually has.
const REF_DAYS = 140

export interface TemplatePhase {
  name: string
  category: PhaseCategory
  start: number
  end: number
  rule: string
}

export const INTERIOR_TEMPLATE: TemplatePhase[] = [
  { name: 'Structure & material finalisation', category: 'Planning', start: 0, end: 14, rule: 'Design freeze, BOQ lock.' },
  { name: 'Material procurement', category: 'Planning', start: 7, end: 56, rule: 'Runs parallel to finalisation, and longer.' },
  { name: 'Preliminary putty & paper', category: 'Finishing', start: 21, end: 35, rule: 'Done BEFORE false ceiling, electrical and carpentry so their dust never spoils finished walls.' },
  { name: 'False ceiling', category: 'MEP', start: 35, end: 63, rule: 'Framing leads; electrical follows close behind.' },
  { name: 'Electrical', category: 'MEP', start: 42, end: 70, rule: 'Follows close behind ceiling framing.' },
  { name: 'Plumbing', category: 'MEP', start: 42, end: 63, rule: 'Overlaps ceiling and electrical.' },
  { name: 'Carpentry', category: 'Carpentry', start: 63, end: 105, rule: 'Starts once MEP first-fix clears; runs long and overlaps into paint.' },
  { name: 'Final paint (primer + finish, post-carpentry touch-up)', category: 'Finishing', start: 98, end: 119, rule: 'Distinct from preliminary putty & paper — do not merge.' },
  { name: 'Polish / duco (incl. cure time)', category: 'Carpentry', start: 105, end: 126, rule: 'Trails carpentry; end of bar is the cure-time buffer.' },
  { name: 'Hardware fixing', category: 'Carpentry', start: 119, end: 130, rule: 'Trails carpentry and polish.' },
  { name: 'Curtains', category: 'Finishing', start: 126, end: 133, rule: 'Near the end.' },
  { name: 'Snagging & handover', category: 'Close-out', start: 133, end: 140, rule: 'Final phase.' },
]

const INTERIOR_MILESTONES = [
  { label: 'Design freeze / BOQ lock', at: 14 },
  { label: 'MEP first-fix clear', at: 63 },
  { label: 'Cure buffer ends', at: 126 },
]

/** Scale the reference schedule onto [start, handover], both inclusive. */
export function buildInterior(start: string, handover: string) {
  const n = Math.max(diffDays(start, handover) + 1, 28)
  const scale = (d: number) => Math.round((d * n) / REF_DAYS)
  const phases = INTERIOR_TEMPLATE.map((t, i) => {
    const s = scale(t.start)
    const e = Math.max(scale(t.end) - 1, s)
    return {
      name: t.name,
      category: t.category,
      start_date: addDays(start, s),
      end_date: addDays(start, e),
      sort_order: i,
      color: CATEGORY_COLORS[t.category],
    }
  })
  const milestones = [
    ...INTERIOR_MILESTONES.map((m) => ({ label: m.label, date: addDays(start, scale(m.at)) })),
    { label: 'Handover', date: addDays(start, n - 1) },
  ]
  return { phases, milestones }
}
