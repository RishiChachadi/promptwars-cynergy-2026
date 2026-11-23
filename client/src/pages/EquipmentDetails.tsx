import { CalendarDays, ChevronLeft, CircleCheckBig, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import type { ResourceDetail } from '../../../shared/types'
import { useApi } from '../api'
import { Badge, Empty, ErrorState, Loading, PageHeading, ResourceImage } from '../components'
import { formatDate, formatWindow } from '../format'

export function EquipmentDetails() {
  const { id } = useParams()
  const resource = useApi<ResourceDetail>('/resources/' + encodeURIComponent(id ?? ''))
  const data = resource.data

  return <>
    <Link className="text-link back-link" to="/equipment"><ChevronLeft size={18} aria-hidden="true" />Explore Equipment</Link>
    {resource.error ? <ErrorState message={resource.error} retry={resource.retry} /> : !data ? <Loading message="Loading equipment details…" /> : <>
      <PageHeading title={data.name} description={data.lab + ' · ' + data.department} />
      <div className="detail-grid">
        <article className="panel detail-overview">
          <ResourceImage resource={data} eager />
          <div className="panel-body">
            <div className="details-labels"><span className="department">{data.category}</span><Badge status={data.status} /></div>
            <h2>Overview</h2><p>{data.description}</p>
            <h2>Specifications</h2><ul className="specifications">{data.specifications.map(item => <li key={item}>{item}</li>)}</ul>
          </div>
        </article>
        <div className="detail-side">
          <section className="panel panel-body">
            <h2><MapPin size={19} aria-hidden="true" /> Lab location</h2><p>{data.location}</p>
            <h2><CircleCheckBig size={19} aria-hidden="true" /> Access requirements</h2>
            <p>{data.requiresApproval ? 'Faculty approval is required for this equipment.' : 'This equipment is listed for general student access.'}</p>
          </section>
          <section className="panel panel-body">
            <h2><CalendarDays size={19} aria-hidden="true" /> Lab windows</h2>
            <p>These demo windows show lab hours and maintenance. Reservations open in a later phase.</p>
            {data.availability.length ? <ul className="window-list">{data.availability.map(window => <li key={window.startsAt + window.endsAt + window.kind}>
              <div><strong>{formatDate(window.startsAt)}</strong><span>{formatWindow(window.startsAt, window.endsAt)}</span></div>
              <span className="department">{window.kind === 'open' ? 'Lab hours' : 'Maintenance'}</span>
            </li>)}</ul> : <Empty title="No upcoming windows" icon="calendar">Check back for lab hours.</Empty>}
          </section>
        </div>
      </div>
    </>}
  </>
}
