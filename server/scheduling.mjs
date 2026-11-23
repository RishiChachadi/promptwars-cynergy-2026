import { randomUUID } from 'node:crypto'

const minute = 60_000
const day = 24 * 60 * minute
const minDuration = 15 * minute
const maxDuration = 8 * 60 * minute

export class SchedulingError extends Error {
  constructor(status, message, alternatives = []) {
    super(message)
    this.status = status
    this.alternatives = alternatives
  }
}

function parseTimestamp(value) {
  if (typeof value !== 'string') return NaN
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || match[0] !== value) return NaN
  const local = match[1] + ':' + (match[2] ?? '00') + '.' + (match[3] ?? '').padEnd(3, '0')
  const utc = Date.parse(local + 'Z')
  if (!Number.isFinite(utc) || new Date(utc).toISOString() !== local + 'Z') return NaN
  const instant = Date.parse(local + match[4])
  return Number.isFinite(instant) && new Date(instant).toISOString().length === 24 ? instant : NaN
}

const iso = value => new Date(value).toISOString()
const readWindow = row => ({ ...row, start: Date.parse(row.startsAt), end: Date.parse(row.endsAt) })
const overlaps = (a, b) => a.start < b.end && b.start < a.end

export function inWriteTransaction(db, action) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = action()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function mergeWindows(windows) {
  const merged = []
  for (const { start, end } of windows.toSorted((a, b) => a.start - b.start)) {
    const last = merged.at(-1)
    if (last && start <= last.end) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
  }
  return merged
}

const requestFields = `
  b.id, b.user_id AS userId, b.project_id AS projectId, b.resource_id AS resourceId,
  b.starts_at AS startsAt, b.ends_at AS endsAt, b.status, b.created_at AS createdAt, b.rowid AS submissionOrder,
  p.owner_id AS ownerId, p.deadline_at AS deadlineAt, u.role,
  EXISTS (SELECT 1 FROM project_equipment_requirements pr
    WHERE pr.project_id = p.id AND pr.resource_id = b.resource_id) AS required
`
const requestJoins = 'FROM bookings b JOIN projects p ON p.id = b.project_id JOIN users u ON u.id = b.user_id'

export function getSchedulingRequest(db, id) {
  const row = db.prepare(`SELECT ${requestFields} ${requestJoins} WHERE b.id = ?`).get(id)
  return row && readWindow(row)
}

function resourceSchedule(db, resourceId, now) {
  const resource = db.prepare('SELECT status, requires_approval AS requiresApproval FROM resources WHERE id = ?').get(resourceId)
  const windows = db.prepare('SELECT starts_at AS startsAt, ends_at AS endsAt, kind FROM availability WHERE resource_id = ?')
    .all(resourceId).map(readWindow)
  const open = mergeWindows(windows.filter(window => window.kind === 'open'))
  const maintenance = windows.filter(window => window.kind === 'maintenance')
  const reservations = db.prepare(`
    SELECT resource_id AS resourceId, user_id AS userId, starts_at AS startsAt, ends_at AS endsAt
    FROM bookings WHERE status = 'approved' AND (resource_id = ? OR julianday(ends_at) > julianday(?))
  `).all(resourceId, iso(now)).map(readWindow)
  const pending = db.prepare(`SELECT ${requestFields} ${requestJoins} WHERE b.status = 'pending' AND b.resource_id = ?`)
    .all(resourceId).map(readWindow)
  return { resource, open, maintenance, reservations, pending, now }
}

const deadline = request => request.deadlineAt ? Date.parse(request.deadlineAt) : Infinity
const isEligible = request => request.role === 'student' && request.userId === request.ownerId
const relevant = (schedule, request) => schedule.reservations
  .filter(row => row.resourceId === request.resourceId || row.userId === request.userId)

function slotIssue(schedule, request) {
  if (schedule.resource.status !== 'available') return 'This equipment is currently unavailable for booking.'
  if (request.end - request.start < minDuration || request.end - request.start > maxDuration) {
    return 'A session must last between 15 minutes and 8 hours.'
  }
  if (request.start <= schedule.now) return 'Choose a start time in the future.'
  if (request.end > deadline(request)) return 'Choose a session that ends by your project deadline.'
  if (schedule.maintenance.some(window => overlaps(window, request))) return 'This session overlaps a maintenance block.'
  if (!schedule.open.some(window => window.start <= request.start && request.end <= window.end)) {
    return 'The entire session must be within lab hours.'
  }
  if (relevant(schedule, request).some(row => overlaps(row, request))) {
    return 'This session overlaps a confirmed reservation for the equipment or for you.'
  }
}

