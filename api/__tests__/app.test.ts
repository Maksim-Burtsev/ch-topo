import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiServer } from '../app.js'

let server: Server
let baseUrl: string

function listen(serverToStart: Server): Promise<void> {
  return new Promise((resolve) => {
    serverToStart.listen(0, '127.0.0.1', () => {
      const address = serverToStart.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
}

function close(serverToClose: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    serverToClose.close((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

describe('API service', () => {
  beforeEach(async () => {
    server = createApiServer()
    await listen(server)
  })

  afterEach(async () => {
    await close(server)
  })

  it('returns health status', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'chtopo-api',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await fetch(`${baseUrl}/api/missing`)

    await expect(response.json()).resolves.toEqual({
      error: 'Not found',
    })
    expect(response.status).toBe(404)
  })
})
