<script setup lang="ts">
import { watch } from 'vue'

import {
  Connection,
  Grid,
  Key,
  Lock,
  Picture,
  Refresh,
  Search,
  UserFilled
} from '@element-plus/icons-vue'

import SeatMap from '@renderer/components/SeatMap.vue'
import SelectedSeatList from '@renderer/components/SelectedSeatList.vue'
import { useAccountsStore } from '@renderer/stores/accounts'
import { useTicketStore } from '@renderer/stores/ticket'
import type { WandaAccount } from '@shared/localData'

const accountsStore = useAccountsStore()
const ticketStore = useTicketStore()

function handleAccountSelectionChange(rows: WandaAccount[]): void {
  accountsStore.setSelectedAccountIds(rows.map((row) => row.id))
}

watch(
  () => accountsStore.currentAccountId,
  (currentAccountId, previousAccountId) => {
    if (currentAccountId !== previousAccountId) {
      ticketStore.handleAccountChanged()
    }
  }
)
</script>

<template>
  <section class="ticket-page">
    <aside class="account-column">
      <section class="panel account-panel">
        <div class="account-toolbar">
          <el-icon class="toolbar-icon"><UserFilled /></el-icon>
          <el-select v-model="accountsStore.selectedGroupId" size="small" placeholder="分组">
            <el-option
              v-for="group in accountsStore.groups"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
          <el-button size="small" :icon="Refresh" @click="accountsStore.loadAccounts()" />
          <el-input
            v-model="accountsStore.searchKeyword"
            size="small"
            placeholder="搜索..."
            :prefix-icon="Search"
          />
        </div>

        <el-table
          class="account-table"
          :data="accountsStore.filteredAccounts"
          height="100%"
          row-key="id"
          empty-text="暂无数据"
          @selection-change="handleAccountSelectionChange"
        >
          <el-table-column type="selection" width="40" />
          <el-table-column prop="phone" label="手机号" min-width="130" />
          <el-table-column prop="remark" label="备注" min-width="88" />
          <el-table-column prop="statusText" label="状态" width="72" />
        </el-table>

        <div class="account-actions">
          <span>已选 {{ accountsStore.selectedCount }} 项</span>
          <el-button size="small" :disabled="accountsStore.selectedCount === 0">移动到分组</el-button>
          <el-button size="small" :disabled="accountsStore.selectedCount === 0" @click="accountsStore.cancelSelection">
            取消选择
          </el-button>
        </div>
      </section>

      <section class="panel wanda-login-panel">
        <header class="panel-header">
          <span>
            <el-icon><Lock /></el-icon>
            万达账号登录
          </span>
          <el-button size="small" text>导入账号</el-button>
        </header>

        <div class="login-form">
          <el-input v-model="accountsStore.loginForm.phone" placeholder="请输入手机号">
            <template #prepend>+86</template>
          </el-input>
          <div class="login-code-row">
            <el-input v-model="accountsStore.loginForm.code" placeholder="验证码" />
            <el-button
              type="primary"
              :loading="accountsStore.loginForm.sending"
              :disabled="accountsStore.loginForm.sending || accountsStore.loginForm.loggingIn || !accountsStore.loginForm.phone"
              @click="accountsStore.sendLoginCode"
            >
              获取验证码
            </el-button>
          </div>
          <el-button
            class="full-button"
            type="primary"
            :loading="accountsStore.loginForm.loggingIn"
            :disabled="
              accountsStore.loginForm.sending ||
              accountsStore.loginForm.loggingIn ||
              !accountsStore.loginForm.phone ||
              !accountsStore.loginForm.code ||
              !accountsStore.loginForm.requestId
            "
            @click="accountsStore.loginWandaAccount"
          >
            登录
          </el-button>
        </div>

        <div class="login-status">
          <span class="status-dot" />
          {{ accountsStore.loginStatusText }}
        </div>
      </section>
    </aside>

    <section class="ticket-center">
      <section class="panel query-panel">
        <header class="panel-header">
          <span>
            <el-icon><Search /></el-icon>
            购票查询
          </span>
        </header>

        <div class="query-layout">
          <div class="query-form">
            <label>搜索：</label>
            <el-input v-model="ticketStore.query.keyword" placeholder="使用首字母或者汉字搜索" />

            <label>城市：</label>
            <el-select
              v-model="ticketStore.query.city"
              filterable
              default-first-option
              placeholder="选择或搜索城市"
              @change="ticketStore.selectCity"
            >
              <el-option
                v-for="city in ticketStore.cities"
                :key="city.value"
                :label="city.label"
                :value="city.value"
              />
            </el-select>

            <label>影院：</label>
            <div>
              <el-select
                v-model="ticketStore.query.cinema"
                filterable
                default-first-option
                placeholder="选择或搜索影院"
                :loading="ticketStore.loadingShowtimes"
                @change="ticketStore.loadCinemaShowtimes"
              >
                <el-option
                  v-for="cinema in ticketStore.cinemas"
                  :key="cinema.value"
                  :label="cinema.label"
                  :value="cinema.value"
                />
              </el-select>
              <p class="field-tip">可直接输入影院名称或首字母搜索</p>
            </div>

            <label>影片：</label>
            <el-select
              v-model="ticketStore.query.movie"
              filterable
              default-first-option
              placeholder="请先选择影院"
              :disabled="!ticketStore.canSelectMovie"
              @change="ticketStore.selectMovie"
            >
              <el-option
                v-for="movie in ticketStore.movies"
                :key="movie.value"
                :label="movie.label"
                :value="movie.value"
              />
            </el-select>

            <label>日期：</label>
            <el-select
              v-model="ticketStore.query.date"
              filterable
              default-first-option
              placeholder="请先选择影片"
              :disabled="!ticketStore.canSelectDate"
              @change="ticketStore.selectDate"
            >
              <el-option
                v-for="date in ticketStore.dates"
                :key="date.value"
                :label="date.label"
                :value="date.value"
              />
            </el-select>

            <label>场次：</label>
            <div class="showtime-row">
              <el-select
                v-model="ticketStore.query.showtime"
                filterable
                default-first-option
                placeholder="请先选择日期"
                :disabled="!ticketStore.canSelectShowtime"
                @change="ticketStore.setShowtime"
              >
                <el-option
                  v-for="showtime in ticketStore.showtimes"
                  :key="showtime.value"
                  :label="showtime.label"
                  :value="showtime.value"
                />
              </el-select>
              <el-button
                type="primary"
                :icon="Refresh"
                :loading="ticketStore.loadingSeats"
                :disabled="!ticketStore.canRefreshSeats"
                @click="ticketStore.loadRealTimeSeats"
              >
                刷新座位
              </el-button>
            </div>

            <span />
            <p v-if="ticketStore.showtimeError" class="query-error">{{ ticketStore.showtimeError }}</p>
          </div>

          <div class="poster-panel" aria-label="影片海报区域" />
        </div>
      </section>

      <section class="panel seat-panel">
        <header class="seat-header">
          <span>
            <el-icon><Grid /></el-icon>
            选座信息
          </span>
          <span>已选 {{ ticketStore.selectedSeatCount }} 座</span>
        </header>

        <div class="screen-line">银幕</div>

        <div class="seat-stage">
          <el-empty
            v-if="ticketStore.seatNodes.length === 0"
            :description="ticketStore.seatError || '请选择城市、影院、影片、日期和场次后刷新座位'"
          />
          <div v-else class="seat-scroll">
            <SeatMap
              :seats="ticketStore.seatNodes"
              :selected-seats="ticketStore.selectedSeatNodes"
              @select="ticketStore.toggleSeat"
            />
          </div>
        </div>

        <div class="seat-legend">
          <span><i class="legend-normal" />普通区</span>
          <span><i class="legend-prime" />优选区</span>
          <span><i class="legend-vip" />VIP区</span>
          <span><i class="legend-wplus" />W+会员区</span>
          <span><i class="legend-couple" />情侣区</span>
          <span><i class="legend-special" />特惠区</span>
        </div>
      </section>
    </section>

    <aside class="order-column">
      <section class="panel side-panel">
        <header class="panel-header">
          <span>
            <el-icon><Connection /></el-icon>
            全局订单信息
          </span>
        </header>
        <div v-if="ticketStore.currentOrderId" class="order-summary">
          <p>订单号：{{ ticketStore.currentOrderId }}</p>
          <p>{{ ticketStore.currentOrderMessage }}</p>
          <el-button
            size="small"
            type="warning"
            :loading="ticketStore.orderCancelling"
            @click="ticketStore.cancelCurrentOrder"
            :disabled="ticketStore.orderCancelling"
          >
            取消订单
          </el-button>
        </div>
        <div v-else class="side-empty">{{ ticketStore.currentOrderMessage || '暂无订单' }}</div>
      </section>

      <section class="panel side-panel">
        <header class="panel-header">支付活动</header>
        <div class="side-line">
          <span>活动价</span>
          <el-select v-model="ticketStore.paymentActivity" size="small" placeholder="无活动" />
        </div>
      </section>

      <section class="panel side-panel">
        <header class="panel-header">
          <span>支付卡</span>
          <span>已选 {{ ticketStore.selectedPaymentCards.length }} / 0 张</span>
        </header>
        <div class="side-empty">暂无可用支付卡</div>
      </section>

      <section class="panel side-panel">
        <header class="panel-header">
          <span>兑换券</span>
          <span>已选 {{ ticketStore.selectedCoupons.length }} 张 | 可兑 0 / 需 0 张</span>
        </header>
        <div class="side-empty">暂无可用兑换券</div>
      </section>

      <section class="panel side-panel">
        <header class="panel-header">
          <span>已选座位</span>
          <span>{{ ticketStore.selectedSeatCount }} / {{ ticketStore.maxSeatCount }}</span>
        </header>
        <SelectedSeatList :selected-seats="ticketStore.selectedSeatNodes" />
      </section>
    </aside>

    <footer class="bottom-actions">
      <el-button :icon="Refresh">刷新购票码</el-button>
      <el-button :icon="Picture">图片识别</el-button>
      <el-button :icon="Key">文本识别</el-button>
      <span class="bottom-spacer" />
      <el-button type="warning" :disabled="ticketStore.selectedSeatCount === 0" @click="ticketStore.clearSeatSelection">
        取消选择
      </el-button>
      <el-button type="success" :disabled="ticketStore.selectedSeatCount === 0">确认选座</el-button>
      <el-popconfirm
        title="确认创建电影票订单？本阶段不会发起支付。"
        confirm-button-text="确认"
        cancel-button-text="取消"
        @confirm="ticketStore.createCurrentOrder"
      >
        <template #reference>
          <el-button
            type="primary"
            :loading="ticketStore.orderCreating"
            :disabled="ticketStore.selectedSeatCount === 0 || ticketStore.orderCreating"
          >
            提交支付
          </el-button>
        </template>
      </el-popconfirm>
    </footer>
  </section>
