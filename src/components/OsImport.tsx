import { useEffect, useState } from 'react'
import { registryApi, type OsCandidate } from '../api'
import type { TemplateId } from '../../shared/types'
import Modal from './Modal'

const STATE_TEXT = {
  new: 'Not on the chart yet',
  'name-match': 'Same name here, will be linked',
  linked: 'Already on the chart',
} as const

export default function OsImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [list, setList] = useState<OsCandidate[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [template, setTemplate] = useState<TemplateId>('interior')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    registryApi
      .list()
      .then(({ projects }) => {
        setList(projects)
        setPicked(new Set(projects.filter((p) => p.state !== 'linked').map((p) => p.id)))
      })
      .catch((e) => setErr(e.message))
  }, [])

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const go = async () => {
    setBusy(true)
    try {
      await registryApi.importProjects([...picked], template)
      onDone()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  const open = list?.filter((p) => p.state !== 'linked') ?? []
  const count = [...picked].filter((id) => open.some((p) => p.id === id)).length

  return (
    <Modal title="Bring in projects from Project OS" onClose={onClose} wide>
      <p className="mb-4 text-sm text-muted">
        These are the projects Project OS shows as in process (design, tender / site, snagging). Untick any you
        do not want on the chart. New ones start from the template you choose, using the start and target dates
        from Project OS when it has them.
      </p>
      {err && <p className="mb-3 text-sm text-today" role="alert">{err}</p>}
      {list === null && !err && <p className="text-muted">Loading…</p>}
      {list && (
        <>
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto border border-line">
            {list.map((p) => (
              <li key={p.id}>
                <label className={`flex items-start gap-3 p-3 ${p.state === 'linked' ? 'opacity-60' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="mt-1 accent-[rgb(var(--accent))]"
                    disabled={p.state === 'linked'}
                    checked={p.state === 'linked' ? true : picked.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{p.name}</span>{' '}
                    <span className="tnum text-xs text-muted">{p.id}</span>
                    <span className="block text-xs text-muted">
                      {[p.client, p.location, p.lifecycle].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{STATE_TEXT[p.state]}</span>
                </label>
              </li>
            ))}
          </ul>
          <fieldset className="mt-4 flex flex-wrap gap-4 text-sm">
            <legend className="label">Start new projects from</legend>
            {(
              [
                ['interior', 'Interior fit-out template'],
                ['blank', 'Blank (handover milestone only)'],
              ] as const
            ).map(([id, text]) => (
              <label key={id} className="cursor-pointer">
                <input
                  type="radio"
                  name="os-template"
                  className="mr-2 accent-[rgb(var(--accent))]"
                  checked={template === id}
                  onChange={() => setTemplate(id)}
                />
                {text}
              </label>
            ))}
          </fieldset>
          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="text-sm text-muted">
              {open.length === 0 ? 'Everything in process is already here.' : `${count} selected`}
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || count === 0} onClick={go}>
                Bring in {count || ''}
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}
