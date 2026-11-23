import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createGeminiProvider } from './gemini.mjs'
import { listResources } from './resources.mjs'
import { previewBookingSlots } from './scheduling.mjs'

const maxDescriptionLength = 1200
const maxRecommendations = 4
const durationMinutes = 30
const minute = 60_000
const cacheTtl = 10 * minute
const callsPerMinute = 4

const questions = {
  goal: 'What are you building, and what do you need to prototype, fabricate, measure, or run?',
  electronics: 'What signals, components, or communication protocols do you need to test?',
  fabrication: 'What material and dimensions does the part require?',
  computing: 'What software or workload will you run, and what memory or compute does it need?',
}
const fallbackTerms = {
  'esp32-devkit': /\b(?:esp32|iot|microcontrollers?|wi-fi|bluetooth|air[- ]quality sensors?)\b/i,
  'digital-oscilloscope': /\b(?:oscilloscopes?|waveforms?|signal stability|signal analysis|debug(?:ging)? circuits?)\b/i,
  'fdm-3d-printer': /\b(?:3d[- ]print(?:er|ing)?|fdm|petg|pla filament)\b/i,
  'fpga-board': /\b(?:fpga|artix-7|verilog|vhdl|hdl|digital logic)\b/i,
  'gpu-workstation': /\b(?:gpu|cuda|model training|train(?:ing)? (?:an? |the )?(?:model|neural network))\b/i,
  'laser-cutter': /\b(?:laser[- ]cut(?:ter|ting)?|laser engrav(?:er|ing))\b/i,
}
const fallbackMessages = {
  unconfigured: 'Gemini is unavailable on this server. Showing catalog keyword matches.',
  failed: 'Gemini could not respond. Showing catalog keyword matches.',
  invalid: 'Gemini returned a response that could not be verified. Showing catalog keyword matches.',
  quota: 'Gemini usage is temporarily limited. Showing catalog keyword matches.',
  daily: 'LabLink reached its daily AI limit. Showing catalog keyword matches.',
  rate: 'Your account reached its AI request limit. Showing catalog keyword matches.',
  catalog: 'The catalog changed or is outside the assistant’s input limit. Showing catalog keyword matches.',
}

export class AssistantError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const factsFor = resource => [resource.summary, ...resource.specifications]
const catalogFor = resources => resources.map(resource => ({
  id: resource.id, name: resource.name, department: resource.department, status: resource.status,
  facts: factsFor(resource), usage: resource.description,
}))

function recordSchema(properties) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
}

function responseSchema(catalog) {
  return recordSchema({
    recommendations: {
      type: 'array', maxItems: maxRecommendations,
      items: recordSchema({
        resourceId: { type: 'string', enum: catalog.map(resource => resource.id) },
        fact: { type: 'integer', minimum: 0 },
        evidence: { type: 'string' },
      }),
    },
    questions: { type: 'array', maxItems: 2, items: { type: 'string', enum: Object.keys(questions) } },
  })
}

function hasFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field))
}

function validateSelection(selection, project, resources) {
  if (!hasFields(selection, ['recommendations', 'questions'])) return false
  const { recommendations, questions: codes } = selection
  if (!Array.isArray(recommendations) || recommendations.length > maxRecommendations ||
      !Array.isArray(codes) || codes.length > 2 || (!recommendations.length && !codes.length) ||
      new Set(codes).size !== codes.length || codes.some(code => typeof code !== 'string' || !Object.hasOwn(questions, code))) {
    return false
  }
  const ids = new Set()
  for (const item of recommendations) {
    if (!hasFields(item, ['resourceId', 'fact', 'evidence']) || ids.has(item.resourceId)) return false
    const resource = resources.get(item.resourceId)
    if (!resource || !Number.isInteger(item.fact) || item.fact < 0 || item.fact >= factsFor(resource).length ||
        typeof item.evidence !== 'string' || item.evidence.length < 2 || item.evidence.length > 100 ||
        item.evidence !== item.evidence.trim() || !/[\p{L}\p{N}]/u.test(item.evidence) || !project.includes(item.evidence)) {
      return false
    }
    ids.add(item.resourceId)
  }
  return true
}

function keywordMatches(project, resources) {
  const recommendations = []
  for (const resource of resources) {
    const nameIndex = project.toLowerCase().indexOf(resource.name.toLowerCase())
    const evidence = nameIndex >= 0 ? project.slice(nameIndex, nameIndex + resource.name.length)
      : Object.hasOwn(fallbackTerms, resource.id) && project.match(fallbackTerms[resource.id])?.[0]
    if (evidence) recommendations.push({ resourceId: resource.id, fact: 0, evidence })
    if (recommendations.length === maxRecommendations) break
  }
  return { recommendations, questions: recommendations.length ? [] : ['goal'] }
}

function dailyLimit(value) {
  if (value === undefined || value.trim() === '') return 20
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 0
}

