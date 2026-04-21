# 项目编码规范（精简版）

## 概述

本文档规定项目编码标准，确保代码质量和一致性。

---

## 1. 数据库规范

### 1.1 集合命名规范

- 使用小写字母和下划线
- 使用复数形式（如 `work_orders`、`notifications`）
- 避免缩写

### 1.2 字段命名规范

- 使用驼峰命名法（camelCase）
- 布尔值使用 `is/has` 前缀（如 `isAdmin`、`hasPermission`）
- 时间戳字段使用 `At` 结尾（如 `createdAt`、`updatedAt`）

### 1.3 新增集合流程

1. 查阅 `DATABASE_COLLECTIONS_REFERENCE.md` 确认是否需要新集合
2. 在 `DATABASE_COLLECTIONS_REFERENCE.md` 中添加集合定义（包含安全规则和索引说明）
3. 通过 CloudBase 控制台或 MCP 工具创建集合、配置安全规则和索引

**安全规则和索引配置方式**：
- CloudBase 控制台：https://tcb.cloud.tencent.com
- MCP 工具：`writeSecurityRule`、`writeNoSqlDatabaseStructure`

### 1.4 安全规则配置

| aclTag | 说明 | 适用场景 |
|--------|------|---------|
| `ADMINONLY` | 仅管理员可读写 | 敏感数据（用户信息） |
| `ADMINWRITE` | 所有用户可读，仅管理员可写 | 配置数据 |
| `READONLY` | 所有用户可读，仅创建者可写 | 公开数据 |
| `PRIVATE` | 仅创建者可读写 | 个人数据 |

**重要经验**：`PRIVATE` 规则检查的是 `_openid` 字段（创建者），而非业务字段。云函数创建的数据不要使用 `PRIVATE`。

### 1.5 全局常量获取规范

所有全局常量在`cloudfunctions\initSystemConfig\index.js`中定义，前端通过 `app.js` 中带缓存机制的函数获取，**禁止直接调用云函数 `initSystemConfig` 或 `getSystemConfig`**。

#### 缓存机制

```
内存缓存 → 本地存储缓存 → 硬编码默认值（降级）
```

- 缓存在登录成功后由 `app.loadConstants()` 预加载
- 版本变化时自动清除缓存（`CACHE_VERSION`）

#### API 速查

| 方法 | 说明 | 是否异步 |
|------|------|---------|
| `app.getConstantSync(key)` | 同步获取单个常量（优先缓存，降级默认值） | 同步 |
| `app.getConstant(key)` | 异步获取单个常量（缓存未命中时请求云函数） | 异步 |
| `app.getAllConstants()` | 获取所有常量（带缓存） | 异步 |
| `app.getConstantsCache()` | 仅从缓存获取（不降级） | 同步 |
| `app.clearConstantsCache()` | 清除常量缓存 | 同步 |

#### 使用示例

```javascript
const app = getApp()

// ✅ 正确：同步获取（推荐，适用于页面 onLoad）
const ROLE_OPTIONS = app.getConstantSync('ROLE_OPTIONS')
const institutions = app.getConstantSync('MEDICAL_INSTITUTIONS')

// ✅ 正确：异步获取（缓存未命中时自动请求云函数）
const constants = await app.getAllConstants()

// ❌ 错误：直接调用云函数
const res = await wx.cloud.callFunction({
  name: 'initSystemConfig',
  data: { action: 'getConfig' }
})
```

#### 常量列表

常用常量键名定义在 `app.js` 的 `getDefaultConstants()` 中：

| 常量键名 | 说明 |
|---------|------|
| `ROLE_OPTIONS` | 角色选项 |
| `RELATION_OPTIONS` | 与申请人关系选项 |
| `MEDICAL_INSTITUTIONS` | 就医机构列表 |
| `NOTIFICATION_TYPES` | 消息类型 |
| `NOTIFICATION_TARGET_TAB` | 消息跳转映射 |
| 其他 | 见 `app.js` → `getDefaultConstants()` |

---

## 2. 云函数规范

### 2.1 代码结构

```javascript
const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()

// 集合引用（集中定义）
const workOrdersCollection = db.collection('work_orders')

// 统一返回格式
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}
function fail(message, code) {
  return { code: code || 500, message: message || '服务异常', data: null }
}

exports.main = async (event, context) => {
  const { action, params } = event
  try {
    // 业务逻辑
    return success(result)
  } catch (error) {
    console.error('操作失败:', error)
    return fail(error.message)
  }
}
```

