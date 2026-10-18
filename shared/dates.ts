// Dates are ISO "YYYY-MM-DD" strings. Arithmetic uses whole "day numbers"
// (days since 1970-01-01, UTC) so time zones and DST never shift a bar.

export const parse = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86400000)
}

export const fmt = (day: number): string => new Date(day * 86400000).toISOString().slice(0, 10)

export const addDays = (iso: string, n: number): string => fmt(parse(iso) + n)

export const diffDays = (a: string, b: string): number => parse(b) - parse(a)

/** Today in the machine's local calendar. */
export const todayISO = (): string => {
  const d = new Date()
  return fmt(Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000))
}

/** Day number of the Monday on or before the given day number. */
export const mondayOnOrBefore = (day: number): number => day - ((day + 3) % 7)

export const isISO = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const long = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export const fmtShort = (iso: string) => short.format(parse(iso) * 86400000)
export const fmtLong = (iso: string) => long.format(parse(iso) * 86400000)
export const fmtMonthYear = (day: number) => monthYear.format(day * 86400000)
export const fmtShortDay = (day: number) => short.format(day * 86400000)
