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
2. 在 `cloudfunctions/initDatabase/index.js` 的 `REQUIRED_COLLECTIONS` 数组中添加定义
3. 配置安全规则（aclTag）和索引
4. 更新 `DATABASE_COLLECTIONS_REFERENCE.md` 文档

**集合定义示例**：
```javascript
const REQUIRED_COLLECTIONS = [
  {
    name: 'my_collection',
    description: '集合描述',
    aclTag: 'PRIVATE',  // ADMINONLY | ADMINWRITE | READONLY | PRIVATE
    indexes: [
      { name: 'idx_createdAt', keys: [{ name: 'createdAt', direction: '-1' }] }
    ],
    initialData: null
  }
]
```

### 1.4 安全规则配置

| aclTag | 说明 | 适用场景 |
|--------|------|---------|
| `ADMINONLY` | 仅管理员可读写 | 敏感数据（用户信息） |
| `ADMINWRITE` | 所有用户可读，仅管理员可写 | 配置数据 |
| `READONLY` | 所有用户可读，仅创建者可写 | 公开数据 |
| `PRIVATE` | 仅创建者可读写 | 个人数据 |

**重要经验**：`PRIVATE` 规则检查的是 `_openid` 字段（创建者），而非业务字段。云函数创建的数据不要使用 `PRIVATE`。

### 1.5 常量统一管理

所有常量在 `cloudfunctions/initSystemConfig/index.js` 中定义，前端通过 `common/constants.js` 获取。

```javascript
// 定义常量
{
  type: 'role',
  key: 'ROLE_OPTIONS',
  value: ['馆领导', '部门负责人', '馆员'],
  description: '角色选项列表'
}

// 前端获取
const constants = require('../../../common/constants.js')
const roleOptions = await constants.getConstant('ROLE_OPTIONS')
```

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

## 参考文档

1. `DATABASE_COLLECTIONS_REFERENCE.md` - 数据库集合参考
2. `cloudfunctions/initDatabase/index.js` - 集合定义
3. `cloudfunctions/initSystemConfig/index.js` - 常量定义
