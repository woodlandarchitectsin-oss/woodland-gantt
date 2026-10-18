import { useState } from 'react'
import { api } from '../api'
import { addDays, fmt, mondayOnOrBefore, parse, todayISO } from '../../shared/dates'
import { INTERIOR_TEMPLATE } from '../../shared/template'
import { CATEGORY_COLORS, PROJECT_CATEGORIES, type Project, type ProjectCategory, type TemplateId } from '../../shared/types'
import Modal from './Modal'

interface Props {
  /** When provided the form edits this project; otherwise it is the new-project wizard. */
  project?: Project
  onClose: () => void
  onSaved: (id: number) => void
}

export default function ProjectForm({ project, onClose, onSaved }: Props) {
  const editing = !!project
  const monday = fmt(mondayOnOrBefore(parse(todayISO())) + 7)
  const [template, setTemplate] = useState<TemplateId>('interior')
  const [name, setName] = useState(project?.name ?? '')
  const [client, setClient] = useState(project?.client ?? '')
  const [site, setSite] = useState(project?.site ?? '')
  const [category, setCategory] = useState<ProjectCategory>(project?.category ?? 'interior fit-out')
  const [start, setStart] = useState(project?.start_date ?? monday)
  const [end, setEnd] = useState(project?.target_handover_date ?? addDays(monday, 139))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (end < start) return setErr('Handover date must be on or after the start date.')
    setBusy(true)
    try {
      const body = { name, client, site, category, start_date: start, target_handover_date: end }
      if (project) {
        await api.updateProject(project.id, body)
        onSaved(project.id)
      } else {
        const { id } = await api.createProject({ ...body, template })
        onSaved(id)
      }
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit project details' : 'New project'} onClose={onClose} wide={!editing}>
      <form onSubmit={submit} className={editing ? '' : 'grid gap-8 md:grid-cols-[1fr_1.1fr]'}>
        {!editing && (
          <fieldset>
            <legend className="label">1 · Start from</legend>
            <div className="space-y-2">
              {(
                [
                  ['interior', 'Interior fit-out template', 'Site-proven sequence of 12 phases, scaled to your dates.'],
                  ['blank', 'Blank project', 'Only a handover milestone. Add phases yourself.'],
                ] as const
              ).map(([id, title, desc]) => (
                <label
                  key={id}
                  className={`block cursor-pointer border p-3 ${template === id ? 'border-accent bg-sunken' : 'border-line'}`}
                >
                  <input
                    type="radio"
                    name="template"
                    className="mr-2 accent-[rgb(var(--accent))]"
                    checked={template === id}
                    onChange={() => setTemplate(id)}
                  />
                  <span className="font-medium">{title}</span>
                  <span className="mt-0.5 block pl-6 text-xs text-muted">{desc}</span>
                </label>
              ))}
            </div>
            {template === 'interior' && (
              <ol className="mt-3 max-h-64 space-y-1 overflow-y-auto border border-line p-2 text-xs">
                {INTERIOR_TEMPLATE.map((t, i) => (
                  <li key={t.name} className="flex gap-2" title={t.rule}>
                    <span className="tnum w-5 text-right text-muted">{i + 1}</span>
                    <span className="mt-1 h-2 w-2 shrink-0" style={{ background: CATEGORY_COLORS[t.category] }} />
                    <span>{t.name}</span>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>
        )}

        <div className="space-y-3">
          {!editing && <div className="label">2 · Details</div>}
          <div>
            <label className="label" htmlFor="pf-name">Project name</label>
            <input id="pf-name" className="field" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pf-client">Client</label>
              <input id="pf-client" className="field" value={client} onChange={(e) => setClient(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pf-site">Site / location</label>
              <input id="pf-site" className="field" value={site} onChange={(e) => setSite(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="pf-cat">Category</label>
            <select id="pf-cat" className="field capitalize" value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-surface">{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pf-start">Start date</label>
              <input id="pf-start" type="date" required className="field" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pf-end">Target handover</label>
              <input id="pf-end" type="date" required className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {err && <p className="text-sm text-today" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {editing ? 'Save' : 'Create project'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
