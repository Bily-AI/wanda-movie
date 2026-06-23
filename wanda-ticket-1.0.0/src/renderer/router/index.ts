import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import ActivityView from '../views/ActivityView.vue'
import AutoOrderView from '../views/AutoOrderView.vue'
import ExchangeCouponView from '../views/ExchangeCouponView.vue'
import LogView from '../views/LogView.vue'
import MemberView from '../views/MemberView.vue'
import OrderHistoryView from '../views/OrderHistoryView.vue'
import SettingsView from '../views/SettingsView.vue'
import StoredValueCardView from '../views/StoredValueCardView.vue'
import TicketView from '../views/TicketView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/ticket'
  },
  {
    path: '/ticket',
    name: 'ticket',
    component: TicketView,
    meta: { title: '购票' }
  },
  {
    path: '/orders',
    name: 'orders',
    component: OrderHistoryView,
    meta: { title: '历史订单' }
  },
  {
    path: '/auto-order',
    name: 'auto-order',
    component: AutoOrderView,
    meta: { title: '自动接单' }
  },
  {
    path: '/stored-card',
    name: 'stored-card',
    component: StoredValueCardView,
    meta: { title: '储值卡' }
  },
  {
    path: '/voucher',
    name: 'voucher',
    component: ExchangeCouponView,
    meta: { title: '兑换券' }
  },
  {
    path: '/member',
    name: 'member',
    component: MemberView,
    meta: { title: '会员' }
  },
  {
    path: '/activity',
    name: 'activity',
    component: ActivityView,
    meta: { title: '活动' }
  },
  {
    path: '/log',
    name: 'log',
    component: LogView,
    meta: { title: '日志' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView,
    meta: { title: '设置' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
