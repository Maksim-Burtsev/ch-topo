import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const projectName = process.env.CHTOPO_INTEGRATION_PROJECT ?? 'chtopo-integration'
const composeArgs = ['compose', '-p', projectName, '-f', 'docker-compose.integration.yml']
const httpPort = process.env.CHTOPO_CLICKHOUSE_HTTP_PORT ?? '8124'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, CHTOPO_CLICKHOUSE_HTTP_PORT: httpPort },
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

async function waitForClickHouse() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/`, {
        method: 'POST',
        body: 'SELECT 1',
      })
      if (response.ok && (await response.text()).trim() === '1') return
    } catch {
      // retry until the container health endpoint is reachable
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`ClickHouse did not become ready on port ${httpPort}`)
}

async function seedClickHouse() {
  const seedSql = await readFile('docker/clickhouse/init/integration-seed.sql', 'utf8')
  const result = spawnSync(
    'docker',
    [...composeArgs, 'exec', '-T', 'clickhouse', 'clickhouse-client', '--multiquery'],
    {
      input: seedSql,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, CHTOPO_CLICKHOUSE_HTTP_PORT: httpPort },
    },
  )
  if (result.status !== 0) {
    throw new Error(`ClickHouse seed failed with exit code ${result.status}`)
  }
}

try {
  run('docker', [...composeArgs, 'down', '-v', '--remove-orphans'])
  run('docker', [...composeArgs, 'up', '-d'])
  await waitForClickHouse()
  await seedClickHouse()
  run('npm', ['run', 'test:integration:run'], {
    env: {
      ...process.env,
      CHTOPO_CLICKHOUSE_HTTP_PORT: httpPort,
      VITE_CHTOPO_CLICKHOUSE_HTTP_PORT: httpPort,
    },
  })
} finally {
  run('docker', [...composeArgs, 'down', '-v', '--remove-orphans'])
}
