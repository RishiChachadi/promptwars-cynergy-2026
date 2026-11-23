import express from 'express'
import { ApprovalError, decideApproval, listApprovalQueue, listBookings } from './approvals.mjs'
import { getResource, listResources } from './resources.mjs'
import { demoAccountIds } from './seed.mjs'

export function createApp({ db, assistant, staticDirectory }) {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', express.json({ limit: '8kb' }))
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  function demoAccount(req, res, next) {
    const id = req.get('x-lablink-demo-account')
    if (!demoAccountIds.includes(id)) return res.status(401).json({ error: 'Select a demo account.' })
    const actor = db.prepare('SELECT id, name, role, department FROM users WHERE id = ?').get(id)
    if (!actor) return res.status(401).json({ error: 'Demo account not found.' })
    res.locals.actor = actor
    next()
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/demo-accounts', (_req, res) => {
    const account = db.prepare('SELECT id, name, role, department FROM users WHERE id = ?')
    res.json(demoAccountIds.map(id => account.get(id)))
  })

  app.get('/api/resources', (req, res) => {
    const filters = {}
    for (const field of ['q', 'department', 'category', 'status']) {
      const value = req.query[field]
      if (value === undefined) continue
      if (typeof value !== 'string' || value.length > 160) {
        return res.status(400).json({ error: `Invalid ${field} filter.` })
      }
      filters[field] = value.trim()
    }
    res.json(listResources(db, filters))
  })
  app.get('/api/resources/:id', (req, res) => {
    const resource = getResource(db, req.params.id)
    if (!resource) return res.status(404).json({ error: 'Equipment not found.' })
    res.json(resource)
  })

  app.get('/api/bookings', demoAccount, (_req, res) => res.json(listBookings(db, res.locals.actor.id)))
  app.get('/api/projects', demoAccount, (_req, res) => {
    res.json(db.prepare('SELECT id, title, description FROM projects WHERE owner_id = ? ORDER BY title').all(res.locals.actor.id))
  })
  app.get('/api/approvals', demoAccount, (_req, res) => res.json(listApprovalQueue(db, res.locals.actor)))
  app.post('/api/approvals/:id', demoAccount, (req, res) => {
    res.json(decideApproval(db, res.locals.actor, req.params.id, req.body?.decision))
  })
  app.get('/api/assistant/status', (_req, res) => res.json(assistant.status()))
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

  if (staticDirectory) {
    app.use(express.static(staticDirectory))
    app.get('/{*path}', (req, res, next) => {
      if (req.path.includes('.') || !req.accepts('html')) return next()
      res.sendFile('index.html', { root: staticDirectory })
    })
  }

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error)
    if (error instanceof ApprovalError) return res.status(error.status).json({ error: error.message })
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' })
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' })
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })
  return app
}