export function createProjectAssistant(env, { db, clock = Date.now, ...providerOptions } = {}) {
  const generate = createGeminiProvider(env, providerOptions)
  const cap = dailyLimit(env.GEMINI_DAILY_REQUEST_CAP)
  const cache = new Map()
  const inflight = new Map()
  const userAttempts = new Map()
  let providerCooldownUntil = 0

  function claimAttempt(userId) {
    const now = clock()
    const times = (userAttempts.get(userId) ?? []).filter(time => time > now - minute)
    if (times.length >= callsPerMinute) return 'rate'
    if (providerCooldownUntil > now) return 'quota'
    const day = new Date(now + 330 * minute).toISOString().slice(0, 10)
    const claimed = cap > 0 && db.prepare(`
      INSERT INTO assistant_daily_usage (day, attempts) VALUES (?, 1)
      ON CONFLICT(day) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ?
      RETURNING attempts
    `).get(day, cap)
    if (!claimed) return 'daily'
    userAttempts.set(userId, [...times, now])
  }

  async function askGemini(userId, project, catalog, resources) {
    const schema = responseSchema(catalog)
    for (let attempt = 0; attempt < 2; attempt++) {
      const blocked = claimAttempt(userId)
      if (blocked) return { error: blocked }
      const result = await generate(project, catalog, schema)
      if (result.error === 'quota') providerCooldownUntil = clock() + minute
      if (!result.retryable || attempt === 1) {
        if (result.error) return result
        return validateSelection(result.data, project, resources) ? result : { error: 'invalid' }
      }
      await delay(150)
    }
  }

  async function select(userId, project, catalog, resources, snapshot) {
    if (!generate) return { error: 'unconfigured' }
    if (!catalog.length || Buffer.byteLength(snapshot) > 12_000) return { error: 'catalog' }
    const key = createHash('sha256').update(JSON.stringify([userId, project, snapshot])).digest('hex')
    const cached = cache.get(key)
    if (cached?.expiresAt > clock()) return { data: cached.data }
    if (inflight.has(key)) return inflight.get(key)
    cache.delete(key)
    const work = askGemini(userId, project, catalog, resources)
    inflight.set(key, work)
    try {
      const result = await work
      if (result.data) {
        if (cache.size >= 100) cache.delete(cache.keys().next().value)
        cache.set(key, { data: result.data, expiresAt: clock() + cacheTtl })
      }
      return result
    } finally {
      inflight.delete(key)
    }
  }

  function ownedProject(projectId, userId) {
    if (projectId === undefined) return null
    if (typeof projectId !== 'string' || !projectId) throw new AssistantError(400, 'Select a valid project.')
    const project = db.prepare('SELECT id, deadline_at AS deadlineAt FROM projects WHERE id = ? AND owner_id = ?').get(projectId, userId)
    if (!project) throw new AssistantError(403, 'Select a project that belongs to you.')
    return project
  }

  return {
    status() {
      if (!generate) return { mode: 'unavailable', message: 'Catalog keyword matching is available.' }
      if (cap === 0) return { mode: 'unavailable', message: fallbackMessages.daily }
      return { mode: 'available', message: 'Gemini recommendations are available.' }
    },
    async recommend(actor, input) {
      if (actor.role !== 'student') throw new AssistantError(403, 'A student demo account is required.')
      if (typeof input?.description !== 'string' || input.description.length > maxDescriptionLength || !input.description.trim()) {
        throw new AssistantError(400, 'Describe your project in 1–1200 characters.')
      }
      const description = input.description.normalize('NFC').trim().replace(/\s+/g, ' ')
      const project = ownedProject(input.projectId, actor.id)
      const initial = listResources(db, {})
      const catalog = catalogFor(initial)
      const snapshot = JSON.stringify(catalog)
      const selection = await select(actor.id, description, catalog, new Map(initial.map(item => [item.id, item])), snapshot)
      const current = listResources(db, {})
      const changed = JSON.stringify(catalogFor(current)) !== snapshot
      const reason = selection.error ?? (changed ? 'catalog' : null)
      const result = reason ? keywordMatches(description, current) : selection.data
      const resources = new Map(current.map(item => [item.id, item]))
      const now = clock()
      const currentProject = project && ownedProject(project.id, actor.id)
      return {
        mode: reason ? 'fallback' : 'gemini',
        message: reason ? fallbackMessages[reason] : null,
        projectId: currentProject?.id ?? null,
        durationMinutes,
        questions: result.questions.map(code => questions[code]),
        recommendations: result.recommendations.map(item => {
          const resource = resources.get(item.resourceId)
          return {
            resourceId: resource.id,
            name: resource.name,
            department: resource.department,
            lab: resource.lab,
            status: resource.status,
            requiresApproval: resource.requiresApproval,
            projectEvidence: item.evidence,
            capability: factsFor(resource)[item.fact],
            usage: resource.description,
            slots: previewBookingSlots(db, {
              resourceId: resource.id, userId: actor.id, deadlineAt: currentProject?.deadlineAt, durationMinutes,
            }, now),
          }
        }),
      }
    },
  }
}
