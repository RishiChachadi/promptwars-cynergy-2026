import { useCallback, useEffect, useState } from 'react'

export async function request<T>(path: string, accountId?: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers)
  if (accountId) headers.set('x-lablink-demo-account', accountId)
  const response = await fetch('/api' + path, { ...options, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Unable to reach LabLink. Please try again.')
  }
  return response.json()
}

type QueryState<T> = { key: string; data?: T; error?: string }

export function useApi<T>(path?: string, accountId?: string) {
  const key = JSON.stringify([path, accountId])
  const [state, setState] = useState<QueryState<T>>({ key })
  const [version, setVersion] = useState(0)
  const retry = useCallback(() => setVersion(value => value + 1), [])

  useEffect(() => {
    if (path === undefined) return
    const controller = new AbortController()
    setState({ key })
    request<T>(path, accountId, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ key, data }) })
      .catch(error => {
        if (!controller.signal.aborted) setState({ key, error: error.message })
      })
    return () => controller.abort()
  }, [path, accountId, key, version])

  return { ...(state.key === key ? state : { key }), retry }
}
