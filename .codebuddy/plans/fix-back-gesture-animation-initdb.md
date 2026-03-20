---
name: fix-back-gesture-animation-initdb
overview: 修复4个问题：1) 审批详情页系统返回手势退出小程序；2) 审批详情页打开无动画/关闭卡顿；3) 外出报备弹窗系统返回退出页面；4) initDatabase 云函数无法创建集合/安全规则/索引。
todos:
  - id: fix-approval-back-gesture
    content: 在 approval.js 中添加 enableAlertBeforeUnload 返回拦截
    status: pending
  - id: fix-trip-report-back-gesture
    content: 在 trip-report.js 中添加 enableAlertBeforeUnload 返回拦截
    status: pending
  - id: fix-approval-detail-animation
    content: 修复 approval-detail.js 打开动画的两帧渲染 + 调整 CSS transition 时长
    status: pending
  - id: refactor-init-database
    content: 重构 initDatabase 云函数：移除无效代码，返回待配置集合列表
    status: pending
  - id: configure-acl-and-indexes
    content: 使用 [MCP:tcb] writeSecurityRule 和 writeNoSqlDatabaseStructure 批量配置安全规则和索引
    status: pending
    dependencies:
      - refactor-init-database
---

## 用户需求

### 问题1：审批中心系统返回手势退出小程序

打开申请详情弹窗后，使用系统返回手势（iOS/Android 从屏幕边缘右滑）直接退出了小程序，应关闭详情弹窗。

### 问题2：审批详情弹窗动画问题

打开时无弹出动画，关闭时有向下动画但比较快且卡顿。需要实现平滑的底部弹出/关闭动画。

### 问题3：外出报备弹窗系统返回手势退出页面

外出报备页填写弹窗打开后，系统返回手势直接退出外出报备页回到 home 页，应关闭弹窗。

### 问题4：initDatabase 云函数无法创建集合/安全规则/索引

实际测试中小程序云函数无法直接创建云数据库集合、设定安全规则和索引。需要探索原因并给出替代方案。

## 技术方案

### 问题1&3：系统返回手势拦截

**根因分析**：

- `approval.js` 和 `trip-report.js` 都没有实现返回拦截
- 审批详情弹窗（`approval-detail` 组件）不是独立页面，系统返回手势作用于父页面 `approval.js`
- 外出报备弹窗是 CSS class 控制的浮层，返回手势作用于 `trip-report.js` 页面

**解决方案**：使用微信小程序 `enableAlertBeforeUnload` API（基础库 2.24.3+）

该 API 在页面设置"离开确认"拦截器。当用户触发返回时，小程序会弹出系统确认弹窗。在 `onShow` 中根据弹窗状态动态启用/禁用：

- 打开弹窗时：`wx.enableAlertBeforeUnload({ message: '确认离开？' })` — 拦截返回
- 关闭弹窗时：`wx.disableAlertBeforeUnload()` — 取消拦截

这不是完美的"静默关闭弹窗"体验，但这是微信小程序能提供的**唯一返回拦截机制**。系统返回手势在非 tabBar 页面上会触发 `navigateBack`，无法被完全拦截为关闭弹窗。

**补充说明**：iOS 上 `enableAlertBeforeUnload` 确认弹窗可能出现两次（系统弹窗 + 微信确认）。为避免体验不佳，建议同时在外出报备弹窗的遮罩上增加明确的关闭提示。

### 问题2：审批详情弹窗动画修复

**根因分析**：

- `approval-detail.js` 第93-96行 visible observer 中，打开时一次 `setData({ animating: true, animVisible: true })` 导致浏览器来不及先渲染 DOM 再触发 CSS transition
- CSS `transition: 0.3s ease` 时长偏短，导致关闭动画显得快速卡顿

**解决方案**：使用 `requestAnimationFrame` + `setTimeout` 实现两帧渲染：

1. 打开时先 `setData({ animating: true, animVisible: false })` 让元素渲染到 DOM（无动画 class）
2. 下一帧 `setData({ animVisible: true })` 添加 class 触发 CSS transition
3. 关闭时将 `transition` 时长从 `0.3s` 调整为 `0.35s`，并添加 `cubic-bezier(0.32, 0.72, 0, 1)` 缓动曲线（更自然的弹出感）

### 问题4：initDatabase 云函数重构

**根因分析**：

- `wx-server-sdk` 的 `db.collection().add()` **理论可以自动创建集合**，但前提是集合安全规则允许当前操作
- `setCollectionAcl` 函数只是打日志，没有实际执行任何操作（代码第266-281行明确注释"云函数中无法直接设置安全规则"）
- 索引创建完全没有实现
- 真正的原因：新集合创建后默认安全规则是"仅创建者可读写"，如果集合是由小程序端（而非云函数端）首次触发创建，且后续读操作的用户不是创建者，就会出现权限问题

**解决方案**：保留云函数作为集合检查和自动创建的入口（通过 `db.collection().add()` 自动创建集合），但将安全规则和索引的设置改为：

1. 安全规则通过 CloudBase MCP 工具 `writeSecurityRule` 设置
2. 索引通过 CloudBase MCP 工具 `writeNoSqlDatabaseStructure` 的 `updateCollection` action 设置
3. 云函数 `initDatabase` 重构为：检查集合是否存在 -> 不存在则通过 `add()` 自动创建 -> 返回需要配置安全规则和索引的集合列表，由小程序端调用 MCP 工具完成配置

## 实现说明

### 修改文件清单

| 文件 | 修改类型 | 说明 |
| --- | --- | --- |
| `miniprogram/pages/office/approval/approval.js` | [MODIFY] | `openRequestDetail` 中启用返回拦截，`closeDetail` 中禁用 |
| `miniprogram/pages/office/trip-report/trip-report.js` | [MODIFY] | 弹窗打开时启用返回拦截，关闭时禁用 |
| `miniprogram/components/approval-detail/approval-detail.js` | [MODIFY] | 修复 visible observer 打开动画的两帧渲染问题 |
| `miniprogram/components/approval-detail/approval-detail.wxss` | [MODIFY] | 调整 transition 时长和缓动曲线 |
| `cloudfunctions/initDatabase/index.js` | [MODIFY] | 简化为仅检查/创建集合，移除无效的安全规则和索引代码 |


### 关键实现细节

**enableAlertBeforeUnload 使用模式**：

```js
// 打开弹窗时
wx.enableAlertBeforeUnload({ message: '' })

// 关闭弹窗时
wx.disableAlertBeforeUnload()
```

**两帧渲染模式**：

```js
// 第一帧：渲染 DOM（无动画）
this.setData({ animating: true, animVisible: false })
// 第二帧：触发 transition
setTimeout(() => { this.setData({ animVisible: true }) }, 50)
```

**initDatabase 云函数**：移除 `setCollectionAcl` 占位函数和 `aclPending`/`indexPending` 输出，改为返回 `needsConfig` 列表，供 MCP 工具批量配置。

### MCP

- **CloudBase MCP (tcb)**
- Purpose: 使用 writeSecurityRule 工具为 initDatabase 云函数创建的集合批量设置安全规则，使用 writeNoSqlDatabaseStructure 的 updateCollection action 创建索引
- Expected outcome: 14个集合的安全规则和索引配置完成