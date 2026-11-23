const resourceColumns = `
  id, name, department, lab, category, summary, description, specifications, location,
  status, requires_approval AS requiresApproval, image
`

function serializeResource(row) {
  return { ...row, specifications: JSON.parse(row.specifications), requiresApproval: Boolean(row.requiresApproval) }
}

export function listResources(db, { q, department, category, status }) {
  const filters = []
  const values = []
  if (q) {
    filters.push("instr(lower(name || ' ' || department || ' ' || lab || ' ' || category || ' ' || summary || ' ' || description || ' ' || specifications), lower(?)) > 0")
    values.push(q)
  }
  for (const [column, value] of Object.entries({ department, category, status })) {
    if (value) {
      filters.push(`${column} = ? COLLATE NOCASE`)
      values.push(value)
    }
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  return db.prepare(`SELECT ${resourceColumns} FROM resources ${where} ORDER BY sort_order, id`).all(...values).map(serializeResource)
}

export function getResource(db, id) {
  const resource = db.prepare(`SELECT ${resourceColumns} FROM resources WHERE id = ?`).get(id)
  if (!resource) return null
  const availability = db.prepare(`
    SELECT starts_at AS startsAt, ends_at AS endsAt, kind
    FROM availability WHERE resource_id = ? AND ends_at > ?
    ORDER BY starts_at, id
  `).all(id, new Date().toISOString())
  return { ...serializeResource(resource), availability }
}
