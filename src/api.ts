import type { Milestone, Phase, Project, ProjectDetail, ProjectListItem, TemplateId } from '../shared/types'
import { addDays, fmt, isISO, mondayOnOrBefore, parse, todayISO } from '../shared/dates'
import { buildInterior } from '../shared/template'
import { API_URL } from './config'

export type Role = 'admin' | 'team'

/** The PIN and role live only in this browser. Wrong PIN anywhere sends the person back to the sign-in screen. */
const KEY = 'wg-pin'
let role: Role | null = null
const readPin = () => {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}
let pin = readPin()

export const session = {
  hasPin: () => !!pin,
  role: () => role,
  setPin(p: string) {
    pin = p
    try {
      localStorage.setItem(KEY, p)
    } catch {
      /* private mode: stays for this tab only */
    }
  },
  signOut() {
    pin = ''
    role = null
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('wg-auth'))
  },
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let json: { ok: boolean; status: number; code?: string; error?: string; role?: Role; data: T }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ pin, method, url, body }),
      redirect: 'follow',
      signal: AbortSignal.timeout(40000),
    })
    json = await res.json()
  } catch {
    throw new Error('Could not reach the server. Check the internet connection and try again.')
  }
  if (!json.ok) {
    if (json.code === 'BAD_PIN') {
      pin = ''
      role = null
      window.dispatchEvent(new Event('wg-auth'))
    }
    throw new Error(json.error || 'Something went wrong.')
  }
  role = json.role ?? role
  return json.data
}

export type ProjectInput = Pick<Project, 'name' | 'client' | 'site' | 'start_date' | 'target_handover_date' | 'category'>

/** The site-proven phases (or just a handover flag) that a new project starts with, built here and stored by the server. */
const startingPlan = (p: ProjectInput, template: TemplateId) =>
  template === 'interior'
    ? buildInterior(p.start_date, p.target_handover_date)
    : { phases: [], milestones: [{ label: 'Handover', date: p.target_handover_date }] }

export const api = {
  /** Checks the PIN and tells us whether it may edit. */
  me: () => req<{ role: Role }>('GET', '/api/me'),
  listProjects: () => req<ProjectListItem[]>('GET', '/api/projects'),
  getProject: (id: number) => req<ProjectDetail>('GET', `/api/projects/${id}`),
  createProject: (p: ProjectInput & { template: TemplateId; project_os_id?: string }) => {
    const { template, ...rest } = p
    return req<{ id: number }>('POST', '/api/projects', { ...rest, ...startingPlan(p, template) })
  },
  updateProject: (id: number, p: Partial<Project>) => req<Project>('PUT', `/api/projects/${id}`, p),
  deleteProject: (id: number) => req<void>('DELETE', `/api/projects/${id}`),

  addPhase: (pid: number, p: Partial<Phase>) => req<Phase>('POST', `/api/projects/${pid}/phases`, p),
  updatePhase: (id: number, p: Partial<Phase>) => req<Phase>('PUT', `/api/phases/${id}`, p),
  deletePhase: (id: number) => req<void>('DELETE', `/api/phases/${id}`),
  reorderPhases: (pid: number, ids: number[]) => req<Phase[]>('PUT', `/api/projects/${pid}/phases-order`, { ids }),

  addMilestone: (pid: number, m: Pick<Milestone, 'label' | 'date'>) =>
    req<Milestone>('POST', `/api/projects/${pid}/milestones`, m),
  updateMilestone: (id: number, m: Partial<Milestone>) => req<Milestone>('PUT', `/api/milestones/${id}`, m),
  deleteMilestone: (id: number) => req<void>('DELETE', `/api/milestones/${id}`),
}

export interface OsCandidate {
  id: string
  name: string
  client: string
  location: string
  lifecycle: string
  group: string
  startDate: string
  targetDate: string
  state: 'new' | 'name-match' | 'linked'
  gantt_id: number | null
}

export const registryApi = {
  list: () => req<{ projects: OsCandidate[] }>('GET', '/api/registry'),
  /** New projects are created from Project OS's details; a same-name project here is just linked, keeping its chart. */
  async importProjects(ids: string[], template: TemplateId) {
    const { projects } = await registryApi.list()
    const nextMonday = fmt(mondayOnOrBefore(parse(todayISO())) + 7)
    const added: string[] = []
    const linked: string[] = []
    for (const p of projects.filter((x) => ids.includes(x.id) && x.state !== 'linked')) {
      if (p.state === 'name-match' && p.gantt_id !== null) {
        await api.updateProject(p.gantt_id, { project_os_id: p.id })
        linked.push(p.name)
        continue
      }
      const start = isISO(p.startDate) ? p.startDate : nextMonday
      const end = isISO(p.targetDate) && p.targetDate >= start ? p.targetDate : addDays(start, 139)
      await api.createProject({
        name: p.name.trim(),
        client: p.client,
        site: p.location,
        category: 'interior fit-out',
        start_date: start,
        target_handover_date: end,
        template,
        project_os_id: p.id,
      })
      added.push(p.name)
    }
    return { added, linked }
  },
}
