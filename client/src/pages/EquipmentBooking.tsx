import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { BookingFeedback, BookingResult, BookingSlot, DemoAccount, Project, Resource } from '../../../shared/types'
import { ApiError, request, useApi } from '../api'
import { ErrorState, Loading, rescheduleLink } from '../components'
import { formatDate, formatTime, formatWindow, toCampusInput } from '../format'

export function EquipmentBooking({ account, resource }: { account: DemoAccount; resource: Resource }) {
  const [parameters] = useSearchParams()
  const replaceRequestId = parameters.get('replace')
  const projects = useApi<Project[]>('/projects', account.id)
  const [projectId, setProjectId] = useState(parameters.get('project') ?? '')
  const [startsAt, setStartsAt] = useState(toCampusInput(parameters.get('start') ?? ''))
  const [endsAt, setEndsAt] = useState(toCampusInput(parameters.get('end') ?? ''))
  const [purpose, setPurpose] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<BookingFeedback & { bookingId?: string }>()
  const startInput = useRef<HTMLInputElement>(null)
  const bookingsLink = useRef<HTMLAnchorElement>(null)
  const project = projects.data?.find(item => item.id === projectId)
  const bookingId = feedback?.bookingId

  useEffect(() => {
    if (bookingId) bookingsLink.current?.focus()
  }, [bookingId])

  function chooseSlot(slot: BookingSlot) {
    setStartsAt(toCampusInput(slot.startsAt))
    setEndsAt(toCampusInput(slot.endsAt))
    setFeedback(undefined)
    startInput.current?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback(undefined)
    try {
      const result = await request<BookingResult>('/bookings', account.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resourceId: resource.id, projectId, purpose, startsAt: startsAt + '+05:30', endsAt: endsAt + '+05:30',
          replaceRequestId: replaceRequestId ?? undefined,
        }),
      })
      setFeedback({
        bookingId: result.id,
        reason: result.status === 'pending' ? 'Request submitted. ' + result.reason : result.reason,
        alternatives: result.alternatives,
      })
    } catch (error) {
      setFeedback({
        reason: error instanceof Error ? error.message : 'Could not submit the request.',
        alternatives: error instanceof ApiError ? error.alternatives : [],
      })
    } finally {
      setSaving(false)
    }
  }

  return <section className="panel panel-body">
    <h2>{replaceRequestId ? 'Reschedule request' : 'Book equipment'}</h2>
    {projects.error ? <ErrorState message={projects.error} retry={projects.retry} /> :
      !projects.data ? <Loading message="Loading your projects…" /> :
      projects.data.length === 0 ? <p>You need a project before you can request equipment.</p> :
      !feedback?.bookingId && <form className="booking-form" onSubmit={submit}>
        <p>Choose 15 minutes to 8 hours within lab hours. All times are in IST.</p>
        <label className="field">Project
          <select required value={projectId} disabled={saving || (!!replaceRequestId && !!project)} onChange={event => setProjectId(event.target.value)}>
            <option value="">Select your project</option>
            {projects.data.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        {project?.deadlineAt && <p>Project deadline {formatDate(project.deadlineAt)}, {formatTime(project.deadlineAt)} IST</p>}
        <label className="field">Start time
          <input ref={startInput} required type="datetime-local" step="any" value={startsAt} disabled={saving} onChange={event => setStartsAt(event.target.value)} />
        </label>
        <label className="field">End time
          <input required type="datetime-local" step="any" value={endsAt} disabled={saving} onChange={event => setEndsAt(event.target.value)} />
        </label>
        <label className="field">Purpose
          <textarea required maxLength={500} rows={2} value={purpose} disabled={saving} onChange={event => setPurpose(event.target.value)} />
        </label>
        <button className="button button-primary" disabled={saving}>
          {saving ? 'Submitting…' : replaceRequestId ? 'Submit new time' : resource.requiresApproval ? 'Request faculty approval' : 'Confirm reservation'}
        </button>
      </form>}
    {feedback && <>
      <p role={feedback.bookingId ? 'status' : 'alert'}>{feedback.reason}</p>
      {feedback.bookingId && <Link ref={bookingsLink} className="text-link" to="/bookings">View My Bookings</Link>}
      {feedback.alternatives.length > 0 && <ul className="window-list" aria-label="Alternative times">
        {feedback.alternatives.map(slot => <li key={slot.startsAt}>
          <div><strong>{formatDate(slot.startsAt)}</strong><span>{formatWindow(slot.startsAt, slot.endsAt)}</span></div>
          {feedback.bookingId
            ? <Link className="button button-secondary" to={rescheduleLink(resource.id, projectId, feedback.bookingId, slot)}>Reschedule</Link>
            : <button type="button" className="button button-secondary" onClick={() => chooseSlot(slot)}>Use this time</button>}
        </li>)}
      </ul>}
    </>}
  </section>
}
