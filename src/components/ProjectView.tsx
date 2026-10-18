import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toBlob } from 'html-to-image'
import { api } from '../api'
import { addDays, diffDays, fmtLong, todayISO } from '../../shared/dates'
import type { Milestone, Phase, Project, ProjectDetail } from '../../shared/types'
import Gantt from './Gantt'
import MilestonePanel from './MilestonePanel'
import Notes from './Notes'
import PhaseEditor from './PhaseEditor'
import ProjectForm from './ProjectForm'
import { percentComplete } from './ProjectList'

const ZOOMS = [
  { label: 'Compact', dayW: 8 },
  { label: 'Normal', dayW: 12 },
  { label: 'Wide', dayW: 17 },
]

export default function ProjectView({ id }: { id: number }) {
  const [data, setData] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState('')
  const [editingPhase, setEditingPhase] = useState<number | null>(null)
  const [editingProject, setEditingProject] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [toast, setToast] = useState('')
  const chartRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    () => api.getProject(id).then(setData).catch((e) => setError(e.message)),
    [id],
  )
  useEffect(() => void load(), [load])

  const say = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }
  /** Persist a change; on failure re-sync from the database so the UI never lies. */
  const persist = async (p: Promise<unknown>) => {
    try {
      await p
    } catch (e) {
      say(`Not saved: ${(e as Error).message}`)
      void load()
    }
  }

  // Scale the chart to the page width when printing.
  useEffect(() => {
    const before = () => {
      const el = chartRef.current
      if (el) el.style.zoom = String(Math.min(1, 1020 / el.scrollWidth))
    }
    const after = () => {
      if (chartRef.current) chartRef.current.style.zoom = ''
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  if (error) return <p className="text-today">Could not load project: {error}</p>
  if (!data) return <p className="text-muted">Loading…</p>
  const { project, phases, milestones } = data

  const mutate = (fn: (d: ProjectDetail) => ProjectDetail) => setData((d) => (d ? fn(d) : d))

  const updatePhase = (pid: number, patch: Partial<Phase>) => {
    mutate((d) => ({ ...d, phases: d.phases.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }))
    return persist(api.updatePhase(pid, patch))
  }

  const addPhase = async () => {
    const start = todayISO() < project.start_date || todayISO() > project.target_handover_date ? project.start_date : todayISO()
    try {
      const p = await api.addPhase(id, { name: 'New phase', category: 'Planning', start_date: start, end_date: addDays(start, 13) })
      mutate((d) => ({ ...d, phases: [...d.phases, p] }))
      setEditingPhase(p.id)
    } catch (e) {
      say(`Not saved: ${(e as Error).message}`)
    }
  }

  const removePhase = (pid: number) => {
    mutate((d) => ({ ...d, phases: d.phases.filter((p) => p.id !== pid) }))
    setEditingPhase(null)
    return persist(api.deletePhase(pid))
  }

  const movePhase = (pid: number, dir: -1 | 1) => {
    const i = phases.findIndex((p) => p.id === pid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= phases.length) return
    const next = [...phases]
    ;[next[i], next[j]] = [next[j], next[i]]
    mutate((d) => ({ ...d, phases: next }))
    return persist(api.reorderPhases(id, next.map((p) => p.id)))
  }

  const addMilestone = async (m: Pick<Milestone, 'label' | 'date'>) => {
    try {
      const created = await api.addMilestone(id, m)
      mutate((d) => ({ ...d, milestones: [...d.milestones, created].sort((a, b) => a.date.localeCompare(b.date)) }))
    } catch (e) {
      say(`Not saved: ${(e as Error).message}`)
    }
  }
  const updateMilestone = (mid: number, patch: Partial<Milestone>) => {
    mutate((d) => ({
      ...d,
      milestones: d.milestones.map((m) => (m.id === mid ? { ...m, ...patch } : m)).sort((a, b) => a.date.localeCompare(b.date)),
    }))
    return persist(api.updateMilestone(mid, patch))
  }
  const removeMilestone = (mid: number) => {
    mutate((d) => ({ ...d, milestones: d.milestones.filter((m) => m.id !== mid) }))
    return persist(api.deleteMilestone(mid))
  }

  const saveNotes = (patch: Partial<Project>) => {
    mutate((d) => ({ ...d, project: { ...d.project, ...patch } }))
    return persist(api.updateProject(id, patch))
  }

  const deleteProject = async () => {
    if (!confirm(`Delete “${project.name}” and all its phases? This cannot be undone.`)) return
    await api.deleteProject(id)
    location.hash = '#/'
  }

  // --- Export -----------------------------------------------------------
  const render = async (): Promise<Blob | null> => {
    const node = chartRef.current
    if (!node) return null
    flushSync(() => setExporting(true)) // swap inputs for plain text, hide controls
    try {
      await document.fonts?.ready
      const opts = {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: getComputedStyle(node).backgroundColor,
        filter: (n: Node) => !(n instanceof HTMLElement && n.classList.contains('no-export')),
      }
      try {
        // Font embedding can hang or fail (cross-origin Google Fonts CSS); don't wait forever.
        return await Promise.race([
          toBlob(node, opts),
          new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 6000)),
        ])
      } catch {
        // Web-font embedding can fail offline; retry with system fonts.
        return await toBlob(node, { ...opts, skipFonts: true })
      }
    } finally {
      setExporting(false)
    }
  }
  const fileName = `${project.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '')}-schedule.png`
  const download = (blob: Blob) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const copyImage = async () => {
    say('Rendering image…')
    const blob = await render().catch(() => null)
    if (!blob) return say('Could not render the chart.')
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      say('Chart copied — paste it into WhatsApp or email.')
    } catch {
      download(blob)
      say('Clipboard unavailable — downloaded PNG instead.')
    }
  }
  const savePdf = async () => {
    say('Building PDF…')
    const blob = await render().catch(() => null)
    if (!blob) return say('Could not render the chart.')
    const url = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((ok, fail) => {
        const i = new Image()
        i.onload = () => ok(i)
        i.onerror = fail
        i.src = url
      })
      // Re-encode as JPEG: jsPDF stores PNGs uncompressed (tens of MB).
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      const jpeg = canvas.toDataURL('image/jpeg', 0.92)
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const margin = 8
      const w = pdf.internal.pageSize.getWidth() - margin * 2
      const pageH = pdf.internal.pageSize.getHeight() - margin * 2
      const h = (img.height / img.width) * w
      // Taller than one page → continue on following pages.
      for (let y = 0, page = 0; y < h; y += pageH, page++) {
        if (page) pdf.addPage()
        pdf.addImage(jpeg, 'JPEG', margin, margin - y, w, h, 'chart', 'FAST')
        if (y + pageH < h) {
          // mask the overflow below/above the printable area
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, pdf.internal.pageSize.getHeight() - margin, pdf.internal.pageSize.getWidth(), margin, 'F')
        }
        if (page) pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), margin, 'F')
      }
      pdf.save(fileName.replace(/\.png$/, '.pdf'))
      say('PDF saved.')
    } catch (e) {
      say(`PDF failed: ${(e as Error).message}`)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const downloadImage = async () => {
    const blob = await render().catch(() => null)
    if (blob) download(blob)
    else say('Could not render the chart.')
  }

  const pct = percentComplete(phases)
  const editing = phases.find((p) => p.id === editingPhase)

  return (
    <div>
      <div className="no-print mb-3">
        <a href="#/" className="text-sm text-muted hover:text-ink">← All projects</a>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{project.category}</div>
          <h2 className="text-3xl font-semibold tracking-tight">{project.name}</h2>
          <p className="mt-1 text-sm text-muted tnum">
            {[project.client, project.site].filter(Boolean).join(' · ')}
            {(project.client || project.site) && ' · '}
            {fmtLong(project.start_date)} → {fmtLong(project.target_handover_date)} ({Math.round(diffDays(project.start_date, project.target_handover_date) / 7)} weeks) · {pct}% complete
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex" role="group" aria-label="Zoom">
            {ZOOMS.map((z, i) => (
              <button
                key={z.label}
                className={`btn -ml-px ${zoom === i ? 'bg-sunken' : ''}`}
                aria-pressed={zoom === i}
                onClick={() => setZoom(i)}
              >
                {z.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setEditingProject(true)}>Edit details</button>
          <button className="btn" onClick={() => window.print()}>Print view</button>
          <button className="btn" onClick={savePdf}>Save as PDF</button>
          <button className="btn" onClick={downloadImage}>Download PNG</button>
          <button className="btn btn-primary" onClick={copyImage}>Copy as image</button>
        </div>
      </div>

      <div className="print-visible overflow-x-auto border border-line bg-surface">
        <Gantt
          ref={chartRef}
          project={project}
          phases={phases}
          milestones={milestones}
          dayW={ZOOMS[zoom].dayW}
          exporting={exporting}
          onPhaseUpdate={updatePhase}
          onPhaseEdit={setEditingPhase}
          onPhaseMove={movePhase}
          onMilestoneUpdate={updateMilestone}
        />
      </div>

      <div className="no-print mt-3 flex flex-wrap items-center gap-3">
        <button className="btn" onClick={addPhase}>+ Add phase</button>
        <span className="text-xs text-muted">
          Drag a bar to move it, drag its edges to resize, click it to edit category, colour and exact dates.
        </span>
      </div>

      <MilestonePanel
        milestones={milestones}
        defaultDate={project.target_handover_date}
        onAdd={addMilestone}
        onUpdate={updateMilestone}
        onRemove={removeMilestone}
      />

      <Notes project={project} onSave={saveNotes} />

      <div className="no-print mt-10 border-t border-line pt-4">
        <button className="btn btn-danger" onClick={deleteProject}>Delete project…</button>
      </div>

      {editing && (
        <PhaseEditor
          phase={editing}
          index={phases.indexOf(editing)}
          count={phases.length}
          onClose={() => setEditingPhase(null)}
          onSave={(patch) => {
            setEditingPhase(null)
            return updatePhase(editing.id, patch)
          }}
          onDelete={() => removePhase(editing.id)}
          onMove={(d) => movePhase(editing.id, d)}
        />
      )}
      {editingProject && (
        <ProjectForm
          project={project}
          onClose={() => setEditingProject(false)}
          onSaved={() => {
            setEditingProject(false)
            void load()
          }}
        />
      )}

      {toast && (
        <div role="status" className="no-print fixed bottom-5 left-1/2 z-50 -translate-x-1/2 bg-ink px-4 py-2 text-sm text-bg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
