import { createHashRouter } from 'react-router'
import { ConnectPage } from '@/pages/connect-page'
import { GraphPage } from '@/pages/graph-page'
import { HistoryPage } from '@/pages/history-page'
import { ImpactPage } from '@/pages/impact-page'
import { MigrationsPage } from '@/pages/migrations-page'
import { PlaygroundPage } from '@/pages/playground-page'
import { TableDetailPage } from '@/pages/tables/table-detail-page'
import { TablesPage } from '@/pages/tables/tables-page'
import { Layout } from './layout'

export const router = createHashRouter([
  {
    path: '/connect',
    element: <ConnectPage />,
  },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <GraphPage /> },
      { path: '/tables', element: <TablesPage /> },
      { path: '/tables/:database/:name', element: <TableDetailPage /> },
      { path: '/impact', element: <ImpactPage /> },
      { path: '/playground', element: <PlaygroundPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/migrations', element: <MigrationsPage /> },
    ],
  },
])
