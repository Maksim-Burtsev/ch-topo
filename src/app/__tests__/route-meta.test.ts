import { describe, expect, it } from 'vitest'
import { getDocumentTitle, getRouteTitle } from '../route-meta'

describe('route metadata', () => {
  it.each([
    ['/', 'Schema Graph', 'chtopo — Schema Graph'],
    ['/connect', 'Connect', 'chtopo — Connect'],
    ['/tables', 'Tables', 'chtopo — Tables'],
    ['/tables/analytics/events', 'Table Detail', 'chtopo — Table Detail'],
    ['/impact', 'Impact Analysis', 'chtopo — Impact Analysis'],
    ['/playground', 'Playground', 'Playground — chtopo'],
    ['/history', 'DDL History', 'chtopo — DDL History'],
    ['/snapshots', 'Not Found', 'chtopo — Not Found'],
    ['/missing', 'Not Found', 'chtopo — Not Found'],
  ])('resolves metadata for %s', (pathname, routeTitle, documentTitle) => {
    expect(getRouteTitle(pathname)).toBe(routeTitle)
    expect(getDocumentTitle(pathname)).toBe(documentTitle)
  })
})
