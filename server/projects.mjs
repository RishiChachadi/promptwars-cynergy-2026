import { randomUUID } from 'node:crypto'
import { inWriteTransaction, parseTimestamp } from './scheduling.mjs'

export class ProjectError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function createProject(db, actor, input, clock = Date.now) {
  if (actor.role !== 'student') throw new ProjectError(403, 'A student demo account is required to create a project.')
  const title = typeof input?.title === 'string' ? input.title.trim() : ''
  const description = typeof input?.description === 'string' ? input.description.trim() : ''
  if (!title || title.length > 120) throw new ProjectError(400, 'Enter a project title of up to 120 characters.')
  if (!description || description.length > 1200) throw new ProjectError(400, 'Enter a project description of up to 1200 characters.')

  const deadline = parseTimestamp(input.deadlineAt)
  if (!Number.isFinite(deadline)) throw new ProjectError(400, 'Enter a valid project deadline with a time zone.')
  const equipmentIds = input.equipmentIds === undefined ? [] : input.equipmentIds
  if (!Array.isArray(equipmentIds) || equipmentIds.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(equipmentIds).size !== equipmentIds.length) {
    throw new ProjectError(400, 'Select each required equipment item at most once.')
  }

  return inWriteTransaction(db, () => {
    if (deadline <= clock()) throw new ProjectError(400, 'The project deadline must be in the future.')
    const resource = db.prepare('SELECT 1 FROM resources WHERE id = ?')
    if (equipmentIds.some(id => !resource.get(id))) throw new ProjectError(400, 'Select required equipment from the catalog.')

    const project = { id: randomUUID(), title, description, deadlineAt: new Date(deadline).toISOString() }
    db.prepare('INSERT INTO projects (id, owner_id, title, description, deadline_at) VALUES (?, ?, ?, ?, ?)')
      .run(project.id, actor.id, title, description, project.deadlineAt)
    const requirement = db.prepare('INSERT INTO project_equipment_requirements (project_id, resource_id) VALUES (?, ?)')
    for (const id of equipmentIds) requirement.run(project.id, id)
    return project
  })
}
