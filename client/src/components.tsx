import type { ReactNode } from 'react'
import { Box, CalendarDays, ChevronRight, CircleAlert, Clock3, Cpu, FlaskConical, MapPin, Monitor, Printer, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Booking, BookingSlot, Resource } from '../../shared/types'
import { formatDate, formatDay, formatMonth, formatWindow } from './format'

const labels = {
  available: 'Available',
  maintenance: 'Maintenance',
  approved: 'Approved',
  pending: 'Pending review',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

export function Badge({ status }: { status: keyof typeof labels }) {
  return <span className={'badge badge-' + status}><span className="badge-dot" />{labels[status]}</span>
}

export function PageHeading({ title, description }: { title: string; description: string }) {
  return <div className="page-heading"><h1>{title}</h1><p>{description}</p></div>
}

export function Loading({ message = 'Loading…' }: { message?: string }) {
  return <div className="state" role="status"><span className="spinner" />{message}</div>
}

export function Empty({ title, children, icon = 'search' }: { title: string; children: ReactNode; icon?: 'search' | 'calendar' | 'lab' }) {
  const Icon = { search: Search, calendar: CalendarDays, lab: FlaskConical }[icon]
  return <div className="state"><Icon size={24} aria-hidden="true" /><strong>{title}</strong><div>{children}</div></div>
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="state"><div className="state-error" role="alert"><CircleAlert size={19} aria-hidden="true" />{message}</div>
    {retry && <button className="button button-secondary" onClick={retry}>Try again</button>}
  </div>
}

export function ResourceImage({ resource, eager = false }: { resource: Resource; eager?: boolean }) {
  const Icon = resource.department === 'ECE' ? Cpu : resource.department === 'CSE' ? Monitor : Printer
  return <div className={'resource-image resource-' + resource.department.toLowerCase()}>
    {resource.image ? <img src={resource.image} alt="" loading={eager ? 'eager' : 'lazy'} /> : <Icon size={54} strokeWidth={1.2} aria-hidden="true" />}
  </div>
}

export function EquipmentCard({ resource }: { resource: Resource }) {
  return <article className="equipment-card">
    <div className="equipment-visual"><ResourceImage resource={resource} /><Badge status={resource.status} /></div>
    <div className="equipment-body">
      <span className="department">{resource.department}</span>
      <h3><Link to={'/equipment/' + resource.id}>{resource.name}</Link></h3>
      <p>{resource.summary}</p>
      <div className="equipment-footer"><span><MapPin size={15} aria-hidden="true" />{resource.lab}</span><ChevronRight size={17} aria-hidden="true" /></div>
    </div>
  </article>
}

export function rescheduleLink(resourceId: string, projectId: string, bookingId: string, slot: BookingSlot) {
  const params = new URLSearchParams({ project: projectId, replace: bookingId, start: slot.startsAt, end: slot.endsAt })
  return '/equipment/' + encodeURIComponent(resourceId) + '?' + params
}

export function BookingRows({ bookings, showScheduling = false }: { bookings: Booking[]; showScheduling?: boolean }) {
  return <ul className="booking-list">
    {bookings.map(booking => <li key={booking.id} className="booking-row">
      <div className="date-box" aria-hidden="true"><span>{formatMonth(booking.startsAt)}</span><strong>{formatDay(booking.startsAt)}</strong></div>
      <div className="booking-info">
        <Link to={'/equipment/' + booking.resourceId}>{booking.resourceName}</Link>
        <span>{booking.projectTitle} <span aria-hidden="true">·</span> {booking.lab}</span>
      </div>
      <span className="booking-time"><Clock3 size={15} aria-hidden="true" /><time dateTime={booking.startsAt} aria-label={new Date(booking.startsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' }) + ', ' + formatWindow(booking.startsAt, booking.endsAt)}>{formatWindow(booking.startsAt, booking.endsAt)}</time></span>
      <Badge status={booking.status} />
      {showScheduling && booking.scheduling && <div className="booking-guidance">
        <p>{booking.scheduling.reason}</p>
        {booking.scheduling.alternatives.length > 0 && <ul aria-label="Alternative times">
          {booking.scheduling.alternatives.map(slot => <li key={slot.startsAt}>
            <Link className="text-link" to={rescheduleLink(booking.resourceId, booking.projectId, booking.id, slot)}>
              Reschedule to {formatDate(slot.startsAt)} · {formatWindow(slot.startsAt, slot.endsAt)}
            </Link>
          </li>)}
        </ul>}
      </div>}
    </li>)}
  </ul>
}

export function LabMark() {
  return <span className="lab-mark"><Box size={23} strokeWidth={2} aria-hidden="true" /></span>
}
