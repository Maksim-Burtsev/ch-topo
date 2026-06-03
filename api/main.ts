import { createApiServer } from './app.js'

function readPort(): number {
  const raw = process.env.PORT
  if (!raw) return 4174

  const port = Number(raw)
  return Number.isInteger(port) && port > 0 ? port : 4174
}

const host = process.env.HOST ?? '127.0.0.1'
const port = readPort()
const server = createApiServer()

server.listen(port, host, () => {
  process.stdout.write(`chtopo-api listening on http://${host}:${port}\n`)
})

function shutdown(signal: NodeJS.Signals) {
  process.stdout.write(`chtopo-api received ${signal}, shutting down\n`)
  server.close((err) => {
    if (err) {
      process.stderr.write(`${err.message}\n`)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
