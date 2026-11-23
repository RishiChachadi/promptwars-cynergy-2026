const campusZone = { timeZone: 'Asia/Kolkata' }
const date = new Intl.DateTimeFormat('en-IN', { ...campusZone, weekday: 'short', month: 'short', day: 'numeric' })
const time = new Intl.DateTimeFormat('en-IN', { ...campusZone, hour: 'numeric', minute: '2-digit', hour12: true })
const day = new Intl.DateTimeFormat('en-IN', { ...campusZone, day: 'numeric' })
const month = new Intl.DateTimeFormat('en-IN', { ...campusZone, month: 'short' })

export const formatDate = (value: string) => date.format(new Date(value))
export const formatTime = (value: string) => time.format(new Date(value))
export const formatDay = (value: string) => day.format(new Date(value))
export const formatMonth = (value: string) => month.format(new Date(value))
export const formatWindow = (startsAt: string, endsAt: string) =>
  formatTime(startsAt) + ' – ' + formatTime(endsAt) + ' IST'
