import { readFileSync } from 'node:fs'

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assertIncludes(path, content, marker) {
  if (!content.includes(marker)) {
    throw new Error(`${path} missing marker: ${marker}`)
  }
}

function assertMatches(path, content, pattern) {
  if (!pattern.test(content)) {
    throw new Error(`${path} missing pattern: ${pattern}`)
  }
}

const ipc = read('src/shared/ipc.ts')
const preload = read('src/preload/index.ts')
const env = read('src/renderer/env.d.ts')
const main = read('src/main/index.ts')
const member = read('src/renderer/views/MemberView.vue')
const pkg = read('package.json')

for (const marker of [
  'WANDA_H5_OPEN_WINDOW',
  'WandaH5OpenWindowRequest',
  'WandaH5OpenWindowResult'
]) {
  assertIncludes('src/shared/ipc.ts', ipc, marker)
}

for (const marker of [
  'openWandaH5Window',
  'WandaH5OpenWindowRequest',
  'WandaH5OpenWindowResult'
]) {
  assertIncludes('src/preload/index.ts', preload, marker)
  assertIncludes('src/renderer/env.d.ts', env, marker)
}

for (const marker of [
  'createWandaH5Window',
  'persist:wanda-h5',
  'document.cookie =',
  'mi=${token}; path=/',
  'setWindowOpenHandler',
  'WANDA_H5_OPEN_WINDOW'
]) {
  assertIncludes('src/main/index.ts', main, marker)
}

for (const marker of [
  'H5_COMMON_PAGES',
  'h5DialogVisible',
  'selectedH5Url',
  'h5Url',
  'handleH5CommonPageChange',
  'handleOpenH5Dialog',
  'handleOpenH5Page',
  'openWandaH5Window',
  'H5工具',
  '领取全部会员等级权益',
  'handleGainAllRtimeEquities'
]) {
  assertIncludes('src/renderer/views/MemberView.vue', member, marker)
}

assertMatches(
  'src/renderer/views/MemberView.vue',
  member,
  /handleGainAllRtimeEquities[\s\S]*?for \(const row of claimableRtimeRows\.value\)[\s\S]*?gainMemberEquity[\s\S]*?await loadRtimeData\(\)/
)

assertMatches(
  'src/renderer/views/MemberView.vue',
  member,
  /h5Url = ref<string>\(H5_COMMON_PAGES\[0\]\.url\)[\s\S]*?handleH5CommonPageChange[\s\S]*?h5Url\.value = value/
)

assertMatches(
  'src/renderer/views/MemberView.vue',
  member,
  /handleOpenH5Page[\s\S]*?const account = currentAccount\.value[\s\S]*?const url = h5Url\.value\.trim\(\)[\s\S]*?!account\?\.ck[\s\S]*?openWandaH5Window\(\{[\s\S]*?url,[\s\S]*?token: account\.ck/
)

assertIncludes('package.json', pkg, 'check:member-h5-tool')