### 2.2 错误码规范

| 错误码 | 含义 |
|--------|------|
| 0 | 成功 |
| 400 | 参数错误 |
| 401 | 未授权 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

### 2.3 部署流程

1. 修改云函数代码后保存
2. 在微信开发者工具中右键云函数 → "上传并部署：云端安装依赖"
3. 在控制台测试验证

---

## 3. 前端代码规范

### 3.1 页面结构

每个页面包含 4 个文件：`.js`、`.json`、`.wxml`、`.wxss`

### 3.2 事件处理

- 函数以 `handle` 开头（如 `handleSubmit`）
- 使用 `data-*` 传递参数

```javascript
// WXML
<button bindtap="handleSubmit" data-id="{{item.id}}">提交</button>

// JS
handleSubmit(e) {
  const id = e.currentTarget.dataset.id
  // ...
}
```

### 3.3 错误处理

```javascript
async callCloudFunction(name, data) {
  try {
    const result = await wx.cloud.callFunction({ name, data })
    if (result.result.code !== 0) {
      throw new Error(result.result.message)
    }
    return result.result.data
  } catch (error) {
    wx.showToast({ title: error.message, icon: 'none' })
    throw error
  }
}
```

---

## 4. UI设计规范

### 4.1 列表页面

参照 `miniprogram/pages/office/menu-list/menu-list` 页面：
- 渐变色头部
- 卡片式布局
- 筛选/过滤功能

### 4.2 表单页面

参照 `miniprogram/pages/office/menu-create/menu-create` 页面：
- 渐变色头部
- 卡片式表单分组
- 必填项标识
- 表单验证

---

## 5. 分页加载规范

所有列表页面必须使用分页加载。

### 5.1 页面配置

```json
{
  "enablePullDownRefresh": true,
  "onReachBottomDistance": 50
}
```

### 5.2 实现模板

```javascript
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    listData: [],
    page: 1,
    pageSize: 15,
    hasMore: true,
    loading: false
  },

  onLoad() {
    this.loadListData()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadListData()
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadListData().then(() => wx.stopPullDownRefresh())
  },

  async loadData(params) {
    const { page, pageSize } = params
    const result = await wx.cloud.callFunction({
      name: 'example',
      data: { action: 'list', page, pageSize }
    })
    return {
      data: result.result.data.list,
      hasMore: result.result.data.hasMore
    }
  }
})
```

### 5.3 Tab切换加载

切换 Tab 时：先清空列表 → 显示 loading → 重置分页 → 加载数据

---

## 6. 权限控制规范

### 6.1 新增功能权限配置

1. 通过 `permissionManager` 云函数添加权限记录
2. 前端使用 `app.checkPermission()` 检查权限

```javascript
// 配置权限
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'updatePermission',
    featureKey: 'medical_application',
    config: {
      featureName: '就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员'],
      requireAdmin: false
    }
  }
})

// 检查权限
app.checkPermission('medical_application').then(hasPermission => {
  if (!hasPermission) {
    wx.showModal({ title: '提示', content: '无权限' })
  }
})
```

### 6.2 用户信息获取规范

获取用户信息（包括权限判断）**必须使用 `app.checkUserRegistration()`**，禁止直接查询数据库。

**原因**：
- `app.checkUserRegistration()` 内置缓存机制，缓存有效期内不查询数据库
- 避免重复请求，提升性能

**使用示例**：
```javascript
// ✅ 正确：使用 app.checkUserRegistration()
checkSomePermission() {
  return app.checkUserRegistration().then((result) => {
    if (result.registered && result.user) {
      const user = result.user
      const isAdmin = user.isAdmin || user.role === 'admin'
      // 权限判断...
    }
  }).catch(() => {
    // 静默失败
  })
}

// ❌ 错误：直接查询数据库
const userRes = await db.collection('users').where({ openid }).get()
```

**缓存机制说明**：
- 缓存有效期：见 `app.js` 中 `USER_CACHE_EXPIRE` 配置
- 强制刷新：`app.checkUserRegistration({ forceRefresh: true })`

