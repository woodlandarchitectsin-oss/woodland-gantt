import { useState } from 'react'
import type { Milestone } from '../../shared/types'

interface Props {
  milestones: Milestone[]
  defaultDate: string
  onAdd: (m: Pick<Milestone, 'label' | 'date'>) => unknown
  onUpdate: (id: number, patch: Partial<Milestone>) => unknown
  onRemove: (id: number) => unknown
}

export default function MilestonePanel({ milestones, defaultDate, onAdd, onUpdate, onRemove }: Props) {
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(defaultDate)

  return (
    <section className="no-print mt-8" aria-labelledby="ms-h">
      <h3 id="ms-h" className="mb-1 text-xl font-semibold">Milestones</h3>
      <p className="mb-3 text-xs text-muted">
        Shown as dashed lines on the chart. Rename or re-date here, or drag a flag on the chart.
      </p>
      <ul className="divide-y divide-line border border-line bg-surface">
        {milestones.map((m) => (
          <MilestoneRow key={m.id} m={m} onUpdate={onUpdate} onRemove={onRemove} />
        ))}
        {milestones.length === 0 && <li className="px-3 py-3 text-sm text-muted">No milestones.</li>}
        <li className="flex flex-wrap items-center gap-2 bg-sunken px-3 py-2">
          <input
            className="field max-w-xs"
            placeholder="New milestone label"
            aria-label="New milestone label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input type="date" className="field w-auto" aria-label="New milestone date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button
            className="btn"
            disabled={!date}
            onClick={() => {
              onAdd({ label: label.trim() || 'Milestone', date })
              setLabel('')
            }}
          >
            + Add milestone
          </button>
        </li>
      </ul>
    </section>
  )
}

function MilestoneRow({
  m,
  onUpdate,
  onRemove,
}: {
  m: Milestone
  onUpdate: Props['onUpdate']
  onRemove: Props['onRemove']
}) {
  const [label, setLabel] = useState(m.label)
  const [seen, setSeen] = useState(m.label)
  if (m.label !== seen) {
    setSeen(m.label)
    setLabel(m.label)
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        id={`ms-label-${m.id}`}
        className="field max-w-xs"
        aria-label="Milestone label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          const v = label.trim()
          if (!v) return setLabel(m.label)
          if (v !== m.label) onUpdate(m.id, { label: v })
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <input
        type="date"
        className="field w-auto"
        aria-label="Milestone date"
        value={m.date}
        onChange={(e) => e.target.value && onUpdate(m.id, { date: e.target.value })}
      />
      <button className="btn btn-danger" onClick={() => onRemove(m.id)} aria-label={`Remove milestone ${m.label}`}>
        Remove
      </button>
    </li>
  )
}
