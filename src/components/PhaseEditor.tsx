import { useState } from 'react'
import { CATEGORY_COLORS, PHASE_CATEGORIES, type Phase, type PhaseCategory } from '../../shared/types'
import Modal from './Modal'

interface Props {
  phase: Phase
  index: number
  count: number
  onClose: () => void
  onSave: (patch: Partial<Phase>) => unknown
  onDelete: () => unknown
  onMove: (dir: -1 | 1) => unknown
}

export default function PhaseEditor({ phase, index, count, onClose, onSave, onDelete, onMove }: Props) {
  const [name, setName] = useState(phase.name)
  const [category, setCategory] = useState<PhaseCategory>(phase.category)
  const [start, setStart] = useState(phase.start_date)
  const [end, setEnd] = useState(phase.end_date)
  const [color, setColor] = useState(phase.color)
  const [err, setErr] = useState('')

  // Keep the colour tied to the category until the user picks a custom one.
  const changeCategory = (c: PhaseCategory) => {
    if (color.toLowerCase() === CATEGORY_COLORS[category].toLowerCase()) setColor(CATEGORY_COLORS[c])
    setCategory(c)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErr('Name is required.')
    if (!start || !end) return setErr('Both dates are required.')
    if (end < start) return setErr('End date must be on or after the start date.')
    onSave({ name: name.trim(), category, start_date: start, end_date: end, color })
  }

  return (
    <Modal title="Edit phase" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="ph-name">Name</label>
          <input id="ph-name" className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div>
            <label className="label" htmlFor="ph-cat">Category</label>
            <select id="ph-cat" className="field" value={category} onChange={(e) => changeCategory(e.target.value as PhaseCategory)}>
              {PHASE_CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-surface">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ph-color">Colour</label>
            <div className="flex items-center gap-2">
              <input
                id="ph-color"
                type="color"
                className="h-[34px] w-12 cursor-pointer border border-line bg-surface p-0.5"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <button
                type="button"
                className="text-xs text-muted underline"
                onClick={() => setColor(CATEGORY_COLORS[category])}
              >
                reset
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ph-start">Start</label>
            <input id="ph-start" type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="ph-end">End (inclusive)</label>
            <input id="ph-end" type="date" className="field" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Position {index + 1} of {count}</span>
          <button type="button" className="btn" disabled={index === 0} onClick={() => onMove(-1)}>▲ Earlier</button>
          <button type="button" className="btn" disabled={index === count - 1} onClick={() => onMove(1)}>▼ Later</button>
        </div>
        {err && <p className="text-sm text-today" role="alert">{err}</p>}
        <div className="flex justify-between pt-2">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => confirm(`Remove “${phase.name}”?`) && onDelete()}
          >
            Remove phase
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
