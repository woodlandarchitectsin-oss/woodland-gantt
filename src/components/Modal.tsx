import { useEffect, type ReactNode } from 'react'

export default function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [onClose])

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:py-12"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full rounded-lg border border-line bg-surface p-6 shadow-xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}
      >
        <h2 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h2>
        {children}
      </div>
    </div>
  )
}
