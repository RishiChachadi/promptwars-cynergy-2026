import { Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import type { Resource } from '../../../shared/types'
import { useApi } from '../api'
import { Empty, EquipmentCard, ErrorState, Loading, PageHeading } from '../components'

type Filter = 'q' | 'department' | 'category' | 'status'

export function Explore() {
  const [params, setParams] = useSearchParams()
  const catalog = useApi<Resource[]>('/resources')
  const query = new URLSearchParams()
  for (const name of ['q', 'department', 'category', 'status']) {
    const value = params.get(name)?.trim()
    if (value) query.set(name, value)
  }
  const filtered = useApi<Resource[]>(query.size ? '/resources?' + query : undefined)
  const results = query.size ? filtered : catalog
  const departments = [...new Set(catalog.data?.map(item => item.department))].sort()
  const categories = [...new Set(catalog.data?.map(item => item.category))].sort()

  function change(name: Filter, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(name, value)
    else next.delete(name)
    setParams(next, { replace: name === 'q' })
  }

  return <>
    <PageHeading title="Explore Equipment" description="Search and filter the shared ECE, CSE, and Mechanical lab inventory." />
    <form className="filter-bar" role="search" aria-label="Equipment catalog" onSubmit={event => event.preventDefault()}>
      <label className="field filter-search"><span>Search equipment</span>
        <span className="search-input"><Search size={18} aria-hidden="true" />
          <input type="search" maxLength={160} placeholder="Search by name, lab, or specification" value={params.get('q') ?? ''} onChange={event => change('q', event.target.value)} />
        </span>
      </label>
      <label className="field"><span>Department</span><select value={params.get('department') ?? ''} onChange={event => change('department', event.target.value)}>
        <option value="">All departments</option>
        {departments.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label className="field"><span>Category</span><select value={params.get('category') ?? ''} onChange={event => change('category', event.target.value)}>
        <option value="">All categories</option>
        {categories.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label className="field"><span>Status</span><select value={params.get('status') ?? ''} onChange={event => change('status', event.target.value)}>
        <option value="">All statuses</option><option value="available">Available</option><option value="maintenance">Maintenance</option>
      </select></label>
    </form>
    <div className="results-heading">
      <div role="status">{results.data ? results.data.length + (results.data.length === 1 ? ' resource' : ' resources') : 'Equipment results'}</div>
      {query.size > 0 && <button className="text-link" type="button" onClick={() => setParams({})}>Clear filters</button>}
    </div>
    {results.error ? <ErrorState message={results.error} retry={results.retry} /> : !results.data ? <Loading message="Loading equipment…" /> :
      results.data.length ? <div className="equipment-grid">{results.data.map(resource => <EquipmentCard key={resource.id} resource={resource} />)}</div> :
      <Empty title={query.size ? 'No matching equipment' : 'The catalog is empty'}>{query.size ? 'Try another search or clear your filters.' : 'Equipment will appear here when it is added.'}</Empty>}
  </>
}