**完整示例**（参考 `calendar.js`）：
```javascript
// 1. 定义权限角色常量
const CONFIG_HOLIDAY_ALLOWED_ROLES = ['admin', '会计', '会计主管']
const SCHEDULE_ALLOWED_POSITIONS = ['礼宾']

// 2. 在 data 中定义权限状态
data: {
  currentUser: null,
  canConfigHoliday: false,
  canManageSchedule: false
}

// 3. 页面加载时检查权限（利用缓存）
async onLoad() {
  await this.checkConfigHolidayPermission()
  await this.checkManageSchedulePermission()
}

// 4. 权限检查方法
checkManageSchedulePermission() {
  return app.checkUserRegistration().then((result) => {
    if (result.registered && result.user) {
      const user = result.user
      const isAdmin = user.isAdmin || user.role === 'admin'
      const canManageSchedule = isAdmin || SCHEDULE_ALLOWED_POSITIONS.includes(user.position)
      this.setData({ currentUser: user, canManageSchedule })
    }
  }).catch(() => {})
}

// 5. 操作前检查权限
handleAddSchedule() {
  if (!this.data.canManageSchedule) {
    wx.showModal({ title: '权限提示', content: '您没有权限执行此操作' })
    return
  }
  // 业务逻辑...
}
```

---

## 7. 工作流规范

### 7.1 工作流模板初始化

在 `app.js` 的 `onLaunch` 中调用 `initWorkflowTemplates()` 自动初始化。

### 7.2 工作流操作

使用 `workflowEngine` 云函数：

| Action | 说明 |
|--------|------|
| `submitOrder` | 提交工单 |
| `getMyTasks` | 查询待办 |
| `approveTask` | 审批任务 |
| `getOrderDetail` | 查询工单详情 |

### 7.3 动态渲染

卡片和详情页使用 `displayConfig` 动态配置字段，禁止硬编码。

```javascript
// displayConfig 结构
{
  cardFields: [
    { field: 'patientName', label: '就医人' }
  ],
  detailFields: [
    { field: 'patientName', label: '就医人姓名' },
    { field: 'institution', label: '就医机构' },
    { field: 'otherInstitution', label: '机构名称', condition: { field: 'institution', value: '其他' } }
  ]
}
```

---

## 8. 时间处理规范

### 8.1 核心原则

| 端 | 规则 |
|----|------|
| 后端 | 只存储/返回 GMT 时间戳（`Date.now()`） |
| 前端 | 使用 `common/utils.js` 格式化时间 |

### 8.2 工具函数

```javascript
const utils = require('../../../common/utils.js')

// 常用函数
utils.formatDateTime(timestamp)      // YYYY-MM-DD HH:mm:ss
utils.formatDate(timestamp)          // YYYY-MM-DD
utils.formatRelativeTime(timestamp)  // "5分钟前"
utils.getTodayDate()                 // YYYY-MM-DD
utils.getLocalDateString()           // 本地日期字符串（用于日期选择器默认值）

// ⚠️ 纯日期字符串解析（重要！）
utils.parseLocalDate(dateStr)        // 手动解析纯日期字符串，避免时区陷阱
utils.formatDateObj(date)            // 将 Date 对象格式化为 YYYY-MM-DD
```

### 8.3 JavaScript 时区陷阱（必读）

**问题根源**：

```javascript
// ❌ 错误：纯日期字符串会被解析为 UTC 午夜
const date = new Date('2026-03-23')
// 在 UTC-3（圣保罗）时区：
// - UTC 时间：2026-03-23 00:00:00
// - 本地时间：2026-03-22 21:00:00（前一天晚上！）
console.log(date.getDate())  // 返回 22，而非 23！
```

**问题场景复现**：

```
用户选择: 2026-03-23（节假日配置）
      ↓
存储为: "2026-03-23"
      ↓
错误解析: new Date('2026-03-23') → UTC 00:00
      ↓
UTC-3 时区转换: 2026-03-22 21:00
      ↓
日历显示: 3月22日 ← 错误！应该是3月23日
```

### 8.4 纯日期字符串解析规范

**强制使用 `parseLocalDate` 函数**：

```javascript
// ✅ 正确：使用工具函数解析纯日期字符串
const date = utils.parseLocalDate('2026-03-23')
console.log(date.getDate())  // 总是返回 23，不受时区影响

// ✅ 正确：日期遍历循环
const start = utils.parseLocalDate(startDate)
const end = utils.parseLocalDate(endDate)
const current = new Date(start)
while (current <= end) {
  const dateStr = utils.formatDateObj(current)  // 格式化为 YYYY-MM-DD
  // 处理逻辑...
  current.setDate(current.getDate() + 1)
}

// ❌ 错误：直接解析纯日期字符串
const wrongDate = new Date('2026-03-23')  // 会导致时区偏移
```

### 8.5 各场景规范速查表

