import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(projectRoot, '..')
const oldRoot = path.join(repoRoot, 'win-ia32-unpacked')
const appRoot = path.join(oldRoot, 'resources', 'app')
const docsRoot = path.join(repoRoot, 'docs')

const files = {
  packageJson: path.join(appRoot, 'package.json'),
  main: path.join(appRoot, 'out', 'main', 'index.js'),
  preload: path.join(appRoot, 'out', 'preload', 'index.js'),
  rendererAssets: path.join(appRoot, 'out', 'renderer', 'assets'),
  config: path.join(oldRoot, 'config')
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function assertFileExists(file, label) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`旧包索引失败：缺少${label}：${file}`)
  }
}

function assertDirExists(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`旧包索引失败：缺少${label}：${dir}`)
  }
}

function unique(items) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function matchGroup(text, regex, group = 1) {
  return unique([...text.matchAll(regex)].map((item) => item[group]))
}

function decodeJsString(value) {
  return value
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\//g, '/')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

function extractStringLiterals(text) {
  const values = []
  const quotes = new Set(["'", '"', '`'])

  for (let index = 0; index < text.length; index += 1) {
    const quote = text[index]
    if (!quotes.has(quote)) continue

    let raw = ''
    index += 1

    while (index < text.length) {
      const char = text[index]

      if (char === '\\') {
        raw += char
        index += 1
        if (index < text.length) raw += text[index]
        index += 1
        continue
      }

      if (char === quote) break

      raw += char
      index += 1
    }

    if (index < text.length && text[index] === quote) {
      values.push(decodeJsString(raw))
    }
  }

  return unique(values)
}

function readAssetList(root, ext) {
  if (!fs.existsSync(root)) return []

  return fs.readdirSync(root)
    .filter((name) => name.endsWith(ext))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      bytes: fs.statSync(path.join(root, name)).size
    }))
}

function normalizeApiPath(value) {
  const apiEnd = value.indexOf('.api')
  if (apiEnd === -1) return ''

  return value.slice(0, apiEnd + '.api'.length)
}

