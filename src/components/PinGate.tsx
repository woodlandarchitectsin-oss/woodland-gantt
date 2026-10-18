import { useState } from 'react'
import { api, session } from '../api'

export default function PinGate({ onIn, notice }: { onIn: () => void; notice?: string }) {
  const [value, setValue] = useState('')
  const [err, setErr] = useState(notice ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setErr('')
    session.setPin(value.trim())
    try {
      await api.me()
      onIn()
    } catch (e2) {
      setErr((e2 as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <div className="mb-4 border-b border-line pb-4">
          <b className="font-display block text-[15px] tracking-[0.08em]">WOODLAND</b>
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted">Project Schedule</span>
        </div>
        <label className="label" htmlFor="pin">PIN</label>
        <input
          id="pin"
          className="field"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="mt-2 text-xs text-muted">
          The team PIN lets you view the schedule. The admin PIN lets you change it.
        </p>
        {err && <p className="mt-3 text-sm text-today" role="alert">{err}</p>}
        <button className="btn btn-primary mt-4 w-full justify-center" disabled={busy || !value.trim()}>
          {busy ? 'Checking…' : 'Open'}
        </button>
      </form>
    </div>
  )
}
