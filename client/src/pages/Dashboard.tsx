import { Boxes, CalendarDays, ChevronRight, CircleCheckBig, Clock3, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Booking, DemoAccount, Resource } from '../../../shared/types'
import { useApi } from '../api'
import { BookingRows, Empty, EquipmentCard, ErrorState, Loading } from '../components'

export function Dashboard({ account }: { account: DemoAccount }) {
  const resources = useApi<Resource[]>('/resources')
  const faculty = account.role === 'faculty'
  const bookings = useApi<Booking[]>(faculty ? '/approvals' : '/bookings', account.id)
  const upcoming = bookings.data?.filter(item => item.status === 'approved' && Date.parse(item.endsAt) > Date.now())
  const pending = bookings.data?.filter(item => item.status === 'pending')
  const name = faculty ? account.name : account.name.split(' ')[0]
  const metrics = [
    { label: 'Equipment in catalog', value: resources.data?.length, icon: Boxes, tone: 'violet', path: '/equipment' },
    { label: faculty ? 'Departments in catalog' : 'Upcoming bookings', value: faculty ? resources.data && new Set(resources.data.map(item => item.department)).size : upcoming?.length, icon: CalendarDays, tone: 'blue', path: faculty ? '/equipment' : '/bookings' },
    { label: 'Pending approvals', value: pending?.length, icon: faculty ? CircleCheckBig : Clock3, tone: 'amber', path: faculty ? '/approvals' : '/bookings' },
  ]

  return <>
    <section className="hero" aria-labelledby="dashboard-heading">
      <div className="hero-content">
        <span className="hero-kicker"><span />{faculty ? 'FACULTY DEMO' : 'STUDENT DEMO'}</span>
        <h1 id="dashboard-heading">Welcome, {name}.</h1>
        <p>{faculty ? 'Review equipment requests from your department and explore the shared campus lab catalog.' :
          'Discover lab equipment, keep track of bookings, and find the tools for your next project.'}</p>
        <div className="hero-actions">
          <Link className="button button-white" to="/equipment"><Boxes size={17} aria-hidden="true" />Explore Equipment</Link>
          <Link className="button button-translucent" to={faculty ? '/approvals' : '/assistant'}>
            {faculty ? <CircleCheckBig size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {faculty ? 'Faculty Approvals' : 'Project Assistant'}
          </Link>
        </div>
      </div>
    </section>
    <div className="metrics">
      {metrics.map(({ label, value, icon: Icon, tone, path }) => <Link className="metric" key={label} to={path}>
        <span className={'metric-icon tone-' + tone}><Icon size={20} aria-hidden="true" /></span>
        <div><strong>{value ?? '—'}</strong><span>{label}</span></div><ChevronRight className="metric-chevron" size={17} aria-hidden="true" />
      </Link>)}
    </div>
    <section className="dashboard-section" aria-labelledby="featured-title">
      <div className="section-heading"><div><h2 id="featured-title">Featured equipment</h2><p>Explore resources across campus labs.</p></div>
        <Link className="text-link" to="/equipment">View all equipment<ChevronRight size={17} aria-hidden="true" /></Link>
      </div>
      {resources.error ? <ErrorState message={resources.error} retry={resources.retry} /> : !resources.data ? <Loading message="Loading equipment…" /> :
        resources.data.length ? <div className="equipment-grid">{resources.data.slice(0, 3).map(resource => <EquipmentCard key={resource.id} resource={resource} />)}</div> :
        <Empty title="No equipment listed" icon="lab">The catalog is currently empty.</Empty>}
    </section>
    <section className="dashboard-section" aria-labelledby="upcoming-title">
      <div className="section-heading"><div><h2 id="upcoming-title">{faculty ? 'Pending requests' : 'Upcoming bookings'}</h2>
        <p>{faculty ? 'Requests awaiting review in your department.' : 'Your confirmed sessions at a glance.'}</p></div>
        <Link className="text-link" to={faculty ? '/approvals' : '/bookings'}>{faculty ? 'Review requests' : 'View my bookings'}<ChevronRight size={17} aria-hidden="true" /></Link>
      </div>
      {bookings.error ? <ErrorState message={bookings.error} retry={bookings.retry} /> : !bookings.data ? <Loading message="Loading bookings…" /> :
        (faculty ? pending : upcoming)?.length ? <BookingRows bookings={(faculty ? pending : upcoming)!.slice(0, 3)} /> :
        <Empty title={faculty ? 'No pending requests' : 'No upcoming bookings'} icon="calendar">
          {faculty ? 'New requests will appear here.' : 'Confirmed bookings will appear here.'}
        </Empty>}
    </section>
  </>
}
