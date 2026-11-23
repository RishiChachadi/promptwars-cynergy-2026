import { useEffect, useState } from 'react'
import { Boxes, CalendarDays, ChevronDown, ChevronRight, CircleCheckBig, FlaskConical, LayoutDashboard, Menu, Sparkles, X } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { DemoAccount } from '../../shared/types'
import { useApi } from './api'
import { Empty, ErrorState, LabMark, Loading } from './components'
import { Dashboard } from './pages/Dashboard'
import { Explore } from './pages/Explore'
import { EquipmentDetails } from './pages/EquipmentDetails'
import { Bookings, FacultyApprovals } from './pages/Bookings'
import { ProjectAssistant } from './pages/ProjectAssistant'

const navigation = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/equipment', label: 'Explore Equipment', icon: Boxes },
  { path: '/bookings', label: 'My Bookings', icon: CalendarDays },
  { path: '/assistant', label: 'Project Assistant', icon: Sparkles },
  { path: '/approvals', label: 'Faculty Approvals', icon: CircleCheckBig },
]

export function App() {
  const accounts = useApi<DemoAccount[]>('/demo-accounts')
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('lablink-demo-account'))
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const account = accounts.data?.find(item => item.id === selectedId) ?? accounts.data?.[0]
  const nav = navigation.filter(item => item.path !== '/approvals' || account?.role === 'faculty')
  const detail = pathname.startsWith('/equipment/')
  const currentPage = detail ? 'Equipment Details' : navigation.find(item => item.path === pathname)?.label ?? 'Page not found'

  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = currentPage + ' | LabLink'
  }, [pathname, currentPage])

  function switchAccount(id: string) {
    const next = accounts.data?.find(item => item.id === id)
    setSelectedId(id)
    localStorage.setItem('lablink-demo-account', id)
    setMenuOpen(false)
    if (next?.role === 'faculty') navigate('/approvals')
    else if (pathname === '/approvals') navigate('/')
  }

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside id="workspace-navigation" className={'sidebar' + (menuOpen ? ' sidebar-open' : '')}>
      <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
        <LabMark /><span><strong>LabLink<span>.</span></strong><small>CAMPUS LAB WORKSPACE</small></span>
      </Link>
      <nav aria-label="Workspace" className="navigation">
        <div className="nav-label">WORKSPACE</div>
        {nav.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenuOpen(false)}>
          <Icon size={19} aria-hidden="true" />{label}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="demo-note"><FlaskConical size={17} aria-hidden="true" /><div><strong>Demo workspace</strong><span>Fictional campus data</span></div></div>
        {account && <div className="account">
          <span className="avatar" aria-hidden="true">{account.role === 'student' ? 'AR' : 'MI'}</span>
          <div className="account-name"><strong>{account.name}</strong><small>{account.role === 'student' ? 'Student demo account' : 'Faculty demo account'}</small></div>
          <ChevronDown size={16} aria-hidden="true" />
          <select aria-label="Switch demo account" value={account.id} onChange={event => switchAccount(event.target.value)}>
            {accounts.data?.map(item => <option key={item.id} value={item.id}>{item.role === 'student' ? 'Student' : 'Faculty'} demo · {item.name}</option>)}
          </select>
        </div>}
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="menu-toggle" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}
          aria-controls="workspace-navigation" onClick={() => setMenuOpen(value => !value)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={15} aria-hidden="true" /><strong>{currentPage}</strong></div>
        <span className="top-demo"><FlaskConical size={14} aria-hidden="true" /> Demo mode</span>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        {accounts.error ? <ErrorState message={accounts.error} retry={accounts.retry} /> : !accounts.data ? <Loading message="Loading demo workspace…" /> : !account ?
          <Empty title="No demo accounts" icon="lab">The workspace needs a demo account to continue.</Empty> :
          <Routes>
            <Route path="/" element={<Dashboard account={account} />} />
            <Route path="/equipment" element={<Explore />} />
            <Route path="/equipment/:id" element={<EquipmentDetails />} />
            <Route path="/bookings" element={<Bookings account={account} />} />
            <Route path="/assistant" element={<ProjectAssistant account={account} />} />
            <Route path="/approvals" element={<FacultyApprovals key={account.id} account={account} />} />
            <Route path="*" element={<Empty title="Page not found"><Link className="text-link" to="/">Back to Dashboard</Link></Empty>} />
          </Routes>}
      </main>
      <footer className="app-footer"><span>LabLink · PromptWars × Cynergy 2026</span><span>All times in IST</span></footer>
    </div>
  </div>
}
