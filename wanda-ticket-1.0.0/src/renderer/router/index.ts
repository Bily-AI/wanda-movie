import { defineComponent, h } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

function createPlaceholderPage(name: string, title: string) {
  return defineComponent({
    name,
    setup() {
      return () =>
        h('section', { class: 'route-placeholder' }, [
          h('h1', { class: 'route-placeholder__title' }, title),
          h('p', { class: 'route-placeholder__text' }, '暂无数据')
        ])
    }
  })
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/ticket'
  },
  {
    path: '/ticket',
    name: 'ticket',
    component: createPlaceholderPage('TicketPlaceholder', '购票'),
    meta: { title: '购票' }
  },
  {
    path: '/orders',
    name: 'orders',
    component: createPlaceholderPage('OrdersPlaceholder', '历史订单'),
    meta: { title: '历史订单' }
  },
  {
    path: '/stored-card',
    name: 'stored-card',
    component: createPlaceholderPage('StoredCardPlaceholder', '储值卡'),
    meta: { title: '储值卡' }
  },
  {
    path: '/voucher',
    name: 'voucher',
    component: createPlaceholderPage('VoucherPlaceholder', '兑换券'),
    meta: { title: '兑换券' }
  },
  {
    path: '/member',
    name: 'member',
    component: createPlaceholderPage('MemberPlaceholder', '会员'),
    meta: { title: '会员' }
  },
  {
    path: '/activity',
    name: 'activity',
    component: createPlaceholderPage('ActivityPlaceholder', '活动'),
    meta: { title: '活动' }
  },
  {
    path: '/log',
    name: 'log',
    component: createPlaceholderPage('LogPlaceholder', '日志'),
    meta: { title: '日志' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: createPlaceholderPage('SettingsPlaceholder', '设置'),
    meta: { title: '设置' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
