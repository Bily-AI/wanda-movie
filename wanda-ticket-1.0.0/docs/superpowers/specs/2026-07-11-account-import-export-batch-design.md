# 账号区:导出账号 + 分隔符改 `----` + 批量删除/导出 · 设计文档

- 日期:2026-07-11
- 范围:`wanda-ticket-1.0.0` 账号侧栏(`AccountSidebar.vue` + `stores/accounts.ts`)
- 目标:新增导出账号能力、导入/导出分隔符由 `---` 改为 `----`、支持批量删除与批量导出选中账号。

## 1. 背景与现状

账号侧栏现有:
- **导入账号**:`AccountSidebar.vue:531` 按钮 → 文本框对话框(`:665`)→ `accountsStore.importAccountsFromText`(`accounts.ts:488`)→ `parseImportedAccounts`(`:223`)→ 逐行 `buildImportedAccount`(`:166`),**行内字段以 `---` 分隔**(`accounts.ts:174` `.split('---')`)。占位符示例在 `AccountSidebar.vue:36`。
- **多选**:`selectedAccountIds`/`selectedCount` 已有;动作行(`:458` `account-management-actions`)现有「移动分组」「取消选择」。
- **单个删除**:`deleteAccount(id)`(`accounts.ts:403`),带 `ElMessageBox.confirm`(`AccountSidebar.vue:264`)。
- **无任何导出功能**(store 无、UI 无)。

## 2. 需求

1. **分隔符 `---` → `----`**:导入解析与占位符提示**直接**由 3 个连字符改为 4 个连字符,**不保留 `---` 兼容**。
2. **新增「导出账号」按钮**:与「导入账号」并排(`AccountSidebar.vue:530` 登录卡头部动作区),导出**全部账号**为 `----` 文本。
3. **批量删除**:动作行加「批量删除」,删除选中账号,带二次确认。
4. **批量导出**:动作行加「批量导出」,只导出选中账号。

## 3. 导出格式(与导入互通,可往返)

每行一个账号,字段用 `----` 连接:
- 有备注:`备注----ck----手机号----登录时间`
- 无备注:`手机号----ck----登录时间`

> 该两种行都能被改造后的 `buildImportedAccount` 正确解析(Format B / Format A),保证「导出→再导入」往返一致。`登录时间` 缺失时省略末段。

## 4. 交互设计

- **导出对话框**(与导入对话框对称):只读 `el-input textarea` 展示生成文本 + 「复制」按钮(`navigator.clipboard.writeText`,失败回退选中文本)+「关闭」。标题「导出账号」。不使用 Electron 文件 API。
- **「导入账号 | 导出账号」并排**:登录卡头部 `login-card-actions`(`AccountSidebar.vue:530`),导出按钮 `text` 型,`:disabled="accountsStore.accounts.length === 0"`。
- **动作行新增两键**(`account-management-actions` `:458`):
  - 「批量删除」`el-button size="small" type="danger"`,`:disabled="selectedCount === 0"`,点击 `ElMessageBox.confirm('确定删除选中的 N 个账号？')` → `deleteAccounts(selectedAccountIds)`。
  - 「批量导出」`el-button size="small"`,`:disabled="selectedCount === 0"` → 打开导出对话框,内容为选中账号文本。

## 5. store 改动(`accounts.ts`)

- `buildImportedAccount`(`:174`):`.split('---')` 直接改为 `.split('----')`(不保留三杠兼容)。
- 新增 helper `function formatAccountExportLine(account: WandaAccount): string`:按第 3 节格式拼行。
- 新增 action `exportAccountsToText(ids?: string[]): string`:`ids` 为空导出全部,否则导出匹配 `ids` 的账号;逐个 `formatAccountExportLine` 用 `\n` 连接。
- 新增 action `async deleteAccounts(ids: string[])`:遍历删除(复用 `deleteAccount` 逻辑或直接过滤 `this.accounts`),清理 `selectedAccountIds`,`saveAccounts()`,写日志,返回删除数量。

## 6. AccountSidebar.vue 改动

- `importAccountsPlaceholder`(`:36`)示例分隔符改 `----`。
- 新增 `exportDialogVisible`/`exportText` ref;`handleExportAccounts()`(全部)与 `handleBatchExportAccounts()`(选中)填充 `exportText` 并打开对话框;`handleCopyExportText()`。
- 新增 `handleBatchDeleteAccounts()`:确认后调 `deleteAccounts`。
- 模板:登录卡头部加「导出账号」按钮;动作行加「批量删除」「批量导出」;末尾加导出对话框(复用 `legacy-account-import-dialog` 同款样式类或新增)。

## 7. 测试与验证

- `npm run typecheck` 通过。
- `npm run check:global-account-sidebar` 通过(如契约约束动作行/按钮,同步更新)。
- `npm run check:all` 除既有无关项外通过。
- 手动:导入 `----` 文本 → 账号入库;导入旧 `---` 文本仍成功(兼容);导出全部/选中 → 文本格式正确、可复制、可再导入往返;批量删除选中 → 账号移除、选择清空。

## 8. 范围外

- 导出到文件(.txt/.csv)——本次用对话框+复制,暂不做。
- 账号字段加密/脱敏导出——按现状明文(与导入对称)。

## 9. 风险

- 分隔符若同时出现在 ck/备注中会误分割;`----` 比 `---` 更不易撞车。**直接改为 `----` 后,旧的三杠文本将不再能导入**(用户明确要求,不做兼容)。
- `check:global-account-sidebar` 若锁定动作行按钮集合,需同步放开/更新。