function alternatives(schedule, request, additionalBlocks) {
  if (schedule.resource.status !== 'available') return []
  const duration = request.end - request.start
  const blocks = mergeWindows([...schedule.maintenance, ...relevant(schedule, request), ...additionalBlocks])
  const choices = []
  const nearFuture = Math.ceil((schedule.now + minute) / minute) * minute
  const preferred = Math.max(request.start, nearFuture)

  function addChoice(start, end) {
    if (end - start < duration) return
    const closest = Math.max(start, Math.min(preferred, end - duration))
    choices.push({ start: closest, end: closest + duration })
  }

  for (const window of schedule.open) {
    let start = Math.max(window.start, schedule.now + 1)
    const end = Math.min(window.end, deadline(request))
    for (const block of blocks) {
      if (block.end <= start) continue
      if (block.start >= end) break
      addChoice(start, block.start)
      start = block.end
    }
    addChoice(start, end)
  }
  return choices.sort((a, b) => Math.abs(a.start - request.start) - Math.abs(b.start - request.start) || a.start - b.start)
    .slice(0, 3).map(({ start, end }) => ({ startsAt: iso(start), endsAt: iso(end) }))
}

function pendingForStudent(db, request, now) {
  return db.prepare(`SELECT id, starts_at AS startsAt, ends_at AS endsAt FROM bookings
    WHERE user_id = ? AND status = 'pending'`).all(request.userId).map(readWindow).filter(row => row.start > now)
}

function suggest(db, schedule, request, pending = feasibleRequests(schedule)) {
  const blocks = [...pending, ...pendingForStudent(db, request, schedule.now)].filter(row => row.id !== request.id)
  return alternatives(schedule, request, blocks)
}

const feasibleRequests = schedule => schedule.pending.filter(row => isEligible(row) && !slotIssue(schedule, row))

const priorityRules = [
  [entry => entry.flexible, 'Priority went to the request with no other feasible slot for the same duration.'],
  [entry => entry.slack, 'Priority went to the project with less time to finish the session before its deadline.'],
  [entry => !entry.request.required, 'Priority went to the project that lists this equipment as required.'],
  [entry => entry.usage, 'Priority went to the student with less use of this equipment over the past 30 days.'],
]
const order = entry => entry.request.submissionOrder
const firstCome = 'Priority went to the request submitted first.'

function comparePriority(a, b) {
  if (a.aged !== b.aged) return a.aged ? -1 : 1
  if (!a.aged) {
    for (const [value] of priorityRules) {
      if (value(a) < value(b)) return -1
      if (value(a) > value(b)) return 1
    }
  }
  return order(a) - order(b)
}

function priorityReason(winner, other) {
  if (winner.aged !== other.aged) return 'Priority went to the request that has waited at least 48 hours.'
  if (winner.aged) return firstCome
  return priorityRules.find(([value]) => value(winner) !== value(other))?.[1] ?? firstCome
}

function preferredRequests(db, schedule) {
  const feasible = feasibleRequests(schedule)
  const ranked = feasible.map(request => ({
    request,
    aged: !request.createdAt || schedule.now - Date.parse(request.createdAt) >= 2 * day,
    flexible: !feasible.some(row => row.id !== request.id && overlaps(row, request)) ||
      suggest(db, schedule, request, feasible).length > 0,
    slack: deadline(request) - schedule.now - (request.end - request.start),
    usage: schedule.reservations.reduce((total, row) => {
      if (row.userId !== request.userId || row.resourceId !== request.resourceId || row.end > schedule.now) return total
      return total + Math.max(0, row.end - Math.max(row.start, schedule.now - 30 * day))
    }, 0),
  })).sort(comparePriority)

  const selected = []
  const blocked = new Map()
  for (const entry of ranked) {
    const winner = selected.find(other => overlaps(other.request, entry.request))
    if (winner) blocked.set(entry.request.id, { winnerId: winner.request.id, reason: priorityReason(winner, entry) })
    else selected.push(entry)
  }
  return blocked
}

function assessPending(db, schedule, request, blocked) {
  if (!isEligible(request)) {
    return { canApprove: false, reason: 'The request must belong to the student who owns the project.', alternatives: [] }
  }
  const issue = slotIssue(schedule, request)
  const priority = blocked.get(request.id)
  if (issue || priority) {
    return {
      canApprove: false,
      reason: issue ?? 'A competing request is recommended for this time. ' + priority.reason,
      alternatives: suggest(db, schedule, request),
    }
  }
  const competition = [...blocked.values()].find(result => result.winnerId === request.id)
  return {
    canApprove: true,
    reason: competition ? 'This request is recommended for faculty approval. ' + competition.reason
      : 'This time is available and awaiting faculty approval.',
    alternatives: competition ? suggest(db, schedule, request) : [],
  }
}

