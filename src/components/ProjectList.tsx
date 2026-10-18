import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtLong, todayISO } from '../../shared/dates'
import type { ProjectListItem } from '../../shared/types'
import ProjectForm from './ProjectForm'
import OsImport from './OsImport'

export const percentComplete = (phases: { end_date: string }[]) => {
  if (!phases.length) return 0
  const today = todayISO()
  return Math.round((phases.filter((p) => p.end_date < today).length / phases.length) * 100)
}

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const load = () => api.listProjects().then(setProjects).catch((e) => setError(e.message))

  useEffect(() => {
    load()
  }, [])

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Projects</h2>
          <p className="mt-1 text-sm text-muted">
            Progress = phases whose end date has passed, out of all phases.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setImporting(true)}>
            Bring in from Project OS
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            + New project
          </button>
        </div>
      </div>

      {error && <p className="text-today">Could not load projects: {error}</p>}
      {projects === null && !error && <p className="text-muted">Loading…</p>}
      {projects?.length === 0 && (
        <p className="border border-dashed border-line p-10 text-center text-muted">
          No projects yet. Start with “New project”.
        </p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {projects?.map((p) => {
          const pct = percentComplete(p.phases)
          return (
            <li key={p.id}>
              <a
                href={`#/p/${p.id}`}
                className="group block h-full rounded-lg border border-line border-l-4 border-l-accent bg-surface p-5 no-underline transition-colors hover:bg-sunken"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {p.category}
                  {p.project_os_id && <span className="tnum"> · {p.project_os_id}</span>}
                </div>
                <h3 className="mt-1 text-xl font-semibold leading-snug group-hover:underline">{p.name}</h3>
                <dl className="mt-3 space-y-0.5 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-14 text-muted">Client</dt>
                    <dd>{p.client || '—'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 text-muted">Site</dt>
                    <dd>{p.site || '—'}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-14 text-muted">Dates</dt>
                    <dd className="tnum">
                      {fmtLong(p.start_date)} → {fmtLong(p.target_handover_date)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className="h-1.5 flex-1 bg-sunken"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="tnum w-24 text-right text-sm">
                    <strong>{pct}%</strong> <span className="text-muted">complete</span>
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted tnum">
                  {p.phases.filter((x) => x.end_date < todayISO()).length} of {p.phases.length} phases finished
                </div>
              </a>
            </li>
          )
        })}
      </ul>

      {importing && (
        <OsImport
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            load()
          }}
        />
      )}

      {creating && (
        <ProjectForm
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            location.hash = `#/p/${id}`
          }}
        />
      )}
    </div>
  )
}
