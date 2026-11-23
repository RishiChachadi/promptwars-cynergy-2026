import { useState, type FormEvent } from 'react'
import { Boxes, FolderOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AssistantResult, AssistantStatus, DemoAccount, EquipmentRecommendation, Project } from '../../../shared/types'
import { request, useApi } from '../api'
import { Empty, ErrorState, Loading, PageHeading } from '../components'
import { formatDate, formatWindow } from '../format'

function Recommendation({ item, result }: { item: EquipmentRecommendation; result: AssistantResult }) {
  const next = item.slots[0]
  const query = new URLSearchParams()
  if (result.projectId) query.set('project', result.projectId)
  if (next) {
    query.set('start', next.startsAt)
    query.set('end', next.endsAt)
  }
  const path = '/equipment/' + encodeURIComponent(item.resourceId)
  const bookingUrl = query.size ? path + '?' + query : path
  return <li className="assistant-recommendation">
    <h3>{item.name}</h3>
    <p>{item.department} · {item.lab}</p>
    <p><strong>Why it fits</strong> · Your project mentions “{item.projectEvidence}”. {item.capability}</p>
    <p><strong>Lab guidance</strong> · {item.usage}</p>
    {item.requiresApproval && <p>Faculty approval required.</p>}
    {item.status === 'maintenance' ? <p>Unavailable during maintenance.</p> : next
      ? <p><strong>Next {result.durationMinutes}-minute slot</strong> · {formatDate(next.startsAt)} · {formatWindow(next.startsAt, next.endsAt)}</p>
      : <p>No {result.durationMinutes}-minute slot is currently available.</p>}
    <Link className="button button-secondary" to={bookingUrl}>
      {next ? 'Book this time' : 'View equipment'}<span className="sr-only"> for {item.name}</span>
    </Link>
  </li>
}

export function ProjectAssistant({ account }: { account: DemoAccount }) {
  const student = account.role === 'student'
  const assistant = useApi<AssistantStatus>(student ? '/assistant/status' : undefined)
  const projects = useApi<Project[]>('/projects', account.id)
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<AssistantResult>()
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!description.trim() || saving) return
    setSaving(true)
    setError('')
    setResult(undefined)
    try {
      setResult(await request<AssistantResult>('/assistant/recommendations', account.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, projectId: projectId || undefined }),
      }))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not load recommendations.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeading title="Project Assistant" description="Describe your project to find equipment in the campus catalog." />
    <div className="assistant-layout">
      <section className="panel panel-body assistant-panel">
        <h2><Sparkles size={19} aria-hidden="true" /> Project recommendations</h2>
        {student ? <>
          {assistant.data?.mode === 'unavailable' && <p>{assistant.data.message}</p>}
          <form className="booking-form" onSubmit={submit} aria-busy={saving}>
            <label className="field">Describe your project
              <textarea value={description} onChange={event => setDescription(event.target.value)} required maxLength={1200}
                rows={4} disabled={saving} placeholder="I’m building an air quality monitor and need to test Wi-Fi telemetry and sensor waveforms." />
            </label>
            {!!projects.data?.length && <label className="field">Saved project for booking (optional)
              <select value={projectId} onChange={event => setProjectId(event.target.value)} disabled={saving}>
                <option value="">Choose a saved project</option>
                {projects.data.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
            </label>}
            <button className="button button-primary" disabled={saving || !description.trim()}>Find equipment</button>
          </form>
          {saving && <Loading message="Finding equipment…" />}
          {error && <ErrorState message={error} />}
          {result && <div className="assistant-results">
            <div role="status">
              <span className="department">{result.mode === 'gemini' ? 'Gemini recommendations' : 'Catalog keyword matches · fallback'}</span>
              {result.message && <p>{result.message}</p>}
            </div>
            {result.questions.length > 0 && <div>
              <h3>Details to add</h3>
              <ul className="assistant-questions">{result.questions.map(question => <li key={question}>{question}</li>)}</ul>
            </div>}
            {result.recommendations.length > 0 && <ul className="grid gap-3" aria-label="Recommended equipment">
              {result.recommendations.map(item => <Recommendation key={item.resourceId} item={item} result={result} />)}
            </ul>}
          </div>}
        </> : <p>Switch to a Student demo account to get project recommendations.</p>}
        <Link className="button button-secondary mt-4" to="/equipment"><Boxes size={17} aria-hidden="true" />Browse equipment catalog</Link>
      </section>
      <section className="panel panel-body">
        <h2><FolderOpen size={19} aria-hidden="true" /> Your demo projects</h2>
        {projects.error ? <ErrorState message={projects.error} retry={projects.retry} /> : !projects.data ? <Loading message="Loading projects…" /> :
          projects.data.length ? <ul className="project-list">{projects.data.map(project => <li key={project.id}>
            <strong>{project.title}</strong><p>{project.description}</p>
            {student && <button type="button" className="button button-secondary mt-2" disabled={saving} onClick={() => {
              setDescription(project.description.slice(0, 1200))
              setProjectId(project.id)
            }}>Use this project</button>}
          </li>)}</ul> :
          <Empty title="No projects for this account" icon="lab">Switch to the Student demo account to see a sample project.</Empty>}
      </section>
    </div>
  </>
}
