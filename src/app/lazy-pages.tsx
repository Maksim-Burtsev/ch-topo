import { lazy } from 'react'

export const ConnectPage = lazy(() =>
  import('@/pages/connect-page').then((mod) => ({ default: mod.ConnectPage })),
)
export const GraphPage = lazy(() =>
  import('@/pages/graph-page').then((mod) => ({ default: mod.GraphPage })),
)
export const TablesPage = lazy(() =>
  import('@/pages/tables/tables-page').then((mod) => ({ default: mod.TablesPage })),
)
export const TableDetailPage = lazy(() =>
  import('@/pages/tables/table-detail-page').then((mod) => ({ default: mod.TableDetailPage })),
)
export const ImpactPage = lazy(() =>
  import('@/pages/impact-page').then((mod) => ({ default: mod.ImpactPage })),
)
export const PlaygroundPage = lazy(() =>
  import('@/pages/playground-page').then((mod) => ({ default: mod.PlaygroundPage })),
)
export const HistoryPage = lazy(() =>
  import('@/pages/history-page').then((mod) => ({ default: mod.HistoryPage })),
)
export const NotFoundPage = lazy(() =>
  import('@/pages/not-found-page').then((mod) => ({ default: mod.NotFoundPage })),
)
