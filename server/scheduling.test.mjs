import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from './app.mjs'
import { decideApproval, listBookings } from './approvals.mjs'
import { createProjectAssistant } from './assistant.mjs'
import { openDatabase } from './database.mjs'
import { createBooking } from './scheduling.mjs'

const time = (hour, date = '2030-01-10') => date + 'T' + hour + ':00.000Z'
const clock = () => Date.parse(time('00:00', '2030-01-01'))
const student = { id: 'demo-student', role: 'student' }
const other = { id: 'student-aarav', role: 'student' }
const faculty = { id: 'demo-faculty', role: 'faculty', department: 'ECE' }
const fpga = 'fpga-board'
const oscilloscope = 'digital-oscilloscope'

function fixture(t) {
  const db = openDatabase(':memory:', new Date(clock()))
  t.after(() => db.close())
  db.exec('DELETE FROM bookings; DELETE FROM availability; UPDATE projects SET deadline_at = NULL;')
  return {
    db,
    window(resourceId, start, end, kind = 'open') {
      db.prepare('INSERT INTO availability (resource_id, starts_at, ends_at, kind) VALUES (?, ?, ?, ?)')
        .run(resourceId, time(start), time(end), kind)
    },
    deadline(projectId, timestamp) {
      db.prepare('UPDATE projects SET deadline_at = ? WHERE id = ?').run(timestamp, projectId)
    },
  }
}

function input(resourceId, startsAt = '10:00', endsAt = '11:00', projectId = 'campus-air') {
  return { resourceId, projectId, purpose: 'Project testing', startsAt: time(startsAt), endsAt: time(endsAt) }
}

test('booking API confirms general access sessions and enforces eligibility and timestamp validation', async t => {
  const { db, window } = fixture(t)
  window(oscilloscope, '09:00', '17:00')
  const server = createApp({ db, clock, assistant: createProjectAssistant({}) }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const url = path => 'http://127.0.0.1:' + server.address().port + '/api' + path
  const headers = account => ({ 'Content-Type': 'application/json', 'x-lablink-demo-account': account })
  const post = (body, account = student.id) => fetch(url('/bookings'), {
    method: 'POST', headers: headers(account), body: JSON.stringify(body),
  })
  const body = input(oscilloscope)
  assert.equal((await post(body, 'unknown')).status, 401)
  assert.equal((await post(body, faculty.id)).status, 403)
  assert.equal((await post({ ...body, projectId: 'signal-filter' })).status, 403)
  assert.equal((await post({ ...body, startsAt: '2030-02-30T09:00:00Z' })).status, 400)
  assert.equal((await post({ ...body, startsAt: '2030-01-10T10:00' })).status, 400)
  assert.equal((await post(input(oscilloscope, '10:00', '10:14'))).status, 400)
  assert.equal((await post(input(oscilloscope, '09:00', '17:01'))).status, 400)
  assert.equal((await post(input(oscilloscope, '11:00', '10:00'))).status, 400)
  const result = await post({ ...body, startsAt: '2030-01-10T15:30:00+05:30' })
  assert.equal(result.status, 201)
  const confirmed = await result.json()
  assert.equal(confirmed.status, 'approved')
  assert.match(confirmed.reason, /confirmed/)
  const [booking] = await (await fetch(url('/bookings'), { headers: headers(student.id) })).json()
  assert.equal(booking.id, confirmed.id)
  assert.equal(booking.startsAt, body.startsAt)
})

test('confirmed bookings and maintenance use half-open boundaries and suggestions fit working hours', t => {
  const { db, window, deadline } = fixture(t)
  window(oscilloscope, '09:00', '12:00')
  window(oscilloscope, '12:00', '14:00')
  window(oscilloscope, '15:00', '17:00')
  window(oscilloscope, '11:00', '12:00', 'maintenance')
  deadline('campus-air', time('16:00'))
  assert.equal(createBooking(db, student, input(oscilloscope), clock).status, 'approved')
  assert.throws(() => createBooking(db, student, input(oscilloscope, '10:15', '10:45'), clock), error => {
    assert.match(error.message, /confirmed reservation/)
    assert.deepEqual(error.alternatives, [
      { startsAt: time('09:30'), endsAt: time('10:00') },
      { startsAt: time('12:00'), endsAt: time('12:30') },
      { startsAt: time('15:00'), endsAt: time('15:30') },
    ])
    return true
  })
  assert.equal(createBooking(db, student, input(oscilloscope, '09:00', '10:00'), clock).status, 'approved')
  assert.throws(() => createBooking(db, student, input(oscilloscope, '11:00', '12:00'), clock), /maintenance/)
  assert.equal(createBooking(db, student, input(oscilloscope, '12:00', '13:00'), clock).status, 'approved')
  assert.throws(() => createBooking(db, student, input(oscilloscope, '13:30', '15:30'), clock), /lab hours/)
  assert.throws(() => createBooking(db, student, input(oscilloscope, '16:00', '17:00'), clock), /project deadline/)
  assert.equal(createBooking(db, student, input(oscilloscope, '15:00', '16:00'), clock).status, 'approved')
})

test('equipment status and approval-time availability are enforced', t => {
  const { db, window } = fixture(t)
  window('laser-cutter', '09:00', '17:00')
  assert.throws(() => createBooking(db, student, input('laser-cutter'), clock), {
    status: 409, message: 'This equipment is currently unavailable for booking.', alternatives: [],
  })
  window(fpga, '09:00', '17:00')
  const booking = createBooking(db, student, input(fpga), clock)
  window(fpga, '10:00', '11:00', 'maintenance')
  assert.throws(() => decideApproval(db, faculty, booking.id, 'approved', clock), /maintenance/)
  assert.equal(listBookings(db, student.id, clock())[0].status, 'pending')
  assert.equal(db.prepare('SELECT count(*) AS count FROM faculty_approvals').get().count, 0)
})

test('the better-ranked request wins competing approvals and the other student can reschedule', async t => {
  const { db, window, deadline } = fixture(t)
  window(fpga, '09:00', '17:00')
  window(fpga, '11:00', '12:00', 'maintenance')
  deadline('campus-air', time('17:00'))
  deadline('signal-filter', time('13:00'))
  const first = createBooking(db, student, input(fpga), clock)
  const second = createBooking(db, other, input(fpga, '10:00', '11:00', 'signal-filter'), clock)
  assert.equal(first.status, 'pending')
  assert.equal(second.status, 'pending')
  assert.match(second.reason, /deadline/)
  assert.throws(() => createBooking(db, student, input(fpga), clock), /already have a pending request/)
  assert.throws(() => decideApproval(db, faculty, first.id, 'approved', clock), /deadline/)
  const server = createApp({ db, clock }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const approve = id => fetch('http://127.0.0.1:' + server.address().port + '/api/approvals/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lablink-demo-account': faculty.id },
    body: JSON.stringify({ decision: 'approved' }),
  })
  const decisions = await Promise.all([approve(first.id), approve(second.id)])
  assert.deepEqual(decisions.map(response => response.status), [409, 200])
  assert.equal(db.prepare("SELECT count(*) AS count FROM bookings WHERE status = 'approved'").get().count, 1)
  assert.equal(db.prepare("SELECT count(*) AS count FROM faculty_approvals").get().count, 1)
  const [original] = listBookings(db, student.id, clock())
  assert.match(original.scheduling.reason, /confirmed reservation/)
  assert.equal(original.status, 'pending')
  const slot = original.scheduling.alternatives[0]
  assert.deepEqual(slot, { startsAt: time('09:00'), endsAt: time('10:00') })
  assert.throws(() => createBooking(db, other, {
    ...input(fpga, '09:00', '10:00', 'signal-filter'), replaceRequestId: original.id,
  }, clock), { status: 403 })
  const moved = createBooking(db, student, { ...input(fpga), ...slot, replaceRequestId: original.id }, clock)
  assert.equal(moved.status, 'pending')
  assert.equal(listBookings(db, student.id, clock()).find(row => row.id === original.id).status, 'cancelled')
  assert.equal(decideApproval(db, faculty, moved.id, 'approved', clock).status, 'approved')
})

