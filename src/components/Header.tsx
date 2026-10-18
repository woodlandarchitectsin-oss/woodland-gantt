import { useEffect, useState } from 'react'

type Theme = 'system' | 'light' | 'dark'
const ORDER: Theme[] = ['system', 'light', 'dark']

const read = (): Theme => {
  try {
    const t = localStorage.getItem('wg-theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

function apply(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Left rail on desktop, slim top bar on phones: same arrangement as Woodland Project OS. */
export default function Header({ role, onSignOut }: { role: 'admin' | 'team' | null; onSignOut: () => void }) {
  const [theme, setTheme] = useState<Theme>(read)

  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem('wg-theme', theme)
    } catch {
      /* private mode etc. */
    }
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => apply('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
  const signOut = (
    <button className="btn" onClick={onSignOut}>
      Sign out
    </button>
  )
  const themeBtn = (
    <button
      className="btn"
      onClick={() => setTheme(next)}
      title={`Switch to ${next} theme`}
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
    >
      <span className="text-muted">Theme</span> <span className="capitalize">{theme}</span>
    </button>
  )

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 hidden w-[200px] flex-col border-r border-line bg-surface py-[18px] md:flex">
        <a href="#/" className="mb-2 block border-b border-line px-[18px] pb-4 no-underline">
          <b className="font-display block text-[15px] tracking-[0.08em]">WOODLAND</b>
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted">Project Schedule</span>
        </a>
        <nav className="flex flex-col gap-0.5 px-2" aria-label="Views">
          <a
            href="#/"
            className="flex items-center gap-2.5 rounded-md bg-accent/15 px-2.5 py-2 text-[15px] font-medium text-accent no-underline"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6l3.5 12L12 9l5.5 9L21 6" />
            </svg>
            Projects
          </a>
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-line px-[18px] pt-3">
          <span className="text-[11px] text-muted">{role === "team" ? "Signed in: view only" : "Signed in: admin"}</span>
          {themeBtn}
          {signOut}
        </div>
      </aside>
      <header className="no-print flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <a href="#/" className="no-underline">
          <b className="font-display text-[15px] tracking-[0.08em]">WOODLAND</b>{' '}
          <span className="text-[11px] uppercase tracking-[0.12em] text-muted">Project Schedule</span>
        </a>
        <div className="flex gap-2">
          {themeBtn}
          {signOut}
        </div>
      </header>
    </>
  )
}
