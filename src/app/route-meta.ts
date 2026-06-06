const routeTitles = [
  { match: (pathname: string) => pathname === '/', title: 'Schema Graph' },
  { match: (pathname: string) => pathname === '/connect', title: 'Connect' },
  { match: (pathname: string) => pathname === '/tables', title: 'Tables' },
  { match: (pathname: string) => pathname.startsWith('/tables/'), title: 'Table Detail' },
  { match: (pathname: string) => pathname === '/snapshots', title: 'Schema Snapshots' },
  { match: (pathname: string) => pathname === '/impact', title: 'Impact Analysis' },
  { match: (pathname: string) => pathname === '/playground', title: 'Playground' },
  { match: (pathname: string) => pathname === '/history', title: 'DDL History' },
]

export function getRouteTitle(pathname: string): string {
  return routeTitles.find((route) => route.match(pathname))?.title ?? 'Not Found'
}

export function getDocumentTitle(pathname: string): string {
  const title = getRouteTitle(pathname)

  if (title === 'Playground') return 'Playground — chtopo'
  if (title === 'Not Found') return 'chtopo — Not Found'
  return `chtopo — ${title}`
}
