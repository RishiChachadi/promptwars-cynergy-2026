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
