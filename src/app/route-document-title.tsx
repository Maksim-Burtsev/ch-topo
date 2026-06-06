import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { getDocumentTitle } from './route-meta'

export function RouteDocumentTitle() {
  const location = useLocation()

  useEffect(() => {
    document.title = getDocumentTitle(location.pathname)
  }, [location.pathname])

  return null
}