export function addSchedulingGuidance(db, bookings, now = Date.now()) {
  const schedules = new Map()
  return bookings.map(booking => {
    if (booking.status !== 'pending') return booking
    if (!schedules.has(booking.resourceId)) {
      const schedule = resourceSchedule(db, booking.resourceId, now)
      schedules.set(booking.resourceId, { schedule, blocked: preferredRequests(db, schedule) })
    }
    const { schedule, blocked } = schedules.get(booking.resourceId)
    const request = schedule.pending.find(row => row.id === booking.id)
    const scheduling = request && assessPending(db, schedule, request, blocked)
    return { ...booking, scheduling }
  })
}

export function validateApprovalSlot(db, request, now) {
  if (!isEligible(request)) throw new SchedulingError(403, 'The request must belong to the student who owns the project.')
  const schedule = resourceSchedule(db, request.resourceId, now)
  const guidance = assessPending(db, schedule, request, preferredRequests(db, schedule))
  if (!guidance.canApprove) throw new SchedulingError(409, guidance.reason, guidance.alternatives)
}

export function createBooking(db, actor, input, clock = Date.now) {
  if (actor.role !== 'student') throw new SchedulingError(403, 'A student demo account is required to request equipment.')
  const start = parseTimestamp(input?.startsAt)
  const end = parseTimestamp(input?.endsAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new SchedulingError(400, 'Enter valid start and end timestamps with a time zone.')
  }
  if (end - start < minDuration || end - start > maxDuration) {
    throw new SchedulingError(400, 'A session must last between 15 minutes and 8 hours.')
  }
  const purpose = typeof input.purpose === 'string' ? input.purpose.trim() : ''
  if (!purpose || purpose.length > 500 || typeof input.projectId !== 'string' || typeof input.resourceId !== 'string') {
    throw new SchedulingError(400, 'Select a project and equipment, and enter a purpose of up to 500 characters.')
  }

  return inWriteTransaction(db, () => {
    const now = clock()
    const project = db.prepare('SELECT owner_id AS ownerId, deadline_at AS deadlineAt FROM projects WHERE id = ?').get(input.projectId)
    if (!project || project.ownerId !== actor.id) throw new SchedulingError(403, 'Choose a project that belongs to you.')
    const request = { ...project, userId: actor.id, resourceId: input.resourceId, start, end }
    const schedule = resourceSchedule(db, input.resourceId, now)
    if (!schedule.resource) throw new SchedulingError(404, 'Equipment not found.')
    let previous
    if (input.replaceRequestId !== undefined) {
      if (typeof input.replaceRequestId !== 'string') throw new SchedulingError(400, 'Invalid request to reschedule.')
      previous = getSchedulingRequest(db, input.replaceRequestId)
      if (!previous || previous.userId !== actor.id || previous.projectId !== input.projectId || previous.resourceId !== input.resourceId) {
        throw new SchedulingError(403, 'You can reschedule only your own request for this project and equipment.')
      }
      if (previous.status !== 'pending') throw new SchedulingError(409, 'This request is no longer pending. Check My Bookings for its status.')
      request.id = previous.id
    }
    const issue = slotIssue(schedule, request)
    if (issue) throw new SchedulingError(409, issue, suggest(db, schedule, request))
    if (pendingForStudent(db, request, now).some(row => row.id !== previous?.id && overlaps(row, request))) {
      throw new SchedulingError(409, 'You already have a pending request during this time.', suggest(db, schedule, request))
    }

    const id = randomUUID()
    const status = schedule.resource.requiresApproval ? 'pending' : 'approved'
    if (previous) {
      db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(previous.id)
      schedule.pending = schedule.pending.filter(row => row.id !== previous.id)
    }
    db.prepare(`
      INSERT INTO bookings (id, user_id, project_id, resource_id, starts_at, ends_at, status, purpose, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, actor.id, input.projectId, input.resourceId, iso(start), iso(end), status, purpose, iso(now))

    if (status === 'approved') return { id, status, reason: 'Your equipment reservation is confirmed.', alternatives: [] }
    const pending = getSchedulingRequest(db, id)
    schedule.pending.push(pending)
    const guidance = assessPending(db, schedule, pending, preferredRequests(db, schedule))
    return { id, status, reason: guidance.reason, alternatives: guidance.alternatives }
  })
}
