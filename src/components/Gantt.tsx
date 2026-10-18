import { forwardRef, useMemo, useState } from 'react'
import { fmt, fmtLong, fmtMonthYear, fmtShort, fmtShortDay, mondayOnOrBefore, parse, todayISO } from '../../shared/dates'
import { CATEGORY_COLORS, PHASE_CATEGORIES, type Milestone, type Phase, type Project } from '../../shared/types'

const LABEL_W = 340
const MONTH_H = 24
const WEEK_H = 40
const STRIP_H = 50
const BAR_ROW_H = 44
const ASSIGN_ROW_H = 46

interface Props {
  project: Project
  phases: Phase[]
  milestones: Milestone[]
  dayW: number
  exporting: boolean
  onPhaseUpdate: (id: number, patch: Partial<Phase>) => unknown
  onPhaseEdit: (id: number) => void
  onPhaseMove: (id: number, dir: -1 | 1) => unknown
  onMilestoneUpdate: (id: number, patch: Partial<Milestone>) => unknown
}

type DragKind = 'move' | 'start' | 'end' | 'milestone'
interface Drag {
  kind: DragKind
  id: number
  s: number
  e: number
}

const Gantt = forwardRef<HTMLDivElement, Props>(function Gantt(
  { project, phases, milestones, dayW, exporting, onPhaseUpdate, onPhaseEdit, onPhaseMove, onMilestoneUpdate },
  ref,
) {
  const [drag, setDrag] = useState<Drag | null>(null)

  // Grid spans the project dates (plus anything dragged/typed outside them),
  // snapped to whole Monday-to-Sunday weeks.
  const { gridStart, weeks, totalDays } = useMemo(() => {
    const days = [
      project.start_date,
      project.target_handover_date,
      ...phases.flatMap((p) => [p.start_date, p.end_date]),
      ...milestones.map((m) => m.date),
    ].map(parse)
    const first = mondayOnOrBefore(Math.min(...days))
    const w = Math.ceil((Math.max(...days) - first + 1) / 7)
    return { gridStart: first, weeks: w, totalDays: w * 7 }
  }, [project, phases, milestones])
  const gridEnd = gridStart + totalDays - 1

  const x = (day: number) => (day - gridStart) * dayW
  const today = parse(todayISO())
  const bodyW = totalDays * dayW
  const totalW = LABEL_W + bodyW

  const months = useMemo(() => {
    const out: { label: string; days: number }[] = []
    for (let d = gridStart; d <= gridEnd; d++) {
      const label = fmtMonthYear(d)
      const last = out[out.length - 1]
      if (last && last.label === label) last.days++
      else out.push({ label, days: 1 })
    }
    return out
  }, [gridStart, gridEnd])

  // ---- Dragging (phase bars + milestone flags) -------------------------
  const startDrag = (ev: React.PointerEvent, kind: DragKind, id: number, s: number, e: number, onClick?: () => void) => {
    if (ev.button !== 0 || exporting) return
    ev.preventDefault()
    ev.stopPropagation()
    const x0 = ev.clientX
    let cur: Drag = { kind, id, s, e }
    let moved = false

    const move = (m: PointerEvent) => {
      if (Math.abs(m.clientX - x0) > 3) moved = true
      if (!moved) return
      const d = Math.round((m.clientX - x0) / dayW)
      if (kind === 'start') cur = { kind, id, s: Math.max(gridStart, Math.min(s + d, e)), e }
      else if (kind === 'end') cur = { kind, id, s, e: Math.min(gridEnd, Math.max(e + d, s)) }
      else {
        const dd = Math.max(gridStart - s, Math.min(d, gridEnd - e))
        cur = { kind, id, s: s + dd, e: e + dd }
      }
      setDrag(cur)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      if (!moved) return onClick?.()
      if (cur.s === s && cur.e === e) return
      if (kind === 'milestone') onMilestoneUpdate(id, { date: fmt(cur.s) })
      else onPhaseUpdate(id, { start_date: fmt(cur.s), end_date: fmt(cur.e) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  // Milestone flags alternate between two lanes so neighbouring labels stay readable.
  const msSorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date))

  const dividerStyle = {
    backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${dayW * 7 - 1}px, rgb(var(--line)) ${dayW * 7 - 1}px, rgb(var(--line)) ${dayW * 7}px)`,
  }

  return (
    <div ref={ref} className="bg-surface text-ink" style={{ width: totalW }}>
      {/* Title strip (also lands in the exported image) */}
      <div className="flex items-end justify-between gap-6 border-b border-line px-4 py-3" style={{ width: totalW }}>
        <div>
          <div className="font-display text-xl font-semibold leading-tight">{project.name}</div>
          <div className="text-xs text-muted tnum">
            {[project.client, project.site].filter(Boolean).join(' · ')}
            {(project.client || project.site) && ' · '}
            {fmtLong(project.start_date)} → {fmtLong(project.target_handover_date)}
          </div>
        </div>
        <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {PHASE_CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className="h-2.5 w-4" style={{ background: CATEGORY_COLORS[c] }} />
              {c}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-2 border-dashed border-ink" /> Milestone
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-today" /> Today
          </li>
        </ul>
      </div>

      {/* Header: months + weeks */}
      <div className="flex border-b border-line" style={{ height: MONTH_H + WEEK_H }}>
        <div
          className="sticky left-0 z-30 flex shrink-0 items-end border-r border-line bg-surface px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted"
          style={{ width: LABEL_W }}
        >
          Phase
        </div>
        <div style={{ width: bodyW }}>
          <div className="flex border-b border-line" style={{ height: MONTH_H }}>
            {months.map((m, i) => (
              <div
                key={i}
                className="overflow-hidden whitespace-nowrap border-r border-line px-2 text-xs font-semibold leading-6 tnum"
                style={{ width: m.days * dayW }}
              >
                {m.label}
              </div>
            ))}
          </div>
          <div className="flex" style={{ height: WEEK_H }}>
            {Array.from({ length: weeks }, (_, i) => (
              <div key={i} className="border-r border-line px-1.5 py-1 text-[11px] leading-tight tnum" style={{ width: dayW * 7 }}>
                <div className="font-semibold">W{i + 1}</div>
                <div className="truncate text-muted">{fmtShortDay(gridStart + i * 7)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative" style={{ width: totalW }}>
        {/* week dividers behind everything */}
        <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: LABEL_W, width: bodyW, ...dividerStyle }} />

        {/* Milestone strip */}
        <div className="flex border-b border-line" style={{ height: STRIP_H }}>
          <div
            className="sticky left-0 z-30 flex shrink-0 items-center border-r border-line bg-surface px-4 text-[11px] font-semibold uppercase tracking-wider text-muted"
            style={{ width: LABEL_W }}
          >
            Milestones
          </div>
        </div>

        {/* Phase rows */}
        {phases.map((p, i) => {
          const dr = drag && drag.kind !== 'milestone' && drag.id === p.id ? drag : null
          const s = dr ? dr.s : parse(p.start_date)
          const e = dr ? dr.e : parse(p.end_date)
          const w = (e - s + 1) * dayW
          const done = e < today
          return (
            <div key={p.id}>
              <div className="flex" style={{ height: BAR_ROW_H }}>
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-surface pl-2 pr-3"
                  style={{ width: LABEL_W }}
                >
                  <div className="no-export flex flex-col">
                    <button
                      className="px-1 text-[10px] leading-none text-muted hover:text-ink disabled:opacity-20"
                      disabled={i === 0}
                      onClick={() => onPhaseMove(p.id, -1)}
                      aria-label={`Move ${p.name} up`}
                    >
                      ▲
                    </button>
                    <button
                      className="px-1 text-[10px] leading-none text-muted hover:text-ink disabled:opacity-20"
                      disabled={i === phases.length - 1}
                      onClick={() => onPhaseMove(p.id, 1)}
                      aria-label={`Move ${p.name} down`}
                    >
                      ▼
                    </button>
                  </div>
                  <span className="tnum w-5 shrink-0 text-right text-xs text-muted">{i + 1}</span>
                  <button className="min-w-0 flex-1 text-left" onClick={() => onPhaseEdit(p.id)} title="Edit phase">
                    <div className="truncate text-[13px] font-medium leading-tight">{p.name}</div>
                    <div className="tnum text-[11px] leading-tight text-muted">
                      {fmtShort(fmt(s))} – {fmtShort(fmt(e))} · {e - s + 1}d{done && ' · done'}
                    </div>
                  </button>
                </div>

                <div className="relative" style={{ width: bodyW }}>
                  <div
                    className={`absolute top-[9px] flex h-[26px] items-center overflow-hidden px-2 text-xs font-medium text-white shadow-sm ${exporting ? '' : 'cursor-grab active:cursor-grabbing'}`}
                    style={{ left: x(s), width: w, background: p.color, opacity: done ? 0.72 : 1, touchAction: 'none' }}
                    title={`${p.name}\n${fmtLong(fmt(s))} → ${fmtLong(fmt(e))}`}
                    onPointerDown={(ev) => startDrag(ev, 'move', p.id, s, e, () => onPhaseEdit(p.id))}
                  >
                    <span className="pointer-events-none truncate">{w > 90 ? p.name : ''}</span>
                    <span
                      className="no-export absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-black/0 hover:bg-black/25"
                      onPointerDown={(ev) => startDrag(ev, 'start', p.id, s, e)}
                    />
                    <span
                      className="no-export absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-black/0 hover:bg-black/25"
                      onPointerDown={(ev) => startDrag(ev, 'end', p.id, s, e)}
                    />
                  </div>
                </div>
              </div>

              {/* Assignment row — saved to SQLite on blur */}
              <div className="flex border-b border-line" style={{ height: ASSIGN_ROW_H }}>
                <div
                  className="sticky left-0 z-20 grid shrink-0 grid-cols-2 gap-3 border-r border-line bg-surface pb-1.5 pl-9 pr-3"
                  style={{ width: LABEL_W }}
                >
                  <AssignField
                    label="Assigned"
                    placeholder="Worker / contractor"
                    value={p.assigned_worker}
                    exporting={exporting}
                    onSave={(v) => onPhaseUpdate(p.id, { assigned_worker: v })}
                  />
                  <AssignField
                    label="Material in-charge"
                    placeholder="Name"
                    value={p.material_incharge}
                    exporting={exporting}
                    onSave={(v) => onPhaseUpdate(p.id, { material_incharge: v })}
                  />
                </div>
              </div>
            </div>
          )
        })}

        {phases.length === 0 && (
          <div className="px-4 py-10 text-sm text-muted">No phases yet — use “+ Add phase” below the chart.</div>
        )}

        {/* Overlay: milestone lines + flags + today */}
        <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: LABEL_W, width: bodyW }}>
          {msSorted.map((m, i) => {
            const dr = drag && drag.kind === 'milestone' && drag.id === m.id ? drag : null
            const day = dr ? dr.s : parse(m.date)
            const lx = x(day) + dayW / 2
            return (
              <div key={m.id}>
                <div className="absolute bottom-0 border-l-2 border-dashed border-ink/70" style={{ left: lx - 1, top: 0 }} />
                <button
                  className={`pointer-events-auto absolute max-w-[190px] truncate border border-ink/70 bg-surface px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight ${exporting ? '' : 'cursor-grab active:cursor-grabbing'}`}
                  style={{ left: lx, top: 4 + (i % 2) * 22, touchAction: 'none' }}
                  title={`${m.label} — ${fmtLong(fmt(day))} (drag to move; edit below the chart)`}
                  onPointerDown={(ev) =>
                    startDrag(ev, 'milestone', m.id, parse(m.date), parse(m.date), () => {
                      const el = document.getElementById(`ms-label-${m.id}`)
                      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      el?.focus({ preventScroll: true })
                    })
                  }
                >
                  <span className="tnum text-muted">{fmtShort(fmt(day))}</span> {m.label}
                </button>
              </div>
            )
          })}

          {today >= gridStart && today <= gridEnd && (
            <div className="absolute bottom-0 top-0 z-10 w-0.5 bg-today" style={{ left: x(today) + dayW / 2 - 1 }}>
              <span className="absolute -top-px left-1/2 -translate-x-1/2 bg-today px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wider text-white">
                Today
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

function AssignField({
  label,
  placeholder,
  value,
  exporting,
  onSave,
}: {
  label: string
  placeholder: string
  value: string
  exporting: boolean
  onSave: (v: string) => unknown
}) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  // Adopt server-side changes (e.g. reload after a failed save) unless mid-edit.
  if (value !== seen) {
    setSeen(value)
    setText(value)
  }
  return (
    <label className="flex min-w-0 flex-col justify-end">
      <span className="text-[9px] font-semibold uppercase leading-tight tracking-wider text-muted">{label}</span>
      {exporting ? (
        <span className="truncate border-b border-transparent py-0.5 text-[13px]">{text || '—'}</span>
      ) : (
        <input
          className="inline-field"
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = text.trim()
            if (v !== value) onSave(v)
            setText(v)
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      )}
    </label>
  )
}

export default Gantt
