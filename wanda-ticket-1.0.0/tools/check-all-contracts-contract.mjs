import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const packagePath = path.join(projectRoot, 'package.json')
const runnerPath = path.join(projectRoot, 'tools', 'check-all-contracts.mjs')
const packageConfig = JSON.parse(readFileSync(packagePath, 'utf8'))
const scripts = packageConfig.scripts || {}
const failures = []

if (scripts['check:all'] !== 'node tools/check-all-contracts.mjs') {
  failures.push('package.json 缺少 check:all 总检查脚本')
}

if (scripts['check:all-contracts'] !== 'node tools/check-all-contracts-contract.mjs') {
  failures.push('package.json 缺少 check:all-contracts 契约脚本')
}

if (!existsSync(runnerPath)) {
  failures.push('缺少总检查执行器：tools/check-all-contracts.mjs')
} else {
  const runner = readFileSync(runnerPath, 'utf8')

  for (const marker of [
    'check:all',
    'check:all-contracts',
    'spawnSync',
    'CHECK_ALL_SKIP',
    'failedChecks',
    '总检查失败',
    '总检查通过'
  ]) {
    if (!runner.includes(marker)) {
      failures.push(`tools/check-all-contracts.mjs 缺少标记：${marker}`)
    }
  }
}

const checkScripts = Object.keys(scripts).filter((name) => name.startsWith('check:') && name !== 'check:all')

if (!checkScripts.includes('check:interface-smoke')) {
  failures.push('check:all 覆盖范围必须包含万达接口冒烟契约')
}

if (!checkScripts.includes('check:all-contracts')) {
  failures.push('check:all 覆盖范围必须包含自身契约')
}

if (failures.length > 0) {
  console.error('总检查契约失败：')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`总检查契约通过，共覆盖 ${checkScripts.length} 个契约脚本`)
