import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { createApp } from './app.mjs'
import { createProjectAssistant } from './assistant.mjs'
import { openDatabase } from './database.mjs'

test('Express API exposes catalog and enforces demo account permissions', async t => {
  const db = openDatabase(':memory:')
  t.after(() => db.close())
  const app = createApp({ db, assistant: createProjectAssistant({}) })
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
  assert.equal((await (await request('/demo-accounts')).json()).length, 2)
  assert.deepEqual((await (await request('/resources?q=esp32&department=ECE')).json()).map(item => item.id), ['esp32-devkit'])
  assert.equal((await request('/resources?q=a&q=b')).status, 400)
  assert.equal((await request('/resources/gpu-workstation')).status, 200)
  assert.equal((await request('/resources/missing')).status, 404)
  assert.equal((await request('/approvals')).status, 401)
  assert.equal((await approve('bk-104', 'demo-student')).status, 403)
  assert.equal((await approve('bk-103', 'demo-faculty')).status, 403)
  assert.equal((await approve('bk-104', 'demo-faculty')).status, 200)
  assert.equal((await approve('bk-104', 'demo-faculty')).status, 409)
  assert.equal((await (await request('/assistant/status')).json()).mode, 'unavailable')
})
