# 历史订单取票码弹窗对齐官方样式 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans(主会话内联执行)。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 保留两套模板切换;万达风格照官方 App 取票界面重做,默认模板清理简洁。

**Architecture:** 仅改 `OrderHistoryView.vue`——`buildTicketDetail` 补下单时间;重写 `wanda-official-content` 模板+CSS 为官方卡片版式;清理默认模板的深色广告横幅。保留契约要求的 `history-ticket-code-panel`/`history-ticket-code-dialog`/截图复制 handler。

**Tech Stack:** Vue3 + Element Plus + TS;测试面 `tools/check-*.mjs` + `vue-tsc`。

## Global Constraints

- 保留两套模板切换(`settingsStore.ticketCodeTemplate` 默认/万达风格)。
- 必保留(契约 `check:history-ticket-code`):`history-ticket-code-panel`、`history-ticket-code-dialog`、`handleCaptureHistoryTicketCode`、`handleCopyHistoryTicketCode`、`canCaptureHistoryTicketCode`、`:disabled="!canCaptureHistoryTicketCode"`、`<img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)"`。
- 每任务:`npm run typecheck` + `check:history-ticket-code` 通过,提交。

---

### Task 1: 数据——ticketDetail 补下单时间

**Files:** Modify `src/renderer/views/OrderHistoryView.vue`

- [ ] **Step 1: TicketDetail 加字段** — `interface TicketDetail`(`:18`)的 `moviePoster: string` 后加:

```ts
  moviePoster: string
  createdAtLabel: string
```

- [ ] **Step 2: buildTicketDetail 赋值** — 返回对象(`moviePoster: firstText(...)` 后)加:

```ts
    moviePoster: firstText(movie.coverUrl, movie.moviePoster),
    createdAtLabel: order.createdAt ? formatDateTime(order.createdAt) : '-',
```

- [ ] **Step 3: 加取票码分组 helper** — `<script setup>` 内(靠近 `maskedMobile`)新增:

```ts
function groupTicketCode(code: string): string {
  return String(code || '').replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}
```

- [ ] **Step 4: 类型检查** — `npm run typecheck` → PASS

- [ ] **Step 5: 提交**

```bash
git add src/renderer/views/OrderHistoryView.vue
git commit -m "feat(history): ticketDetail 补下单时间与取票码分组 helper"
```

---

### Task 2: 万达风格模板重写为官方版式

**Files:** Modify `src/renderer/views/OrderHistoryView.vue`(`wanda-official-content` 块 `:838-892` + CSS)

- [ ] **Step 1: 替换 `wanda-official-content` 整块** — `<div v-else class="wanda-official-content">…</div>`(838-892)替换为:

```html
          <div v-else class="wanda-official-content history-ticket-code-dialog">
            <div class="wo-cinema-card">
              <div class="wo-cinema-name">{{ ticketDetail.cinemaName }}</div>
              <div class="wo-cinema-address">{{ ticketDetail.cinemaAddress || '请到影院现场查看详细地址' }}</div>
            </div>

            <div class="wo-movie-card">
              <div class="wo-movie-main">
                <div class="wo-movie-title">{{ ticketDetail.movieName }}</div>
                <div class="wo-movie-meta">
                  {{ [ticketDetail.movieLanguage, ticketDetail.movieVersion].filter(Boolean).join(' ') }}
                  {{ ticketDetail.electronicCodes.length || 1 }}张
                </div>
                <div class="wo-movie-time">
                  {{ ticketDetail.showTimeStr }}<template v-if="ticketDetail.showEndTimeStr"> ~ {{ ticketDetail.showEndTimeStr }}</template>
                </div>
                <div class="wo-movie-hallseat">
                  <span v-if="ticketDetail.hallName">{{ ticketDetail.hallName }}</span>
                  <span v-if="ticketDetail.seats" class="wo-seat">{{ ticketDetail.seats }}</span>
                </div>
              </div>
              <div class="wo-movie-poster">
                <img v-if="ticketDetail.moviePoster" :src="ticketDetail.moviePoster" alt="电影海报" />
              </div>
            </div>

            <div class="wo-dashed" />

            <div class="wo-voucher history-ticket-code-panel">
              <div class="wo-section-label">取票凭证</div>
              <div class="wo-qr-box">
                <template v-for="(qrCode, index) in ticketDetail.electronicQRs" :key="`wo-qr-${index}`">
                  <img v-if="isImageQrCode(qrCode)" :src="formatQrImage(qrCode)" class="wo-qr" alt="取票二维码" />
                </template>
                <div v-if="ticketDetail.electronicQRs.length === 0" class="wo-no-qr">{{ ticketDetail.ticketTip }}</div>
              </div>
              <div v-if="ticketDetail.electronicCodes.length" class="wo-code">
                取票码：{{ groupTicketCode(ticketDetail.electronicCodes.join('')) }}
              </div>
            </div>

            <div class="wo-order-card">
              <div class="wo-order-head">
                <span>影票订单</span>
                <span class="wo-order-status">{{ ticketDetail.showOrderStatus }}</span>
              </div>
              <div class="wo-order-row"><span class="wo-order-label">订单编号</span><span>{{ ticketDetail.orderId }}</span></div>
              <div class="wo-order-row"><span class="wo-order-label">下单时间</span><span>{{ ticketDetail.createdAtLabel }}</span></div>
              <div class="wo-order-row"><span class="wo-order-label">手机号码</span><span>{{ ticketMaskedMobile }}</span></div>
              <div class="wo-order-divider" />
              <div class="wo-order-row wo-order-pay"><span class="wo-order-label">实付金额</span><strong>{{ formatMoney(ticketDetail.totalPrice) }}</strong></div>
            </div>

            <div class="history-ticket-code-dialog__actions">
              <el-button :disabled="!canCaptureHistoryTicketCode" @click="handleCaptureHistoryTicketCode">截图保存</el-button>
              <el-button type="primary" :disabled="!canCaptureHistoryTicketCode" @click="handleCopyHistoryTicketCode">复制截图</el-button>
            </div>
          </div>
```

