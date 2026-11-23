import { Boxes, FolderOpen, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AssistantStatus, DemoAccount, Project } from '../../../shared/types'
import { useApi } from '../api'
import { Empty, ErrorState, Loading, PageHeading } from '../components'

export function ProjectAssistant({ account }: { account: DemoAccount }) {
  const assistant = useApi<AssistantStatus>('/assistant/status')
  const projects = useApi<Project[]>('/projects', account.id)

  return <>
    <PageHeading title="Project Assistant" description="Find the campus equipment you need for your next project." />
    <div className="assistant-layout">
      <section className="panel panel-body assistant-panel">
        <span className="metric-icon tone-violet"><Sparkles size={22} aria-hidden="true" /></span>
        <h2>Project recommendations</h2>
        {assistant.error ? <ErrorState message={assistant.error} retry={assistant.retry} /> : !assistant.data ? <Loading message="Checking assistant status…" /> :
          <><span className="department">AI unavailable in Phase 1</span><p>{assistant.data.message}</p></>}
        <Link className="button button-primary" to="/equipment"><Boxes size={17} aria-hidden="true" />Browse equipment catalog</Link>
      </section>
      <section className="panel panel-body">
        <h2><FolderOpen size={19} aria-hidden="true" /> Your demo projects</h2>
        {projects.error ? <ErrorState message={projects.error} retry={projects.retry} /> : !projects.data ? <Loading message="Loading projects…" /> :
          projects.data.length ? <ul className="project-list">{projects.data.map(project => <li key={project.id}><strong>{project.title}</strong><p>{project.description}</p></li>)}</ul> :
          <Empty title="No projects for this account" icon="lab">Switch to the Student demo account to see a sample project.</Empty>}
      </section>
    </div>
  </>
}
