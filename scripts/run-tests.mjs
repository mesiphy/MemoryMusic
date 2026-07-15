import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const vitestPackagePath = require.resolve('vitest/package.json')
const vitestPath = join(dirname(vitestPackagePath), 'vitest.mjs')
const result = spawnSync(electronPath, [vitestPath, 'run', ...process.argv.slice(2)], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
})

if (result.error) throw result.error
process.exit(result.status ?? 1)
