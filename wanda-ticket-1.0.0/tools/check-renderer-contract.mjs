import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const rendererRoot = path.join(projectRoot, 'src', 'renderer')
const routerPath = path.join(rendererRoot, 'router', 'index.ts')
const viewsRoot = path.join(rendererRoot, 'views')

const expectedViews = [
  {
    route: '/ticket',
    file: 'TicketView.vue',
    component: 'TicketView',
    markers: ['购票查询', '选座信息', '万达账号登录', '刷新座位']
  },
  {
    route: '/orders',
    file: 'OrderHistoryView.vue',
    component: 'OrderHistoryView',
    markers: ['历史订单', '今日订单', '总金额']
  },
  {
    route: '/stored-card',
    file: 'StoredValueCardView.vue',
    component: 'StoredValueCardView',
    markers: ['储值卡', '购买储值卡', '获取全部账号支付卡']
  },
  {
    route: '/voucher',
    file: 'ExchangeCouponView.vue',
    component: 'ExchangeCouponView',
    markers: ['兑换券', '绑定卡券', '批量赠送']
  },
  {
    route: '/member',
    file: 'MemberView.vue',
    component: 'MemberView',
    markers: ['Rtime会员', 'W+会员', '会员信息']
  },
  {
    route: '/activity',
    file: 'ActivityView.vue',
    component: 'ActivityView',
    markers: ['活动', '可购买礼包', '我的礼包订单']
  },
  {
    route: '/log',
    file: 'LogView.vue',
    component: 'LogView',
    markers: ['日志类型', '清空日志', '暂无日志记录']
  },
  {
    route: '/settings',
    file: 'SettingsView.vue',
    component: 'SettingsView',
    markers: ['设置', '自动支付设置', '业务请求头参数', '关于']
  }
]

const oldScreenshotPhonePattern = new RegExp(['1898', '2268', '306'].join(''))

const forbiddenPatterns = [
  /test001/i,
  /2027\/6\/10/,
  /608\.23/,
  oldScreenshotPhonePattern,
  /mock/i,
  /固定座位/,
  /假数据/,
  /软件鉴权/,
  /退出<\/span>/,
  />退出</
]

const forbiddenSeatPatterns = [
  /seat(?:s|List|Map)\s*[:=]\s*\[/i,
  /seat-(?:cell|item|node)/i,
  /座位编号/,
  /rowSeats/i,
  /seatRows/i
]

const failures = []

function read(file) {
  return readFileSync(file, 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findRouteBlock(routerText, route) {
  const routePattern = new RegExp(
    `^\\s*\\{\\s*\\n\\s*path:\\s*['"]${escapeRegExp(route)}['"],[\\s\\S]*?^\\s*\\},?`,
    'm'
  )

  return routerText.match(routePattern)?.[0] ?? ''
}

function listSourceFiles(root) {
  const files = []

  for (const item of readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, item.name)

    if (item.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }

    if (/\.(vue|ts|tsx|js|mjs|css)$/.test(item.name)) {
      files.push(fullPath)
    }
  }

  return files
}

if (!existsSync(routerPath)) {
  failures.push(`缺少路由文件：${routerPath}`)
} else {
  const routerText = read(routerPath)

  if (routerText.includes('createPlaceholderPage')) {
    failures.push('路由仍在使用内联占位页面，应接入独立视图文件')
  }

  for (const view of expectedViews) {
    const routeBlock = findRouteBlock(routerText, view.route)

    if (!routeBlock) {
      failures.push(`路由缺少路径：${view.route}`)
    }

    if (!routerText.includes(`views/${view.file}`) && !routerText.includes(`views\\${view.file}`)) {
      failures.push(`路由未接入视图文件：${view.file}`)
    }

    if (routeBlock && !new RegExp(`component:\\s*${view.component}[,\\n]`).test(routeBlock)) {
      failures.push(`路由 ${view.route} 未绑定到组件：${view.component}`)
    }
  }
}

for (const filePath of listSourceFiles(rendererRoot)) {
  const relativePath = path.relative(projectRoot, filePath)
  const text = read(filePath)

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(text)) {
      failures.push(`${relativePath} 命中禁止出现的假数据或鉴权文案：${pattern}`)
    }
  }
}

for (const view of expectedViews) {
  const filePath = path.join(viewsRoot, view.file)

  if (!existsSync(filePath)) {
    failures.push(`缺少视图文件：${view.file}`)
    continue
  }

  const text = read(filePath)

  for (const marker of view.markers) {
    if (!text.includes(marker)) {
      failures.push(`${view.file} 缺少关键版块：${marker}`)
    }
  }
}

const ticketViewPath = path.join(viewsRoot, 'TicketView.vue')
if (existsSync(ticketViewPath)) {
  const ticketText = read(ticketViewPath)

  if (!ticketText.includes('seat-stage') || !ticketText.includes('请选择城市、影院、影片、日期和场次后刷新座位')) {
    failures.push('TicketView.vue 必须保留动态座位容器空状态，不能预置固定座位图')
  }

  for (const pattern of forbiddenSeatPatterns) {
    if (pattern.test(ticketText)) {
      failures.push(`TicketView.vue 疑似写死固定座位结构：${pattern}`)
    }
  }
}

if (failures.length > 0) {
  console.error('渲染进程契约检查失败：')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('渲染进程契约检查通过')
