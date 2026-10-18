import { useEffect, useState } from 'react'
import { api, session, type Role } from './api'
import Header from './components/Header'
import PinGate from './components/PinGate'
import ProjectList from './components/ProjectList'
import ProjectView from './components/ProjectView'

const parseHash = (): number | null => {
  const m = location.hash.match(/^#\/p\/(\d+)/)
  return m ? Number(m[1]) : null
}

export default function App() {
  const [projectId, setProjectId] = useState<number | null>(parseHash)
  // 'checking' while a remembered PIN is re-validated; 'out' shows the PIN screen
  const [state, setState] = useState<'checking' | 'out' | 'in'>(session.hasPin() ? 'checking' : 'out')
  const [role, setRole] = useState<Role | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const on = () => setProjectId(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    const out = () => setState('out')
    window.addEventListener('wg-auth', out)
    return () => window.removeEventListener('wg-auth', out)
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    api
      .me()
      .then((r) => {
        setRole(r.role)
        setState('in')
      })
      .catch((e: Error) => {
        // wrong PIN already sent us to 'out'; a network failure keeps the PIN and says so
        if (session.hasPin()) setNotice(e.message)
        setState('out')
      })
  }, [state])

  if (state === 'checking') return <p className="p-8 text-muted">Opening…</p>
  if (state === 'out')
    return (
      <PinGate
        notice={notice}
        onIn={() => {
          setNotice('')
          setRole(session.role())
          setState('in')
        }}
      />
    )

  return (
    <div className="min-h-screen">
      <Header role={role} onSignOut={() => session.signOut()} />
      <main className="px-4 py-6 sm:px-8 md:ml-[200px]">
        {role === 'team' && (
          <p className="mb-4 rounded-md border border-line bg-sunken px-3 py-2 text-sm text-muted">
            View only. Sign in with the admin PIN to change the schedule.
          </p>
        )}
        {projectId === null ? <ProjectList /> : <ProjectView key={projectId} id={projectId} />}
      </main>
    </div>
  )
}