</template>

<style scoped>
.ticket-page {
  min-width: 1080px;
  min-height: 100%;
  display: grid;
  grid-template-columns: 300px minmax(460px, 1fr) 288px;
  grid-template-rows: minmax(0, 1fr) 56px;
  gap: 12px;
}

.account-column,
.ticket-center,
.order-column {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel {
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  box-shadow: 0 2px 10px rgb(31 42 68 / 5%);
}

.panel-header,
.seat-header {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font-weight: 700;
}

.panel-header span,
.seat-header span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-header :deep(.el-icon),
.seat-header :deep(.el-icon) {
  color: var(--app-accent);
}

.account-panel {
  flex: 1;
  min-height: 460px;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

.account-toolbar {
  display: grid;
  grid-template-columns: 28px 110px 40px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.toolbar-icon {
  color: var(--app-text);
  font-size: 20px;
}

.account-table {
  flex: 1;
}

.account-actions {
  min-height: 44px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  color: var(--app-muted);
}

.wanda-login-panel {
  padding-bottom: 12px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.login-code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px;
  gap: 8px;
}

.full-button {
  width: 100%;
}

.login-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  color: var(--app-muted);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c7d0dd;
}

.query-panel {
  padding-bottom: 16px;
}

.query-layout {
  display: grid;
  grid-template-columns: minmax(360px, 540px) minmax(240px, 1fr);
  gap: 16px;
  padding: 16px;
}

.query-form {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 10px 12px;
  align-items: center;
}

.query-form label {
  color: var(--app-subtle);
}

.field-tip {
  margin: 4px 0 0;
  color: #f56c6c;
  font-size: 12px;
}

.query-error {
  margin: 0;
  color: #f56c6c;
  font-size: 12px;
}

.showtime-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 8px;
}

.poster-panel {
  min-height: 232px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: #fbfcfe;
}

.seat-panel {
  flex: 1;
  min-height: 440px;
  display: flex;
  flex-direction: column;
}

.seat-header span:last-child {
  color: var(--app-muted);
  font-weight: 400;
}

.screen-line {
  margin: 38px 28px 0;
  border-top: 3px solid #e2e8f2;
  color: var(--app-muted);
  text-align: center;
  line-height: 30px;
}

.seat-stage {
  flex: 1;
  min-height: 220px;
  display: grid;
  place-items: center;
}

.seat-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.seat-legend {
  min-height: 48px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 0 24px 16px;
  color: var(--app-subtle);
  font-size: 13px;
}

.seat-legend i {
  width: 14px;
  height: 14px;
  display: inline-block;
  margin-right: 4px;
  border-radius: 3px;
  vertical-align: -2px;
}

.legend-normal { border: 2px solid #e6a23c; }
.legend-prime { border: 2px solid #67c23a; }
.legend-vip { border: 2px solid #409eff; }
.legend-wplus { border: 2px solid #6b75c9; }
.legend-couple { border: 2px solid #f56c6c; }
.legend-special { border: 2px solid #49b45f; }

.side-panel {
  min-height: 92px;
}

.side-empty {
  min-height: 48px;
  display: grid;
  place-items: center;
  color: var(--app-muted);
  text-align: center;
}

.order-summary {
  padding: 12px 16px;
  color: var(--app-text);
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.order-summary p {
  margin: 0 0 8px;
}

.side-line {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px 16px 16px;
  color: var(--app-subtle);
}

.bottom-actions {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 4px;
}

.bottom-spacer {
  flex: 1;
}
</style>
