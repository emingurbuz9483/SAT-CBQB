import { useSyncExternalStore } from 'react'

/** Minimal hash router: #/path?key=value */
export interface Route {
  path: string
  params: URLSearchParams
}

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = h.split('?')
  return { path, params: new URLSearchParams(query) }
}

let current = parse()
let currentHash = location.hash

function subscribe(cb: () => void) {
  const on = () => {
    current = parse()
    currentHash = location.hash
    cb()
  }
  window.addEventListener('hashchange', on)
  return () => window.removeEventListener('hashchange', on)
}

export function useRoute(): Route {
  useSyncExternalStore(subscribe, () => currentHash)
  return current
}

export function navigate(path: string, params?: Record<string, string>) {
  const q = params ? new URLSearchParams(params).toString() : ''
  location.hash = q ? `${path}?${q}` : path
  window.scrollTo(0, 0)
}
