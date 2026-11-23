import { useState } from 'react'
import { CalendarDays, ClipboardCheck, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Booking, BookingStatus, DemoAccount } from '../../../shared/types'
import { request, useApi } from '../api'
import { Badge, BookingRows, Empty, ErrorState, Loading, PageHeading } from '../components'
import { formatDate, formatWindow } from '../format'

type Filter = 'all' | BookingStatus
const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All bookings' },
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Pending' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function Bookings({ account }: { account: DemoAccount }) {
  const bookings = useApi<Booking[]>('/bookings', account.id)
  const [filter, setFilter] = useState<Filter>('all')
  const visible = bookings.data?.filter(booking => filter === 'all' || booking.status === filter)

  return <>
    <PageHeading title="My Bookings" description="Track your confirmed reservations and requests awaiting faculty review." />
    <div className="status-filters" aria-label="Filter bookings" role="group">{filters.map(({ value, label }) =>
      <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>,
    )}</div>
    {bookings.error ? <ErrorState message={bookings.error} retry={bookings.retry} /> : !visible ? <Loading message="Loading bookings…" /> :
      visible.length ? <BookingRows bookings={visible} showScheduling /> :
      <Empty title={filter === 'all' ? 'No bookings yet' : 'No bookings in this status'} icon="calendar">
        {filter === 'all' ? <Link className="text-link" to="/equipment">Explore Equipment</Link> : 'Select another status to see more bookings.'}
      </Empty>}
  </>
}

export function FacultyApprovals({ account }: { account: DemoAccount }) {
  const queue = useApi<Booking[]>('/approvals', account.id)
  const [saving, setSaving] = useState<string>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function decide(booking: Booking, decision: 'approved' | 'declined') {
    setSaving(booking.id)
    setNotice('')
    setError('')
    try {
      await request('/approvals/' + booking.id, account.id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      setNotice(booking.resourceName + ' request ' + decision + '.')
      queue.retry()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save the decision.')
      queue.retry()
    } finally {
      setSaving(undefined)
    }
  }

  return <>
    <PageHeading title="Faculty Approvals" description={account.role === 'faculty'
      ? 'Review pending equipment requests for the ' + account.department + ' department.'
      : 'Switch to the Faculty demo account to review equipment requests.'} />
    <div className="decision-feedback" aria-live="polite">{notice}</div>
    {error && <p className="state-error decision-feedback" role="alert">{error}</p>}
    {queue.error ? <ErrorState message={queue.error} retry={account.role === 'faculty' ? queue.retry : undefined} /> :
      !queue.data ? <Loading message="Loading approval requests…" /> : queue.data.length === 0 ?
        <Empty title="All caught up" icon="calendar">There are no pending requests in your department.</Empty> :
        <ul className="approval-list">{queue.data.map(booking => <li key={booking.id} className="panel panel-body approval-card">
          <div className="approval-title"><span className="metric-icon tone-violet"><ClipboardCheck size={20} aria-hidden="true" /></span>
            <div><h2><Link to={'/equipment/' + booking.resourceId}>{booking.resourceName}</Link></h2><p>{booking.studentName} · {booking.projectTitle}</p></div>
            <Badge status={booking.status} />
          </div>
          <p className="approval-purpose">{booking.purpose}</p>
          <div className="approval-meta">
            <span><CalendarDays size={16} aria-hidden="true" />{formatDate(booking.startsAt)} · {formatWindow(booking.startsAt, booking.endsAt)}</span>
            <span><MapPin size={16} aria-hidden="true" />{booking.lab}</span>
          </div>
          {booking.scheduling && <p>{booking.scheduling.reason}</p>}
          <div className="approval-actions">
            <button className="button button-secondary" type="button" disabled={!!saving} onClick={() => decide(booking, 'declined')}>Decline</button>
            <button className="button button-primary" type="button" disabled={!!saving || booking.scheduling?.canApprove === false} onClick={() => decide(booking, 'approved')}>{saving === booking.id ? 'Saving…' : 'Approve'}</button>
          </div>
        </li>)}</ul>}
  </>
}
