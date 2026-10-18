import { useState } from 'react'
import type { Project } from '../../shared/types'

type NoteKey = 'sequence_logic' | 'critical_path' | 'site_note'

const FIELDS: { key: NoteKey; title: string; hint: string }[] = [
  { key: 'sequence_logic', title: 'Sequence logic', hint: 'Why trades are ordered the way they are.' },
  { key: 'critical_path', title: 'Critical path', hint: 'The chain of phases that sets the handover date.' },
  { key: 'site_note', title: 'Site note', hint: 'Monsoon, cure time, access, society rules…' },
]

export default function Notes({ project, onSave }: { project: Project; onSave: (p: Partial<Project>) => unknown }) {
  return (
    <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Project notes">
      {FIELDS.map((f) => (
        <NoteBox
          key={f.key}
          title={f.title}
          hint={f.hint}
          value={project[f.key]}
          onSave={(v) => onSave({ [f.key]: v })}
        />
      ))}
    </section>
  )
}

function NoteBox({
  title,
  hint,
  value,
  onSave,
}: {
  title: string
  hint: string
  value: string
  onSave: (v: string) => unknown
}) {
  const [text, setText] = useState(value)
  return (
    <div className="border border-line border-t-2 border-t-accent bg-surface p-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="no-print mb-2 text-xs text-muted">{hint}</p>
      <textarea
        className="min-h-[9rem] w-full resize-y border border-line bg-bg/40 p-2 text-sm leading-relaxed focus:border-accent print:resize-none print:border-0 print:p-0"
        aria-label={title}
        value={text}
        placeholder={`${title}…`}
        rows={Math.max(6, text.split('\n').length + 1)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onSave(text)}
      />
    </div>
  )
}
