import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

interface JsonBody {
  [key: string]: string
}

function sendJson(res: ServerResponse, status: number, body: JsonBody) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(`${JSON.stringify(body)}\n`)
}

export function handleApiRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'chtopo-api',
    })
    return
  }

  sendJson(res, 404, {
    error: 'Not found',
  })
}

export function createApiServer(): Server {
  return createServer(handleApiRequest)
}