function extractApiPaths(text) {
  return unique(matchGroup(text, /\/[A-Za-z0-9_./-]+\.api(?:\?[^'"`\s)\\<>{}\]]*)?/g, 0)
    .map(normalizeApiPath))
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url)

    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return url.split(/[?#]/)[0]
  }
}

function extractUrls(text, hostPattern) {
  return unique(matchGroup(text, /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]+/g, 0)
    .filter((url) => hostPattern.test(url))
    .map(sanitizeUrl))
}

function extractPreloadApiNames(preloadText) {
  const apiObject = preloadText.match(/(?:^|,)api=\{([\s\S]*?)\};if\(process/)
  const apiObjectNames = apiObject
    ? matchGroup(apiObject[1], /(?:^|,)'?([A-Za-z_$][A-Za-z0-9_$]*)'?\s*:/g)
    : []
  const commonNames = [
    'minimize',
    'maximize',
    'close',
    'getMachineInfo',
    'readAccounts',
    'writeAccounts',
    'readProxySettings',
    'writeProxySettings',
    'fetchProxy',
    'getUsedProxy',
    'clearProxyCache',
    'readCityData',
    'captureElement',
    'copyElementToClipboard',
    'ocrRecognize',
    'readClipboardImage',
    'readClipboardText',
    'aiParseOcr',
    'readCategories',
    'writeCategories',
    'openAutoOrderWindow',
    'sendAutoOrderTicket',
    'reportAutoOrderResult',
    'onCityDataUpdated'
  ].filter((name) => preloadText.includes(name))
  const ignored = new Set(['selector', 'imageBase64', 'ocrWords'])

  return unique([...apiObjectNames, ...commonNames]).filter((name) => !ignored.has(name))
}

function extractIpcNames(mainText, preloadText, allStrings) {
  const explicitMain = [
    ...matchGroup(mainText, /ipcMain(?:\[['"]handle['"]\]|\.(?:handle|on))\(\s*['"]([^'"]+)['"]/g),
    ...matchGroup(mainText, /electron\[['"]ipcMain['"]\](?:\[['"]handle['"]\]|\.(?:handle|on))\(\s*['"]([^'"]+)['"]/g)
  ]
  const preloadInvokes = matchGroup(
    preloadText,
    /ipcRenderer(?:\[['"]invoke['"]\]|\.(?:invoke|send|on|once|removeListener|removeAllListeners))\(\s*['"]([^'"]+)['"]/g
  )
  const ipcKeywords = [
    'account',
    'accounts',
    'ai-parse',
    'alipay',
    'auto-order',
    'capture',
    'categories',
    'category',
    'city-data',
    'clipboard',
    'element',
    'local-ip',
    'machine-info',
    'ocr',
    'proxy',
    'restart',
    'update',
    'wanda-http',
    'window'
  ]
  const likelyFromStrings = allStrings.filter((value) => {
    if (!/^[a-z][a-z0-9:-]*(?:-[a-z0-9:]+)*$/.test(value)) return false
    return value.includes('-') && ipcKeywords.some((keyword) => value.includes(keyword))
  })
  const knownMainIpc = [
    'alipay-clear-session',
    'alipay-sync-device',
    'alipay-convert',
    'download-update',
    'update-download-progress',
    'wanda-http-get',
    'wanda-http-post',
    'get-local-ip',
    'restart-app'
  ].filter((name) => mainText.includes(name) || preloadText.includes(name))

  return {
    main: unique([...explicitMain, ...likelyFromStrings, ...knownMainIpc]),
    preloadInvokes: unique([...preloadInvokes, ...likelyFromStrings, ...knownMainIpc])
  }
}

function listConfigFiles(configRoot) {
  if (!fs.existsSync(configRoot)) return []

  return fs.readdirSync(configRoot)
    .filter((name) => fs.statSync(path.join(configRoot, name)).isFile())
    .sort((a, b) => a.localeCompare(b))
}

function asMdList(items, emptyText = '- 未提取到') {
  return items.length ? items.map((item) => `- ${item}`) : [emptyText]
}

function assetLines(assets) {
  return assets.map((asset) => `- ${asset.name}（${asset.bytes} 字节）`)
}

function dependencyLines(dependencies) {
  const entries = Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))

  return entries.length
    ? entries.map(([name, version]) => `- ${name}：${version}`)
    : ['- 未提取到']
}

function featureLines(features) {
  return features.length
    ? features.map((feature) => {
      const parts = [`证据：${feature.evidence.join('；')}`]
      if (feature.notes.length) parts.push(`归纳：${feature.notes.join('；')}`)

      return `- ${feature.name}：${parts.join('；')}`
    })
    : ['- 未提取到']
}

function makeFeature(name, checks, notes = []) {
  const evidence = checks.filter(([found]) => found).map(([, text]) => text)
  if (!evidence.length) return null

  return {
    name,
    evidence,
    notes: notes.filter(([found]) => found).map(([, text]) => text)
  }
}

function buildFeatureModules(apiPaths, ipcNames, preloadApiNames, assetNames, services) {
  const hasApi = (apiPath) => apiPaths.includes(apiPath)
  const hasApiPrefix = (prefix) => apiPaths.some((apiPath) => apiPath.startsWith(prefix))
  const hasIpc = (ipcName) => ipcNames.includes(ipcName)
  const hasPreload = (apiName) => preloadApiNames.includes(apiName)
  const hasAsset = (assetPart) => assetNames.some((assetName) => assetName.includes(assetPart))
  const modules = [
    makeFeature('软件登录页', [
      [hasAsset('LoginView'), 'LoginView 资源'],
      [services.oldSoftwareAuth.found, '旧软件鉴权服务线索']
    ], [
      [hasAsset('LoginView') && services.oldSoftwareAuth.found, '本期按用户要求跳过软件鉴权']
    ]),
    makeFeature('万达账号登录', [
      [hasApi('/user/login_verify_code.api'), '/user/login_verify_code.api'],
      [hasApi('/user/login.api'), '/user/login.api'],
      [hasIpc('read-accounts'), 'read-accounts'],
      [hasIpc('write-accounts'), 'write-accounts']
    ]),
    makeFeature('购票查询', [
      [hasAsset('TicketView'), 'TicketView 资源'],
      [hasAsset('cinemaApi'), 'cinemaApi 资源'],
      [hasApi('/cinema/by_cinemaid.api'), '/cinema/by_cinemaid.api'],
      [hasApi('/showtime/by_cinema.api'), '/showtime/by_cinema.api']
    ]),
    makeFeature('动态座位图', [
      [hasAsset('seatApi'), 'seatApi 资源'],
      [hasApi('/order/real_time_seat.api'), '/order/real_time_seat.api']
    ], [
      [hasApi('/order/real_time_seat.api'), '座位图来自实时接口，不使用固定模板']
    ]),
    makeFeature('订单与支付', [
      [hasApi('/order/create.api'), '/order/create.api'],
      [hasApi('/order/prepay.api'), '/order/prepay.api'],
      [hasApi('/order/merge_payment.api'), '/order/merge_payment.api'],
      [hasApi('/order/order_status.api'), '/order/order_status.api'],
      [services.alipay.found, '支付宝网关']
    ]),
    makeFeature('历史订单', [
      [hasAsset('OrderHistoryView'), 'OrderHistoryView 资源'],
      [hasApi('/order/query_order_list.api'), '/order/query_order_list.api'],
      [hasApi('/order/query_pay_info_upgrade.api'), '/order/query_pay_info_upgrade.api']
    ]),
    makeFeature('储值卡', [
      [hasAsset('StoredValueCardView'), 'StoredValueCardView 资源'],
      [hasApi('/card/user_card/list.api'), '/card/user_card/list.api'],
      [hasApi('/card/pay/list.api'), '/card/pay/list.api']
    ]),
    makeFeature('兑换券', [
      [hasAsset('ExchangeCouponView'), 'ExchangeCouponView 资源'],
      [hasApi('/coupon/member/grouplist.api'), '/coupon/member/grouplist.api'],
      [hasApi('/coupon/bind.api'), '/coupon/bind.api'],
      [hasApiPrefix('/coupon/present/'), '/coupon/present/*']
    ]),
    makeFeature('会员权益', [
      [hasAsset('VipView'), 'VipView 资源'],
      [hasApiPrefix('/member/grade/'), '/member/grade/*'],
      [hasApi('/wplus/member/plusDetail.api'), '/wplus/member/plusDetail.api'],
      [hasApi('/sign_in/calendar.api'), '/sign_in/calendar.api']
    ]),
    makeFeature('活动礼包', [
      [hasAsset('ActivityView'), 'ActivityView 资源'],
      [hasApiPrefix('/pack_activity/activity/'), '/pack_activity/activity/*'],
      [hasApiPrefix('/mkt/activity/secret/'), '/mkt/activity/secret/*']
    ]),
    makeFeature('OCR 识别', [
      [services.baiduOcr.found, '百度 OCR 服务地址'],
      [services.baiduOcr.urls.some((url) => url.includes('/oauth/2.0/token')), '百度 OCR token 地址'],
      [services.baiduOcr.urls.some((url) => url.includes('/ocr/v1/accurate')), 'accurate/accurate_basic 识别地址'],
      [hasIpc('ocr-recognize'), 'ocr-recognize'],
      [hasPreload('captureElement'), 'captureElement'],
      [hasPreload('readClipboardImage'), 'readClipboardImage'],
      [hasPreload('aiParseOcr'), 'aiParseOcr']
    ]),
    makeFeature('代理与自动支付辅助', [
      [hasIpc('fetch-proxy'), 'fetch-proxy'],
      [hasIpc('proxy-get-used'), 'proxy-get-used'],
      [hasIpc('proxy-clear-cache'), 'proxy-clear-cache'],
      [hasIpc('alipay-sync-device'), 'alipay-sync-device'],
      [hasIpc('alipay-convert'), 'alipay-convert'],
      [hasIpc('alipay-clear-session'), 'alipay-clear-session']
    ]),
    makeFeature('自动下单', [
      [hasAsset('AutoOrderView'), 'AutoOrderView 资源'],
      [hasIpc('open-auto-order-window'), 'open-auto-order-window'],
      [hasIpc('auto-order-process-ticket'), 'auto-order-process-ticket'],
      [hasIpc('auto-order-report-result'), 'auto-order-report-result']
    ]),
    makeFeature('日志与设置', [
      [hasAsset('LogView'), 'LogView 资源'],
      [hasAsset('SettingsView'), 'SettingsView 资源'],
      [hasPreload('readProxySettings'), 'readProxySettings'],
      [hasPreload('writeProxySettings'), 'writeProxySettings']
    ], [
      [hasAsset('SettingsView'), '包含窗口、主题、请求参数等设置线索']
    ])
  ]

  return modules.filter(Boolean)
}

function buildFeaturePatterns(apiPaths, ipcNames, preloadApiNames, services) {
  const hasApi = (apiPath) => apiPaths.includes(apiPath)
  const hasApiPrefix = (prefix) => apiPaths.some((apiPath) => apiPath.startsWith(prefix))
  const hasIpc = (ipcName) => ipcNames.includes(ipcName)
  const hasPreload = (apiName) => preloadApiNames.includes(apiName)
  const patterns = [
    makeFeature('购票链路', [
      [hasApi('/cinema/by_cinemaid.api'), '/cinema/by_cinemaid.api'],
      [hasApi('/showtime/by_cinema.api'), '/showtime/by_cinema.api'],
      [hasApi('/order/real_time_seat.api'), '/order/real_time_seat.api']
    ], [
      [hasApi('/showtime/by_cinema.api') && hasApi('/order/real_time_seat.api'), '根据接口组合归纳为城市/影院/影片/日期/场次到座位的链路']
    ]),
    makeFeature('座位来源', [
      [hasApi('/order/real_time_seat.api'), '/order/real_time_seat.api']
    ], [
      [hasApi('/order/real_time_seat.api'), '座位状态来自旧 Wanda 实时座位接口']
    ]),
    makeFeature('下单支付链路', [
      [hasApi('/order/create.api'), '/order/create.api'],
      [hasApi('/order/prepay.api'), '/order/prepay.api'],
      [hasApi('/order/merge_payment.api'), '/order/merge_payment.api'],
      [hasApi('/order/order_status.api'), '/order/order_status.api'],
      [hasApi('/order/cancel.api'), '/order/cancel.api'],
      [hasApi('/order/refund_order.api'), '/order/refund_order.api']
    ]),
    makeFeature('支付宝辅助链路', [
      [services.alipay.found, '支付宝网关'],
      [hasIpc('alipay-sync-device'), 'alipay-sync-device'],
      [hasIpc('alipay-convert'), 'alipay-convert'],
      [hasIpc('alipay-clear-session'), 'alipay-clear-session']
    ]),
    makeFeature('OCR 辅助链路', [
      [services.baiduOcr.found, '百度 OCR 服务地址'],
      [hasPreload('captureElement'), 'captureElement'],
      [hasPreload('readClipboardImage'), 'readClipboardImage'],
      [hasPreload('aiParseOcr'), 'aiParseOcr']
    ]),
    makeFeature('卡券与会员链路', [
      [hasApi('/card/user_card/list.api'), '/card/user_card/list.api'],
      [hasApi('/card/pay/list.api'), '/card/pay/list.api'],
      [hasApi('/coupon/member/grouplist.api'), '/coupon/member/grouplist.api'],
      [hasApiPrefix('/member/grade/'), '/member/grade/*'],
      [hasApi('/wplus/member/plusDetail.api'), '/wplus/member/plusDetail.api']
    ]),
    makeFeature('网络与代理链路', [
      [hasIpc('wanda-http-get'), 'wanda-http-get'],
      [hasIpc('wanda-http-post'), 'wanda-http-post'],
      [hasIpc('fetch-proxy'), 'fetch-proxy'],
      [hasIpc('proxy-get-used'), 'proxy-get-used'],
      [hasIpc('proxy-clear-cache'), 'proxy-clear-cache']
    ])
  ]

  return patterns.filter(Boolean)
}

assertFileExists(files.packageJson, '旧应用 package.json')
assertFileExists(files.main, '旧应用主进程文件')
assertFileExists(files.preload, '旧应用 preload 文件')
assertDirExists(files.rendererAssets, '旧应用渲染资源目录')

const packageJson = JSON.parse(readText(files.packageJson))
const mainText = readText(files.main)
const preloadText = readText(files.preload)
const jsAssets = readAssetList(files.rendererAssets, '.js')
const cssAssets = readAssetList(files.rendererAssets, '.css')
const rendererTexts = jsAssets.map((asset) => readText(path.join(files.rendererAssets, asset.name)))
const rendererText = rendererTexts.join('\n')
const allCode = [mainText, preloadText, rendererText].join('\n')
const allStrings = unique([mainText, preloadText].flatMap((text) => extractStringLiterals(text)))
const searchText = [allCode, allStrings.join('\n')].join('\n')

const baiduOcrUrls = extractUrls(searchText, /aip\.baidubce\.com/)
const alipayUrls = extractUrls(searchText, /alipay\.com/)
const oldAuthUrls = extractUrls(searchText, /fn1\.sxjrj\.cn|Api\?AppId=/)
const updateUrls = extractUrls(searchText, /qp\.sxjrj\.cn\/update/)
const oldAuthMarkers = unique([
  [/Api\?AppId=/.test(searchText), '旧鉴权接口标记'],
  [searchText.includes('授权'), '授权'],
  [searchText.includes('软件鉴权'), '软件鉴权'],
  [oldAuthUrls.length > 0, '旧鉴权服务地址已脱敏']
].filter(([found]) => found).map(([, marker]) => marker))
const ipc = extractIpcNames(mainText, preloadText, allStrings)
const preloadApiNames = extractPreloadApiNames(preloadText)
const wandaHosts = matchGroup(searchText, /\b([A-Za-z0-9.-]+\.wandafilm\.com)\b/g)
const wandaApiPaths = extractApiPaths(searchText)
const externalServices = {
  baiduOcr: {
    found: baiduOcrUrls.length > 0,
    urls: baiduOcrUrls
  },
  alipay: {
    found: alipayUrls.length > 0 || searchText.includes('支付宝'),
    urls: alipayUrls
  },
  oldSoftwareAuth: {
    found: oldAuthUrls.length > 0 || oldAuthMarkers.length > 0,
    urls: oldAuthUrls,
    markers: oldAuthMarkers,
    urlCount: oldAuthUrls.length,
    markerCount: oldAuthMarkers.length
  },
  oldUpdate: {
    found: updateUrls.length > 0,
    urls: updateUrls,
    urlCount: updateUrls.length
  }
}
const rendererAssetNames = [...jsAssets, ...cssAssets].map((asset) => asset.name)
const featureModules = buildFeatureModules(wandaApiPaths, ipc.main, preloadApiNames, rendererAssetNames, externalServices)
const featurePatterns = buildFeaturePatterns(wandaApiPaths, ipc.main, preloadApiNames, externalServices)

const index = {
  generatedAt: new Date().toISOString(),
  oldPackagePath: oldRoot,
  app: {
    name: packageJson.name,
    version: packageJson.version,
    description: packageJson.description,
    main: packageJson.main,
    dependencies: packageJson.dependencies || {}
  },
  keyFiles: files,
  ipc,
  preloadApiNames,
  wanda: {
    hosts: wandaHosts,
    apiPaths: wandaApiPaths,
    saltFound: /Wanda1_[A-Za-z0-9]+/.test(allCode)
  },
  externalServices,
  featureModules,
  featurePatterns,
  rendererAssets: {
    js: jsAssets,
    css: cssAssets
  },
  configFiles: listConfigFiles(files.config)
}

fs.mkdirSync(docsRoot, { recursive: true })
fs.writeFileSync(path.join(docsRoot, 'old-package-index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')

const lines = [
  '# 旧 Electron 打包产物索引',
  '',
  `旧包路径：${index.oldPackagePath}`,
  '',
  '## 旧应用信息',
  '',
  `- 名称：${index.app.name || '未提取到'}`,
  `- 版本：${index.app.version || '未提取到'}`,
  `- 描述：${index.app.description || '未提取到'}`,
  `- 主入口：${index.app.main || '未提取到'}`,
  '',
  '## 旧 package dependencies',
  '',
  ...dependencyLines(index.app.dependencies),
  '',
  '## 关键文件',
  '',
  `- package.json：${index.keyFiles.packageJson}`,
  `- 主进程：${index.keyFiles.main}`,
  `- Preload：${index.keyFiles.preload}`,
  `- 渲染资源目录：${index.keyFiles.rendererAssets}`,
  `- 本地配置目录：${index.keyFiles.config}`,
  '',
  '## Wanda 主机',
  '',
  ...asMdList(index.wanda.hosts),
  '',
  '## Wanda 接口路径',
  '',
  ...asMdList(index.wanda.apiPaths),
  '',
  '## Wanda 签名盐值',
  '',
  `- 是否检测到：${index.wanda.saltFound ? '是' : '否'}`,
  '- 说明：索引只记录是否存在，不输出完整盐值。',
  '',
  '## 主进程 IPC',
  '',
  ...asMdList(index.ipc.main),
  '',
  '## Preload 暴露 API',
  '',
  ...asMdList(index.preloadApiNames),
  '',
  '## 外部服务',
  '',
  `- 百度 OCR：${index.externalServices.baiduOcr.found ? index.externalServices.baiduOcr.urls.join('，') : '未检测到'}`,
  `- 支付宝：${index.externalServices.alipay.found ? index.externalServices.alipay.urls.join('，') : '未检测到'}`,
  `- 旧软件鉴权：${index.externalServices.oldSoftwareAuth.found ? `检测到线索（URL ${index.externalServices.oldSoftwareAuth.urlCount} 条，标记 ${index.externalServices.oldSoftwareAuth.markerCount} 条，已脱敏）` : '未检测到'}`,
  `- 旧更新地址：${index.externalServices.oldUpdate.found ? `检测到线索（URL ${index.externalServices.oldUpdate.urlCount} 条，已脱敏）` : '未检测到'}`,
  '',
  '## 旧功能模块',
  '',
  ...featureLines(index.featureModules),
  '',
  '## 旧业务模式',
  '',
  ...featureLines(index.featurePatterns),
  '',
  '## 渲染资源统计',
  '',
  `- JS 文件数：${index.rendererAssets.js.length}`,
  ...assetLines(index.rendererAssets.js),
  `- CSS 文件数：${index.rendererAssets.css.length}`,
  ...assetLines(index.rendererAssets.css),
  '',
  '## 本地配置文件',
  '',
  ...asMdList(index.configFiles),
  '',
  '> 只列出配置文件名，不写入旧包账号、CK 或代理配置内容。',
  ''
]

fs.writeFileSync(path.join(docsRoot, 'old-package-index.md'), lines.join('\n'), 'utf8')

console.log(`旧包索引已生成：${path.join(docsRoot, 'old-package-index.md')}`)
console.log(`旧包索引 JSON 已生成：${path.join(docsRoot, 'old-package-index.json')}`)
