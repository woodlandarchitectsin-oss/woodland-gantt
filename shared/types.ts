export const PHASE_CATEGORIES = ['Planning', 'MEP', 'Carpentry', 'Finishing', 'Close-out'] as const
export type PhaseCategory = (typeof PHASE_CATEGORIES)[number]

export const PROJECT_CATEGORIES = ['interior fit-out', 'construction', 'renovation'] as const
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]

export const CATEGORY_COLORS: Record<PhaseCategory, string> = {
  Planning: '#5b7c99',
  MEP: '#c28a2e',
  Carpentry: '#8a5a3c',
  Finishing: '#5f8a5b',
  'Close-out': '#b0503f',
}

export interface Project {
  id: number
  name: string
  client: string
  site: string
  start_date: string
  target_handover_date: string
  category: ProjectCategory
  sequence_logic: string
  critical_path: string
  site_note: string
  /** WA-### number in Woodland Project OS; empty when the project was made here. */
  project_os_id: string
}

export interface Phase {
  id: number
  project_id: number
  name: string
  category: PhaseCategory
  start_date: string
  end_date: string
  sort_order: number
  color: string
  // from the assignments table
  assigned_worker: string
  material_incharge: string
}

export interface Milestone {
  id: number
  project_id: number
  label: string
  date: string
}

export interface ProjectListItem extends Project {
  phases: { end_date: string }[]
}

export interface ProjectDetail {
  project: Project
  phases: Phase[]
  milestones: Milestone[]
}

export type TemplateId = 'interior' | 'blank'
