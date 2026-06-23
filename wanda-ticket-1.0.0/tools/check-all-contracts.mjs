import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const packageConfig = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
const scripts = packageConfig.scripts || {}
const selfContractScript = 'check:all-contracts'
const skippedChecks = new Set(
  String(process.env.CHECK_ALL_SKIP || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
)

const checkEntries = Object.entries(scripts).filter(([name]) => {
  return name.startsWith('check:') && name !== 'check:all' && !skippedChecks.has(name)
})
const failedChecks = []

for (const [name, command] of checkEntries) {
  console.log(`\n[${name}] ${command}`)

  const result = spawnSync(command, {
    cwd: projectRoot,
    shell: true,
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    failedChecks.push({ name, status: result.status ?? 'unknown' })
  }
}

if (failedChecks.length > 0) {
  console.error('\n总检查失败：')
  for (const failure of failedChecks) {
    console.error(`- ${failure.name} 退出码：${failure.status}`)
  }
  process.exit(1)
}

console.log(`\n总检查通过，共执行 ${checkEntries.length} 个契约脚本`)
