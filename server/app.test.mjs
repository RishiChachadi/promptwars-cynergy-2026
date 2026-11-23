import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from './app.mjs'
import { createProjectAssistant } from './assistant.mjs'
import { openDatabase } from './database.mjs'

test('Express API exposes catalog and enforces demo account permissions', async t => {
  const db = openDatabase(':memory:')
  t.after(() => db.close())
  const app = createApp({ db, assistant: createProjectAssistant({}, { db }) })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

  const request = (path, options) => fetch('http://127.0.0.1:' + server.address().port + '/api' + path, options)
  const approve = (id, account) => request('/approvals/' + id, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lablink-demo-account': account },
    body: JSON.stringify({ decision: 'approved' }),
  })

  assert.equal((await request('/health')).status, 200)
  assert.deepEqual((await (await request('/demo-accounts')).json()).map(account => account.id),
    ['demo-student', 'demo-faculty', 'faculty-mech', 'faculty-cse'])
  assert.deepEqual((await (await request('/resources?q=esp32&department=ECE')).json()).map(item => item.id), ['esp32-devkit'])
  assert.equal((await request('/resources?q=a&q=b')).status, 400)
  assert.equal((await request('/resources/gpu-workstation')).status, 200)
  assert.equal((await request('/resources/missing')).status, 404)
  assert.equal((await request('/resources/%E0%A4%A')).status, 400)
  assert.equal((await request('/approvals')).status, 401)
  assert.equal((await approve('bk-104', 'demo-student')).status, 403)
  assert.equal((await approve('bk-103', 'demo-faculty')).status, 403)
  assert.equal((await approve('bk-104', 'demo-faculty')).status, 200)
  assert.equal((await approve('bk-104', 'demo-faculty')).status, 409)
  assert.equal((await (await request('/assistant/status')).json()).mode, 'unavailable')

  const recommend = (description, account, projectId) => request('/assistant/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(account && { 'x-lablink-demo-account': account }) },
    body: JSON.stringify({ description, projectId }),
  })
  assert.equal((await recommend('Measure waveforms')).status, 401)
  assert.equal((await recommend('Measure waveforms', 'demo-faculty')).status, 403)
  assert.equal((await recommend('Measure waveforms', 'demo-student', 'signal-filter')).status, 403)
  assert.equal((await recommend('x'.repeat(1201), 'demo-student')).status, 400)
  const answer = await recommend('Measure waveforms', 'demo-student', 'campus-air')
  assert.equal(answer.status, 200)
  assert.equal((await answer.json()).recommendations[0].resourceId, 'digital-oscilloscope')

  const bookingHeaders = { 'Content-Type': 'application/json', 'x-lablink-demo-account': 'demo-student' }
  const malformed = await request('/bookings', { method: 'POST', headers: bookingHeaders, body: '{' })
  assert.equal(malformed.status, 400)
  assert.equal(malformed.headers.get('Cache-Control'), 'no-store')
  const unsupported = await request('/bookings', {
    method: 'POST', headers: { ...bookingHeaders, 'Content-Encoding': 'invalid' }, body: '{}',
  })
  assert.equal(unsupported.status, 415)
  assert.equal((await request('/bookings', {
    method: 'POST', headers: bookingHeaders, body: JSON.stringify({ purpose: 'x'.repeat(8192) }),
  })).status, 413)

  const { startsAt } = db.prepare(`
    SELECT starts_at AS startsAt FROM availability WHERE resource_id = 'fpga-board'
    ORDER BY starts_at LIMIT 1
  `).get()
  const body = JSON.stringify({
    projectId: 'campus-air', resourceId: 'fpga-board', purpose: 'Verify repeated submission handling',
    startsAt, endsAt: new Date(Date.parse(startsAt) + 30 * 60_000).toISOString(),
    status: 'approved', userId: 'student-aarav',
  })
  assert.equal((await request('/bookings', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
  })).status, 401)
  const submit = () => request('/bookings', { method: 'POST', headers: bookingHeaders, body })
  const submissions = await Promise.all([submit(), submit(), submit()])
  assert.deepEqual(submissions.map(response => response.status).toSorted(), [201, 409, 409])
  const booking = await submissions.find(response => response.status === 201).json()
  assert.equal(booking.status, 'pending')
  const saved = db.prepare('SELECT user_id AS userId, status FROM bookings WHERE id = ?').get(booking.id)
  assert.equal(saved.userId, 'demo-student')
  assert.equal(saved.status, 'pending')
  const decisions = await Promise.all([approve(booking.id, 'demo-faculty'), approve(booking.id, 'demo-faculty')])
  assert.deepEqual(decisions.map(response => response.status).toSorted(), [200, 409])
})