| 场景 | 正确做法 | 错误做法 |
|------|---------|---------|
| 获取今日日期字符串 | `utils.getLocalDateString()` | `new Date().toISOString().split('T')[0]` |
| 解析纯日期字符串 | `utils.parseLocalDate(dateStr)` | `new Date('YYYY-MM-DD')` |
| Date 对象转日期字符串 | `utils.formatDateObj(date)` | 手动拼接 `${year}-${month}-${day}` |
| 日期选择器默认值 | `utils.getLocalDateString()` | 直接使用时间戳转换 |
| 遍历日期范围 | `utils.parseLocalDate()` + 循环 | `new Date(startDate)` |
| 获取当前时间戳 | `utils.now()` 或 `Date.now()` | `new Date().getTime()` |

### 8.6 工具函数详解

**`parseLocalDate(dateStr)`** - 纯日期字符串解析

- 支持格式：`YYYY-MM-DD`、`YYYY/MM/DD`、`YYYY.MM.DD`
- 返回值：本地时间 Date 对象
- 特点：在任何时区都能正确解析日期

```javascript
// 使用示例
const date1 = utils.parseLocalDate('2026-03-23')
const date2 = utils.parseLocalDate('2026/03/23')
const date3 = utils.parseLocalDate('2026.03.23')
// 三种格式返回相同的本地日期
```

**`formatDateObj(date)`** - Date 对象格式化

- 输入：Date 对象
- 输出：`YYYY-MM-DD` 格式字符串
- 用途：日期遍历循环中生成日期字符串

```javascript
// 使用示例
const date = new Date(2026, 2, 23)  // 3月23日
const dateStr = utils.formatDateObj(date)  // '2026-03-23'
```

**`parseDateParts(dateStr)`** - 解析日期为数字对象

- 输入：日期字符串 `YYYY-MM-DD`
- 输出：`{ year, month, day }` 数字对象
- 用途：传递给第三方日历组件

---

## 8.7 第三方日历组件时间处理范式（@lspriv/wx-calendar）

### 问题根源

第三方库 `@lspriv/wx-calendar` 在解析 `marks` 中的 `date` 字段时，使用了 `new Date(dateString)`，导致时区偏移：

```javascript
// ❌ 错误：使用 date 字符串字段
marks: [{
  date: '2026-03-23',  // 组件内部: new Date('2026-03-23') → UTC 午夜 → 时区偏移
  type: 'corner',
  text: '休'
}]

// 在 UTC-3 时区：
// - UTC 时间：2026-03-23 00:00:00
// - 本地时间：2026-03-22 21:00:00（前一天晚上！）
// - 日历显示：3月22日 ← 错误！
```

### 正确做法

使用 `year/month/day` 数字字段，绕过字符串解析问题：

```javascript
// ✅ 正确：使用 year/month/day 数字字段
const { year, month, day } = utils.parseDateParts('2026-03-23')

marks: [{
  year: 2026,    // 数字
  month: 3,      // 数字（1-12）
  day: 23,       // 数字
  type: 'corner',
  text: '休'
}]
// 组件内部: new Date(2026, 2, 23) → 本地时间构造 → 无时区问题
```

### 速查表

| 传递方式 | 第三方库处理 | 结果 |
|---------|-------------|------|
| `{date: '2026-03-23'}` | `new Date('2026-03-23')` → UTC 午夜 | ❌ 时区偏移 |
| `{year: 2026, month: 3, day: 23}` | `new Date(2026, 2, 23)` → 本地时间 | ✅ 正确日期 |

### 工具函数

```javascript
// 使用 parseDateParts 解析日期字符串
const { year, month, day } = utils.parseDateParts('2026-03-23')

// 构建标记对象
marks.push({
  year, month, day,  // 使用数字字段
  type: 'corner',
  text: '休',
  style: { color: '#16A34A' }
})
```

---

## 9. 消息中心规范

### 9.1 消息类型常量

在 `initSystemConfig` 云函数中定义：

```javascript
{
  key: 'NOTIFICATION_TYPES',
  value: {
    MENU: 'menu',
    TASK_ASSIGNED: 'task_assigned',
    TASK_COMPLETED: 'task_completed',
    WORKFLOW_COMPLETED: 'workflow_completed',
    PROCESS_RETURNED: 'process_returned'
  }
}
```

### 9.2 消息跳转映射

```javascript
{
  key: 'NOTIFICATION_TARGET_TAB',
  value: {
    task_assigned: 'pending',      // → 待审批
    task_completed: 'mine',        // → 我的发起
    workflow_completed: 'mine',    // → 我的发起
    process_returned: 'mine'       // → 我的发起
  }
}
```