- [ ] **Step 2: 替换旧 `.wanda-*` CSS 为官方卡片 CSS** — 删除 `wanda-official-content`/`wanda-cinema-*`/`wanda-movie-*`/`wanda-divider`/`wanda-hall-*`/`wanda-seat-*`/`wanda-item-*`/`wanda-qr-*`/`wanda-code-*`/`wanda-bottom-tip`/`wanda-no-qr` 等旧规则,替换为(浅底白卡片、居中二维码、订单信息行):

```css
.wanda-official-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: #f4f5f7;
  border-radius: 12px;
}
.wo-cinema-card {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
}
.wo-cinema-name { font-size: 15px; font-weight: 700; color: #1f2329; }
.wo-cinema-address { margin-top: 4px; font-size: 12px; color: #8a9099; }
.wo-movie-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}
.wo-movie-main { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.wo-movie-title { font-size: 18px; font-weight: 700; color: #1f2329; }
.wo-movie-meta { font-size: 12px; color: #8a9099; }
.wo-movie-time { font-size: 13px; color: #4e5561; }
.wo-movie-hallseat { display: flex; gap: 12px; font-size: 13px; color: #4e5561; }
.wo-movie-poster { flex: 0 0 auto; }
.wo-movie-poster img { width: 88px; height: 118px; object-fit: cover; border-radius: 8px; }
.wo-dashed { border-top: 1px dashed #e3e5e9; margin: 2px 6px; }
.wo-voucher {
  background: #fff;
  border-radius: 12px;
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.wo-section-label { align-self: flex-start; font-size: 15px; font-weight: 700; color: #1f2329; }
.wo-qr-box { display: grid; place-items: center; }
.wo-qr { width: 200px; height: 200px; object-fit: contain; }
.wo-no-qr { min-height: 120px; display: grid; place-items: center; color: #8a9099; font-size: 13px; }
.wo-code {
  padding: 8px 16px;
  border-radius: 8px;
  background: #f4f5f7;
  color: #8a9099;
  font-size: 14px;
  letter-spacing: 1px;
}
.wo-order-card { background: #fff; border-radius: 12px; padding: 14px 16px; }
.wo-order-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 15px; font-weight: 700; color: #1f2329; margin-bottom: 10px;
}
.wo-order-status { font-size: 12px; font-weight: 500; color: #8a9099; }
.wo-order-row {
  display: flex; justify-content: space-between; gap: 12px;
  padding: 5px 0; font-size: 13px; color: #4e5561;
}
.wo-order-label { color: #8a9099; }
.wo-order-divider { border-top: 1px solid #f0f1f3; margin: 8px 0; }
.wo-order-pay strong { font-size: 17px; font-weight: 700; color: #1f2329; }
```

- [ ] **Step 3: 类型 + 契约** — `npm run typecheck && npm run check:history-ticket-code` → PASS

- [ ] **Step 4: 提交**

```bash
git add src/renderer/views/OrderHistoryView.vue
git commit -m "feat(history): 万达风格取票弹窗重做为官方卡片版式"
```

---

### Task 3: 默认模板清理

**Files:** Modify `src/renderer/views/OrderHistoryView.vue`

- [ ] **Step 1: 删深色 W+ 广告横幅** — 删除 `<div class="ticket-ad-banner">…</div>`(`:789-795`)整块。

- [ ] **Step 2: 弱化蓝色横条 CSS** — `.ticket-tip-bar` 规则改为轻量标题(去掉大块蓝底):

```css
.ticket-tip-bar {
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 700;
  color: #1f2329;
  background: transparent;
  border-bottom: 1px solid #f0f1f3;
}
```

（删除原 `.ticket-ad-banner`/`.ad-left`/`.ad-title`/`.ad-desc` 等已无用样式。）

- [ ] **Step 3: 类型 + 契约** — `npm run typecheck && npm run check:history-ticket-code` → PASS

- [ ] **Step 4: 提交**

```bash
git add src/renderer/views/OrderHistoryView.vue
git commit -m "refactor(history): 默认取票模板去广告横幅、弱化蓝横条"
```

---

### Task 4: 全量验证

- [ ] **Step 1:** `npm run typecheck && npm run check:all` → PASS(如别的契约锁了删掉的 `ticket-ad-banner`/`wanda-*` 文案,同步更新)
- [ ] **Step 2: 手动 E2E(留用户)**:设置切「万达风格」→ 双击订单 → 版式接近官方图(影院卡/影片卡+海报/取票凭证+分组码/影票订单卡);切「默认」→ 无深色广告横幅、清爽;两态截图/复制可用;无码时显示 ticketTip。

## 自检记录

- Spec 覆盖:两模板保留(切换不动)、万达风格官方版式(T2)、默认清理(T3)、下单时间/实付数据(T1)、取票码分组(T1)、契约保留类/函数(Global+T2)、全量(T4)。
- 无占位;命名一致:`createdAtLabel`/`groupTicketCode`/`wo-*` 类贯穿。
- 契约保留:`history-ticket-code-panel`(挂 `.wo-voucher`)、`history-ticket-code-dialog`(挂 `.wanda-official-content` 及默认 `.ticket-card`)、截图复制 handler/disabled/img 均保留。