test('students can create owned projects with equipment requirements and book against their deadlines', async t => {
  const now = Date.parse('2035-01-10T00:00:00Z')
  const db = openDatabase(':memory:', new Date(now))
  t.after(() => db.close())
  const app = createApp({ db, clock: () => now, assistant: createProjectAssistant({}, { db }) })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

  const base = 'http://127.0.0.1:' + server.address().port + '/api'
  const headers = account => ({
    'Content-Type': 'application/json',
    ...(account && { 'x-lablink-demo-account': account }),
  })
  const post = (path, payload, account = 'demo-student') => fetch(base + path, {
    method: 'POST', headers: headers(account), body: JSON.stringify(payload),
  })
  const input = {
    title: '  Water quality monitor  ',
    description: '  Prototype a networked sensor.  ',
    deadlineAt: '2035-01-12T09:30:00+05:30',
    equipmentIds: ['esp32-devkit', 'digital-oscilloscope'],
    ownerId: 'student-aarav',
  }

  assert.equal((await post('/projects', input, null)).status, 401)
  assert.equal((await post('/projects', input, 'demo-faculty')).status, 403)
  for (const invalid of [
    { title: ' ' }, { title: 'x'.repeat(121) }, { description: null }, { description: 'x'.repeat(1201) },
    { deadlineAt: '2035-01-12T09:30:00' }, { deadlineAt: '2035-02-30T12:00:00Z' },
    { deadlineAt: '2035-01-10T00:00:00Z' }, { deadlineAt: '2035-01-09T23:59:00Z' },
    { equipmentIds: null }, { equipmentIds: [42] }, { equipmentIds: ['esp32-devkit', 'esp32-devkit'] },
    { equipmentIds: ['esp32-devkit', 'missing-equipment'] },
  ]) {
    assert.equal((await post('/projects', { ...input, ...invalid })).status, 400, JSON.stringify(invalid))
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM projects').get().count, 2)
  assert.equal(db.prepare('SELECT count(*) AS count FROM project_equipment_requirements').get().count, 4)

  const response = await post('/projects', input)
  assert.equal(response.status, 201)
  const project = await response.json()
  assert.deepEqual(project, {
    id: project.id, title: 'Water quality monitor', description: 'Prototype a networked sensor.',
    deadlineAt: '2035-01-12T04:00:00.000Z',
  })
  assert.match(project.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(db.prepare('SELECT owner_id FROM projects WHERE id = ?').get(project.id).owner_id, 'demo-student')
  assert.deepEqual(db.prepare(
    'SELECT resource_id FROM project_equipment_requirements WHERE project_id = ? ORDER BY resource_id',
  ).all(project.id).map(row => row.resource_id), ['digital-oscilloscope', 'esp32-devkit'])
  const studentProjects = await fetch(base + '/projects', { headers: headers('demo-student') })
  const availableProjects = await studentProjects.json()
  assert.ok(availableProjects.some(item => item.id === 'campus-air'))
  assert.deepEqual(availableProjects.find(item => item.id === project.id), project)
  const facultyProjects = await fetch(base + '/projects', { headers: headers('demo-faculty') })
  assert.deepEqual(await facultyProjects.json(), [])

  const booking = {
    projectId: project.id, resourceId: 'esp32-devkit', purpose: 'Test telemetry',
    startsAt: '2035-01-12T03:30:00.000Z', endsAt: project.deadlineAt,
  }
  const tooLate = await post('/bookings', { ...booking, endsAt: '2035-01-12T04:01:00.000Z' })
  assert.equal(tooLate.status, 409)
  assert.match((await tooLate.json()).error, /project deadline/)
  const booked = await post('/bookings', booking)
  assert.equal(booked.status, 201)
  assert.equal((await booked.json()).status, 'approved')
})
