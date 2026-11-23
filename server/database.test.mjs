import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideApproval, listApprovalQueue, listBookings } from './approvals.mjs'
import { createProjectAssistant } from './assistant.mjs'
import { openDatabase } from './database.mjs'
import { getResource, listResources } from './resources.mjs'
import { seedDemo } from './seed.mjs'

const faculty = { id: 'demo-faculty', role: 'faculty', department: 'ECE' }
const student = { id: 'demo-student', role: 'student', department: 'ECE' }

test('catalog search and filters use real SQLite fixtures', t => {
  const db = openDatabase(':memory:')
  t.after(() => db.close())
  seedDemo(db)

  const all = listResources(db, {})
  assert.equal(all.length, 6)
  assert.deepEqual(new Set(all.map(item => item.department)), new Set(['ECE', 'CSE', 'Mechanical']))
  assert.deepEqual(listResources(db, { q: 'bluetooth', department: 'ece', status: 'available' }).map(item => item.id), ['esp32-devkit'])
  assert.deepEqual(listResources(db, { category: 'Digital Fabrication', status: 'maintenance' }).map(item => item.id), ['laser-cutter'])
  assert.deepEqual(listResources(db, { q: "%' OR 1=1 --" }), [])
  const printer = getResource(db, 'fdm-3d-printer')
  assert.equal(printer.requiresApproval, true)
  assert.ok(printer.specifications.length > 0)
  assert.ok(printer.availability.every(item => item.kind === 'open'))
  assert.equal(printer.availability.length, 3)
  assert.equal(getResource(db, 'missing'), null)
})

test('faculty decisions enforce role, department, required approval, and pending state', t => {
  const db = openDatabase(':memory:')
  t.after(() => db.close())

  assert.throws(() => listApprovalQueue(db, student), { status: 403 })
  assert.deepEqual(listApprovalQueue(db, faculty).map(item => item.id), ['bk-105', 'bk-104'])
  assert.throws(() => decideApproval(db, student, 'bk-104', 'approved'), { status: 403 })
  assert.throws(() => decideApproval(db, faculty, 'bk-103', 'approved'), { status: 403 })
  assert.throws(() => decideApproval(db, faculty, 'bk-102', 'approved'), { status: 409 })
  assert.throws(() => decideApproval(db, faculty, 'bk-104', 'invalid'), { status: 400 })
  assert.throws(() => decideApproval(db, faculty, 'missing', 'approved'), { status: 404 })
  assert.deepEqual(decideApproval(db, faculty, 'bk-104', 'approved'), { id: 'bk-104', status: 'approved' })
  assert.deepEqual(decideApproval(db, faculty, 'bk-105', 'declined'), { id: 'bk-105', status: 'declined' })
  assert.throws(() => decideApproval(db, faculty, 'bk-104', 'declined'), { status: 409 })
  assert.deepEqual(listApprovalQueue(db, faculty), [])
  assert.equal(listBookings(db, student.id).find(item => item.id === 'bk-104').status, 'approved')
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM faculty_approvals').get().count, 2)
})

test('assistant status stays unavailable and does not echo provider settings', () => {
  assert.equal(createProjectAssistant({}).status().mode, 'unavailable')
  const status = createProjectAssistant({ GEMINI_API_KEY: 'example-placeholder', GEMINI_MODEL: 'example-model' }).status()
  assert.equal(status.mode, 'unavailable')
  assert.doesNotMatch(JSON.stringify(status), /example-placeholder|example-model/)
})
