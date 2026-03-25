---
name: super-admin-login
overview: 添加超级管理员登录功能：点击auth-brand 10次触发，验证用户名密码后批量审批待批准的用户注册申请
todos:
  - id: add-auth-brand-tap
    content: 在 login.wxml 的 auth-brand 元素添加 bindtap 事件
    status: completed
  - id: add-super-admin-modal
    content: 添加超级管理员登录弹窗 UI（用户名、密码输入框）
    status: completed
    dependencies:
      - add-auth-brand-tap
  - id: implement-tap-counter
    content: 在 login.js 实现10次点击计数和触发逻辑
    status: completed
  - id: implement-password-verify
    content: 实现密码生成和验证逻辑
    status: completed
    dependencies:
      - implement-tap-counter
  - id: fetch-pending-registrations
    content: 实现获取待审批用户注册申请列表
    status: completed
  - id: implement-batch-approval
    content: 实现逐条 showModal 确认和审批逻辑
    status: completed
    dependencies:
      - fetch-pending-registrations
---

## 产品概述

在登录页面添加隐藏的超级管理员入口，用于批量审批待批准的用户注册申请。

## 核心功能

- **触发入口**：点击登录页面左上角"登录"文字（auth-brand）10次触发超级管理员登录弹窗
- **身份验证**：弹窗输入用户名（999）和密码（今天日期+倒序之和，如20260324+42306202=62566526）
- **批量审批**：验证通过后逐条读取待批准的用户注册申请，每条显示确认弹窗
- **交互逻辑**：取消继续下一条，确认则调用工作流引擎审批通过后继续下一条

## 技术方案

### 1. 触发机制

在 login.wxml 的 `.auth-brand` 元素添加 bindtap 事件，JS 中维护点击计数器：

- 每次点击计数+1
- 3秒内未继续点击则重置计数
- 达到10次触发超级管理员弹窗

### 2. 密码验证逻辑

```javascript
// 密码 = 今天日期 + 今天日期倒序
// 示例：2026-03-24 → 20260324 + 42306202 = 62566526
function generateSuperPassword() {
  const today = new Date()
  const dateStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`
  const reversedDateStr = dateStr.split('').reverse().join('')
  return parseInt(dateStr) + parseInt(reversedDateStr)
}
```

### 3. 获取待审批用户注册申请

调用 officeAuth 云函数，查询 workflowOrders 集合：

- 条件：`orderType: 'user_registration'`, `workflowStatus: 'in_progress'`
- 关联 workflowTasks 获取 taskId

### 4. 审批流程

调用 workflowEngine 云函数的 `approveTask` action：

```javascript
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'approveTask',
    taskId: taskId,
    approveAction: 'approve',  // 或 'reject'
    comment: '超级管理员审批通过',
    operatorId: 'super_admin',
    operatorName: '超级管理员'
  }
})
```

### 修改文件

| 文件 | 修改内容 |
| --- | --- |
| `login.wxml` | auth-brand 添加 bindtap；添加超级管理员弹窗结构 |
| `login.js` | 添加点击计数、密码验证、获取待审批、逐条审批逻辑 |
| `login.wxss` | 超级管理员弹窗样式（可复用现有调试密码弹窗样式） |