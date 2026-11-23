import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Project, Resource } from '../../../shared/types'
import { request, useApi } from '../api'
import { Loading } from '../components'
import { toCampusInput } from '../format'

export function ProjectCreationForm({ accountId, onCreated }: { accountId: string; onCreated: () => void }) {
  const catalog = useApi<Resource[]>('/resources')
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(false)
  const [error, setError] = useState('')
  const firstFutureMinute = toCampusInput(new Date(Date.now() + 60_000).toISOString()).slice(0, 16)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setSaving(true)
    setError('')
    setCreated(false)
    try {
      await request<Project>('/projects', accountId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: fields.get('title'),
          description: fields.get('description'),
          deadlineAt: String(fields.get('deadline') ?? '') + '+05:30',
          equipmentIds: fields.getAll('equipment'),
        }),
      })
      form.reset()
      setCreated(true)
      onCreated()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not create the project.')
    } finally {
      setSaving(false)
    }
  }

  return <details className="mt-3">
    <summary className="cursor-pointer text-sm font-semibold text-accent">Create a project</summary>
    <form className="mt-3" onSubmit={save} aria-busy={saving}>
      <fieldset className="booking-form" disabled={saving}>
        <label className="field">Project title
          <input name="title" required maxLength={120} />
        </label>
        <label className="field">Project description
          <textarea name="description" required maxLength={1200} rows={3} />
        </label>
        <label className="field">Deadline (IST)
          <input name="deadline" type="datetime-local" required min={firstFutureMinute} />
        </label>
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-2 font-semibold">Required equipment (optional)</legend>
          {catalog.error ? <div>
            <p className="state-error" role="alert">{catalog.error}</p>
            <button type="button" className="text-link" onClick={catalog.retry}>Retry loading equipment</button>
          </div> :
            !catalog.data ? <Loading message="Loading the equipment catalog…" /> :
            catalog.data.length ? catalog.data.map(item => <label key={item.id} className="flex items-start gap-2">
              <input className="mt-1" type="checkbox" name="equipment" value={item.id} />
              <span>{item.name} · {item.department}</span>
            </label>) : <span>No equipment in the catalog.</span>}
        </fieldset>
        <button className="button button-primary">{saving ? 'Creating…' : 'Create project'}</button>
      </fieldset>
    </form>
    {error && <p className="state-error" role="alert">{error}</p>}
    {created && <>
      <p role="status">Project created. It’s ready to use in the booking form.</p>
      <Link className="text-link" to="/equipment">Find equipment to book</Link>
    </>}
  </details>
}
