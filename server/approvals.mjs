import { addSchedulingGuidance, getSchedulingRequest, inWriteTransaction, validateApprovalSlot } from './scheduling.mjs'

export class ApprovalError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const bookingFields = `
  b.id, b.status, b.starts_at AS startsAt, b.ends_at AS endsAt, b.purpose,
  r.id AS resourceId, r.name AS resourceName, r.department, r.lab,
  p.id AS projectId, p.title AS projectTitle, u.name AS studentName
`
const bookingJoins = `
  FROM bookings b
  JOIN resources r ON r.id = b.resource_id
  JOIN projects p ON p.id = b.project_id
  JOIN users u ON u.id = b.user_id
`

export function listBookings(db, userId, now) {
  const bookings = db.prepare(`SELECT ${bookingFields} ${bookingJoins} WHERE b.user_id = ? ORDER BY b.starts_at, b.id`).all(userId)
  return addSchedulingGuidance(db, bookings, now)
}

function requireFaculty(actor) {
  if (actor.role !== 'faculty') throw new ApprovalError(403, 'A faculty demo account is required.')
}

export function listApprovalQueue(db, actor, now) {
  requireFaculty(actor)
  const bookings = db.prepare(`
    SELECT ${bookingFields} ${bookingJoins}
    WHERE r.department = ? AND r.requires_approval = 1 AND b.status = 'pending'
    ORDER BY b.starts_at, b.id
  `).all(actor.department)
  return addSchedulingGuidance(db, bookings, now)
}

export function decideApproval(db, actor, id, decision, clock = Date.now) {
  requireFaculty(actor)
  if (decision !== 'approved' && decision !== 'declined') {
    throw new ApprovalError(400, 'Decision must be approved or declined.')
  }
  return inWriteTransaction(db, () => {
    const booking = db.prepare(`
      SELECT b.status, r.department, r.requires_approval AS requiresApproval
      FROM bookings b JOIN resources r ON r.id = b.resource_id WHERE b.id = ?
    `).get(id)
    if (!booking) throw new ApprovalError(404, 'Booking not found.')
    if (booking.department !== actor.department) {
      throw new ApprovalError(403, 'Faculty can review requests from their own department.')
    }
    if (!booking.requiresApproval || booking.status !== 'pending') {
      throw new ApprovalError(409, 'This request is no longer pending faculty review.')
    }

    const now = clock()
    if (decision === 'approved') validateApprovalSlot(db, getSchedulingRequest(db, id), now)
    db.prepare('INSERT INTO faculty_approvals VALUES (?, ?, ?, ?)')
      .run(id, actor.id, decision, new Date(now).toISOString())
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(decision, id)
    return { id, status: decision }
  })
}
