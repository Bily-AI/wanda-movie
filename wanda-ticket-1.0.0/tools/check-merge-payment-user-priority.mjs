import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const wandaRequest = readFileSync(resolve(root, 'src/renderer/services/wandaRequest.ts'), 'utf8')
const startLabel = 'export function buildMergePaymentHeaders'
const endLabel = 'function buildWandaSignInHeaders'
const start = wandaRequest.indexOf(startLabel)
const end = wandaRequest.indexOf(endLabel, start + startLabel.length)

if (start < 0 || end < 0) {
  throw new Error('cannot locate buildMergePaymentHeaders block')
}

const mergePaymentBlock = wandaRequest.slice(start, end)
const expectedLine = "const ryUser = userIdentifier.trim() || getDefaultWandaUserId()"

if (!mergePaymentBlock.includes(expectedLine)) {
  throw new Error(`merge_payment headers must prioritize current account userIdentifier: ${expectedLine}`)
}

console.log('merge_payment user priority contract passed')