### 9.3 跳转实现

通过 `app.globalData.targetApprovalTab` 传递目标 tab：

```javascript
// 消息点击
app.globalData.targetApprovalTab = 'pending'
wx.switchTab({ url: '/pages/office/approval/approval' })

// 审批中心 onShow
const targetTab = app.globalData.targetApprovalTab
if (targetTab) {
  app.globalData.targetApprovalTab = null
  this.setData({ activeTab: targetTab })
}
```

---

## 10. MCP工具使用规范

### 10.1 核心原则

数据库和云函数操作优先使用 MCP 工具，禁止让用户手动操作控制台。

### 10.2 工具选择

| 操作类型 | MCP工具 |
|---------|--------|
| NoSQL数据库 | `readNoSqlDatabaseStructure`、`writeNoSqlDatabaseContent` |
| MySQL数据库 | `executeReadOnlySQL`、`executeWriteSQL` |
| 云函数 | `createFunction`、`updateFunctionCode`、`invokeFunction` |
| 云存储 | `queryStorage`、`manageStorage` |

### 10.3 调用流程

```javascript
// 1. 先获取工具描述
await mcp_get_tool_description({
  toolRequests: JSON.stringify([["CloudBase MCP", "writeNoSqlDatabaseContent"]])
})

// 2. 再执行工具
await mcp_call_tool({
  serverName: "CloudBase MCP",
  toolName: "writeNoSqlDatabaseContent",
  arguments: JSON.stringify({ /* 参数 */ })
})
```

---

## 11. 文件操作规范

### 11.1 专用工具优先

| 操作 | 工具 |
|------|------|
| 创建文件 | `write_to_file`（自动创建目录） |
| 读取文件 | `read_file` |
| 删除文件 | `delete_file` |
| 搜索文件 | `search_file`、`search_content` |

### 11.2 execute_command 限制

- ✅ 支持简单命令：`mkdir`、`rmdir`、`del`
- ❌ 禁止：链式命令、切换目录、重定向、PowerShell 特定命令

---

## 12. 路径引用规范

创建新页面时正确计算相对路径：

```
../ 的数量 = (当前页面深度 - 1) + (目标文件深度)
```

| 当前文件 | 引用文件 | 路径 |
|---------|---------|------|
| `pages/auth/register/register.js` | `util/util.js` | `../../../../util/util.js` |
| `pages/office/home/home.js` | `common/utils.js` | `../../../common/utils.js` |

---

## 检查清单

### 数据库
- [ ] 集合名称正确（参考 `DATABASE_COLLECTIONS_REFERENCE.md`）
- [ ] 字段命名符合驼峰规范
- [ ] 安全规则配置正确
- [ ] 索引已创建

### 云函数
- [ ] 集合引用集中定义
- [ ] 统一错误处理
- [ ] 部署后测试验证

### 前端
- [ ] 列表页使用分页加载
- [ ] UI 参照标准页面
- [ ] 权限检查逻辑完善
- [ ] 错误处理友好

### 工作流
- [ ] 模板已初始化
- [ ] `displayConfig` 配置正确

---

## CloudBase 官方规则索引（小程序项目专用）

> CloudBase MCP 工具提供的官方规则框架位于 `.codebuddy/rules/tcb/`
> 以下标注当前小程序项目需要参考的规则文件

### ✅ 适用规则（必读）

| 规则文件 | 大小 | 用途 |
|----------|------|------|
| `miniprogram-development/rule.md` | 8.3KB | 小程序开发核心规范 |
| `auth-wechat/rule.md` | 11.8KB | 小程序认证（免登录） |
| `no-sql-wx-mp-sdk/rule.md` | 2.1KB | NoSQL 数据库 SDK |
| `cloud-functions/rule.md` | 12.5KB | 云函数开发部署 |
| `cloudbase-platform/rule.md` | 12.5KB | CloudBase 平台通用知识 |
| `ui-design/rule.md` | 12.3KB | UI 设计规范 |
| `relational-database-tool/rule.md` | 5.4KB | MySQL 数据库工具 |
| `auth-nodejs/rule.md` | 14.8KB | 云函数中认证操作 |
| `ai-model-wechat/rule.md` | 5.7KB | 小程序 AI 调用 |
| `ai-model-nodejs/rule.md` | 6.8KB | 云函数 AI 调用 |

### ⚠️ 可选规则（按需参考）

