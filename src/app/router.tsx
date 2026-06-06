import { Suspense, type ComponentType } from 'react'
import { createHashRouter } from 'react-router'
import { Layout } from './layout'
import {
  ConnectPage,
  GraphPage,
  HistoryPage,
  ImpactPage,
  NotFoundPage,
  PlaygroundPage,
  TableDetailPage,
  TablesPage,
} from './lazy-pages'

function routeElement(Page: ComponentType) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <Page />
    </Suspense>
  )
}

export const router = createHashRouter([
  {
    path: '/connect',
    element: routeElement(ConnectPage),
  },
  {
    element: <Layout />,
    children: [
      { path: '/', element: routeElement(GraphPage) },
      { path: '/tables', element: routeElement(TablesPage) },
      { path: '/tables/:database/:name', element: routeElement(TableDetailPage) },
      { path: '/impact', element: routeElement(ImpactPage) },
      { path: '/playground', element: routeElement(PlaygroundPage) },
      { path: '/history', element: routeElement(HistoryPage) },
      { path: '*', element: routeElement(NotFoundPage) },
    ],
  },
])
