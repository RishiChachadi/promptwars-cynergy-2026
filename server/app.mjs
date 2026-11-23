import express from 'express'
import { ApprovalError, decideApproval, listApprovalQueue, listBookings } from './approvals.mjs'
import { AssistantError } from './assistant.mjs'
import { createProject, ProjectError } from './projects.mjs'
import { getResource, listResources } from './resources.mjs'
import { createBooking, SchedulingError } from './scheduling.mjs'
import { demoAccountIds } from './seed.mjs'

export function createApp({ db, assistant, staticDirectory, clock = Date.now }) {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.use('/api', express.json({ limit: '8kb' }))

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

  app.get('/api/bookings', demoAccount, (_req, res) => res.json(listBookings(db, res.locals.actor.id, clock())))
  app.post('/api/bookings', demoAccount, (req, res) => {
    res.status(201).json(createBooking(db, res.locals.actor, req.body, clock))
  })
  app.get('/api/projects', demoAccount, (_req, res) => {
    res.json(db.prepare('SELECT id, title, description, deadline_at AS deadlineAt FROM projects WHERE owner_id = ? ORDER BY title').all(res.locals.actor.id))
  })
  app.post('/api/projects', demoAccount, (req, res) => {
    res.status(201).json(createProject(db, res.locals.actor, req.body, clock))
  })
  app.get('/api/approvals', demoAccount, (_req, res) => res.json(listApprovalQueue(db, res.locals.actor, clock())))
  app.post('/api/approvals/:id', demoAccount, (req, res) => {
    res.json(decideApproval(db, res.locals.actor, req.params.id, req.body?.decision, clock))
  })
  app.get('/api/assistant/status', (_req, res) => res.json(assistant.status()))
  app.post('/api/assistant/recommendations', demoAccount, async (req, res) => {
    res.json(await assistant.recommend(res.locals.actor, req.body))
  })
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
    if (error instanceof ApprovalError || error instanceof AssistantError || error instanceof ProjectError) {
      return res.status(error.status).json({ error: error.message })
    }
    if (error instanceof SchedulingError) {
      return res.status(error.status).json({ error: error.message, alternatives: error.alternatives })
    }
    if (error instanceof URIError && error.status === 400) {
      return res.status(400).json({ error: 'Invalid URL encoding.' })
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request.' })
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.' })
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      return res.status(415).json({ error: 'Unsupported request encoding. Send UTF-8 JSON.' })
    }
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  })
  return app
}