| 规则文件 | 大小 | 用途 |
|----------|------|------|
| `http-api/rule.md` | 17.8KB | HTTP API（小程序一般用 SDK） |
| `data-model-creation/rule.md` | 13.1KB | 复杂数据建模 |
| `auth-tool/rule.md` | 5.6KB | MCP 认证配置工具 |
| `ai-model-cloudbase/rule.md` | 11.4KB | AI 模型通用指南 |
| `spec-workflow/rule.md` | 5.3KB | 需求分析工作流 |

### ❌ 不适用规则（Web/原生App专用）

| 规则文件 | 大小 | 原因 |
|----------|------|------|
| `web-development/rule.md` | 5.6KB | Web 前端开发 |
| `auth-web/rule.md` | 7.4KB | Web 认证 |
| `auth-http-api/rule.md` | 6KB | 原生 App 认证 |
| `no-sql-web-sdk/rule.md` | 6.4KB | Web NoSQL SDK |
| `cloud-storage-web/rule.md` | 9KB | Web 云存储 |
| `cloudrun-development/rule.md` | 13.1KB | 容器化部署 |
| `ai-model-web/rule.md` | 4.8KB | Web AI 调用 |
| `relational-database-web/rule.md` | 3.9KB | Web MySQL |

---

## 13. 弹窗动画规范

### 13.1 核心原则

**所有弹窗关闭时必须有退出动画**，禁止直接 `setData({ showXxx: false })` 瞬间消失。

### 13.2 实现方案

采用 `_closeModal()` + `modalAnimating` 状态 + CSS `.is-closing` 类模式：

1. 关闭弹窗时先设 `modalAnimating: true`，触发 CSS 退出动画
2. 250ms 后再设弹窗变量 `false` + `modalAnimating: false`，真正隐藏 DOM
3. 使用 `behaviors/modalAnimation.js` 统一提供 `_closeModal()` 方法

### 13.3 JS 规范

```javascript
// 1. 引入 behavior
const modalAnimation = require('../../../behaviors/modalAnimation.js')

Page({
  behaviors: [modalAnimation],

  // 2. 关闭弹窗改用 _closeModal
  hideFormPopup() {
    this._closeModal('showFormPopup')
  },

  hideDetailPopup() {
    this._closeModal('showDetailPopup', () => {
      // 动画结束后的数据清理
      this.setData({ selectedRecord: null })
    })
  },

  // 3. 提交成功后也走动画关闭
  handleSubmit() {
    // ... 业务逻辑
    this._closeModal('showFormPopup')
  }
})
```

### 13.4 WXML 规范

遮罩层添加 `is-closing` 条件类：

```xml
<!-- 退出动画遮罩 -->
<view class="xxx-mask {{modalAnimating ? 'is-closing' : ''}}" catchtap="hideXxx">
  <view class="xxx-container" catchtap="stopPropagation">
    <!-- 弹窗内容 -->
  </view>
</view>
```

**关键点**：
- 遮罩使用 `catchtap` 绑定关闭方法
- 弹窗内容区使用 `catchtap="stopPropagation"` 阻止冒泡
- 不要用 `wx:if` 控制遮罩显示/隐藏（除非有特殊性能需求），否则退出动画期间 DOM 会被提前移除

### 13.5 WXSS 规范

```css
/* 遮罩 - 入场 */
.xxx-mask {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
  animation: fadeIn 0.2s ease;
}

/* 遮罩 - 退出动画 */
.xxx-mask.is-closing {
  animation: fadeOut 0.25s ease forwards;
}

/* 弹窗容器 - 入场 */
.xxx-container {
  animation: slideUp 0.3s cubic-bezier(0.25, 0.1, 0.25, 1);
}

/* 弹窗容器 - 退出动画 */
.is-closing .xxx-container {
  animation: slideDown 0.25s cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
}

/* 关键帧 */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
```

### 13.6 动画时长标准

| 阶段 | 遮罩 | 弹窗 |
|------|------|------|
| 入场 | fadeIn 0.2s | slideUp 0.3s |
| 退出 | fadeOut 0.25s | slideDown 0.25s |

### 13.7 参考实现

- `meal-management` 页面：5 个弹窗，使用 `modal-closing` + `@keyframes` 方案
- `arrival-guide` 页面：1 个弹窗，使用 `transition` + `popupAnimating` 方案（DOM 常驻模式）

---

## 参考文档

1. `DATABASE_COLLECTIONS_REFERENCE.md` - 数据库集合参考
2. `cloudfunctions/initSystemConfig/index.js` - 常量定义
