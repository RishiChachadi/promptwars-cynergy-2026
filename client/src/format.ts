const campusZone = { timeZone: 'Asia/Kolkata' }
const date = new Intl.DateTimeFormat('en-IN', { ...campusZone, weekday: 'short', month: 'short', day: 'numeric' })
const time = new Intl.DateTimeFormat('en-IN', { ...campusZone, hour: 'numeric', minute: '2-digit', hour12: true })
const day = new Intl.DateTimeFormat('en-IN', { ...campusZone, day: 'numeric' })
const month = new Intl.DateTimeFormat('en-IN', { ...campusZone, month: 'short' })

export const formatDate = (value: string) => date.format(new Date(value))
export const formatTime = (value: string) => time.format(new Date(value))
export const formatDay = (value: string) => day.format(new Date(value))
export const formatMonth = (value: string) => month.format(new Date(value))
export const toCampusInput = (timestamp: string) => {
  const campus = new Date(Date.parse(timestamp) + 330 * 60_000)
  if (!Number.isFinite(campus.getTime()) || campus.getUTCFullYear() < 1 || campus.getUTCFullYear() > 9999) return ''
  return campus.toISOString().slice(0, -1)
}

export const formatWindow = (startsAt: string, endsAt: string) =>
  formatTime(startsAt) + ' – ' +
  (toCampusInput(startsAt).slice(0, 10) === toCampusInput(endsAt).slice(0, 10) ? '' : formatDate(endsAt) + ', ') +
  formatTime(endsAt) + ' IST'