for (const factor of ['flexibility', 'equipment requirements', 'prior usage', 'waiting time', 'submission order']) {
  test('request priority uses ' + factor, t => {
    const { db, window, deadline } = fixture(t)
    window(fpga, '09:00', '17:00')
    db.exec("DELETE FROM project_equipment_requirements WHERE resource_id = 'fpga-board'")
    if (factor === 'flexibility') {
      deadline('signal-filter', time('11:00'))
      window(fpga, '09:00', '10:00', 'maintenance')
    }
    if (factor === 'equipment requirements') {
      db.exec("INSERT INTO project_equipment_requirements VALUES ('signal-filter', 'fpga-board')")
    }
    if (factor === 'prior usage') {
      db.prepare(`
        INSERT INTO bookings (id, user_id, project_id, resource_id, starts_at, ends_at, status, purpose)
        VALUES ('history', ?, 'campus-air', ?, ?, ?, 'approved', 'Previous session')
      `).run(student.id, fpga, time('10:00', '2029-12-31'), time('11:00', '2029-12-31'))
    }
    const firstClock = factor === 'waiting time' ? () => clock() - 2 * 24 * 60 * 60_000 : clock
    if (factor === 'waiting time') deadline('signal-filter', time('13:00'))
    const first = createBooking(db, student, input(fpga), firstClock)
    const second = createBooking(db, other, input(fpga, '10:00', '11:00', 'signal-filter'), clock)
    const firstWins = factor === 'waiting time' || factor === 'submission order'
    const loser = firstWins ? second : first
    const reasons = {
      flexibility: /no other feasible slot/,
      'equipment requirements': /lists this equipment as required/,
      'prior usage': /less use/,
      'waiting time': /waited at least 48 hours/,
      'submission order': /submitted first/,
    }
    assert.throws(() => decideApproval(db, faculty, loser.id, 'approved', clock), reasons[factor])
    assert.equal(decideApproval(db, faculty, firstWins ? first.id : second.id, 'approved', clock).status, 'approved')
  })
}
