# 项目编码规范

## 概述

本文档规定了项目的编码标准和最佳实践，确保代码质量和一致性。

**重要**：所有开发人员必须严格遵循本规范！

---

## 1. 数据库相关规范

### 1.1 必须参考集合参考文档

**规则**：任何涉及数据库集合的操作，必须先参考 `DATABASE_COLLECTIONS_REFERENCE.md` 文档。

**强制流程**：
1. 查找 `.codebuddy/DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认需要操作的集合名称
3. 确认集合的字段结构
4. 确认集合的索引
5. 如果集合不存在，参考"新增集合流程"

**违规示例**：
```javascript
// ❌ 错误：未参考文档直接编写
const collection = db.collection('workflow_orders')  // 错误的集合名

// ✅ 正确：参考文档后使用正确的集合名
const collection = db.collection('work_orders')
```

### 1.2 集合命名规范

**规则**：
- 使用小写字母和下划线
- 使用复数形式
- 避免缩写
- 保持同一模块使用相同前缀

**示例**：
```javascript
// ✅ 正确
work_orders                // 工作订单
notifications             // 通知
workflow_templates         // 工作流模板
office_users              // 办公用户
announcements             // 通知公告

// ❌ 错误
workflowOrders            // 驼峰命名
workOrder                // 单数形式
wf_tmpls                 // 缩写
```

### 1.3 字段命名规范

**规则**：
- 使用驼峰命名法（camelCase）
- 使用有意义的名称
- 布尔值使用 is/has 前缀
- 时间戳字段使用 At 结尾

**示例**：
```javascript
// ✅ 正确
{
  createdAt: 1234567890,
  updatedAt: 1234567890,
  publisherName: '张三',
  isAdmin: true,
  hasPermission: false,
  needSupplement: false
}

// ❌ 错误
{
  created_at: 1234567890,        // 蛇形命名
  publisher_name: '张三',        // 蛇形命名
  admin: true,                     // 缺少 is 前缀
  supplement: false                // 缺少 has 前缀
}
```

### 1.4 新增集合流程

**步骤**：
1. 查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认确实需要新集合
3. 确认没有相似用途的现有集合
4. 遵循命名规范设计集合名称
5. 定义完整的字段结构
6. 添加到 `DATABASE_COLLECTIONS_REFERENCE.md` 文档
7. **在 `initDatabase` 云函数中添加新集合定义**
8. 在代码中创建并使用

**重要**：新增集合时，必须在 `cloudfunctions/initDatabase/index.js` 的 `REQUIRED_COLLECTIONS` 数组中添加新集合定义，确保集合自动初始化。

**示例**：
```javascript
// 1. 先在文档中定义（DATABASE_COLLECTIONS_REFERENCE.md）
/*
 * my_new_collection - 我的新集合
 * 用途：存储新功能数据
 * 字段结构：
 * {
 *   _id: String,
 *   name: String,
 *   createdAt: Number
 * }
 */

// 2. 在 initDatabase 云函数中添加集合定义
// cloudfunctions/initDatabase/index.js
const REQUIRED_COLLECTIONS = [
  // ... 现有集合 ...
  {
    name: 'my_new_collection',
    description: '我的新集合',
    initialData: null // 或初始数据数组
  }
]

// 3. 在代码中使用
const db = wx.cloud.database()
await db.collection('my_new_collection').add({
  data: {
    name: '测试',
    createdAt: Date.now()
  }
})
```

### 1.5 数据库集合初始化规范

**规则**：所有数据库集合必须通过 `initDatabase` 云函数统一初始化。

**强制要求**：
- 程序启动时，`initDatabase` 云函数最先执行
- 所有新增集合必须添加到 `initDatabase` 云函数中
- 禁止在代码中手动创建集合，统一通过云函数自动创建
- 集合不存在时，云函数会自动创建
- **所有集合必须配置安全规则（aclTag）**

**初始化顺序**：
```
1. initDatabase（数据库集合初始化）
   ↓
2. initSystemConfig（系统配置初始化）
   ↓
3. initWorkflowDB（工作流模板初始化）
```

**initDatabase 云函数结构**：
```javascript
// cloudfunctions/initDatabase/index.js

const REQUIRED_COLLECTIONS = [
  // ==================== 用户相关 ====================
  {
    name: 'office_users',
    description: '办公系统用户',
    aclTag: 'ADMINONLY', // 仅管理员可读写
    initialData: null
  },
  {
    name: 'office_registration_requests',
    description: '用户注册请求',
    aclTag: 'READONLY', // 所有用户可读，仅创建者可写
    initialData: null
  },

  // ==================== 系统配置 ====================
  {
    name: 'sys_config',
    description: '系统配置（常量）',
    aclTag: 'READONLY', // 所有用户可读，仅创建者可写
    initialData: null
  },

  // ... 其他集合 ...

  // ==================== 新增集合示例 ====================
  // {
  //   name: 'new_collection_name',
  //   description: '集合描述',
  //   aclTag: 'PRIVATE', // 安全规则
  //   initialData: null // 或 [{ name: '初始数据1' }, { name: '初始数据2' }]
  // }
]
```

**检查清单**：
- [ ] 新增集合是否已添加到 `REQUIRED_COLLECTIONS` 数组
- [ ] 集合名称是否与 `DATABASE_COLLECTIONS_REFERENCE.md` 一致
- [ ] 是否设置了正确的 `description`
- [ ] 是否配置了正确的 `aclTag`（安全规则）
- [ ] 是否需要初始数据（`initialData`）
- [ ] 是否已更新 `DATABASE_COLLECTIONS_REFERENCE.md` 文档
- [ ] 是否已使用 MCP 工具设置安全规则

### 1.5.1 数据库安全规则配置规范

**规则**：所有数据库集合必须配置安全规则，确保数据安全。

**安全规则类别**：

| aclTag | 名称 | 说明 | 适用场景 |
|--------|------|------|---------|
| `ADMINONLY` | 仅管理员可读写 | 只有管理员可以读取和写入数据 | 敏感数据（用户信息） |
| `ADMINWRITE` | 管理员可写 | 所有用户可读，仅管理员可写 | 配置数据（权限、评论） |
| `READONLY` | 只读 | 所有用户可读，仅创建者可写 | 公开数据（菜单、通知） |
| `PRIVATE` | 私有 | 仅创建者可读写 | 个人数据（工单、任务） |
| `CUSTOM` | 自定义 | 使用自定义安全规则 | 复杂权限场景 |

**配置流程**：

1. **在 `initDatabase` 云函数中定义**：
```javascript
const REQUIRED_COLLECTIONS = [
  {
    name: 'my_collection',
    description: '我的集合',
    aclTag: 'PRIVATE',
    initialData: null
  }
]
```

2. **更新 `DATABASE_COLLECTIONS_REFERENCE.md` 文档**：
```markdown
### my_collection - 我的集合

**用途**：存储我的数据

**安全规则**：`PRIVATE` - 仅创建者可读写

**字段结构**：...
```

3. **使用 MCP 工具设置安全规则**：
```javascript
// AI 助手会自动调用 MCP 工具设置安全规则
mcp_call_tool({
  serverName: "CloudBase MCP",
  toolName: "writeSecurityRule",
  arguments: {
    resourceType: "noSqlDatabase",
    resourceId: "my_collection",
    aclTag: "PRIVATE"
  }
})
```

**当前项目安全规则配置**：

| 集合名 | aclTag | 说明 |
|--------|--------|------|
| office_users | ADMINONLY | 仅管理员可读写（敏感用户数据） |
| office_registration_requests | READONLY | 所有用户可读，仅创建者可写 |
| permissions | ADMINWRITE | 所有用户可读，仅管理员可写 |
| sys_config | READONLY | 所有用户可读，仅创建者可写 |
| announcements | ADMINWRITE | 所有用户可读，仅管理员可写（公告需全员可见） |
| notifications | READONLY | 所有用户可读，仅创建者可写（云函数创建，前端按 openid 过滤） |
| menus | ADMINWRITE | 所有用户可读，仅管理员可写（菜单需全员可见） |
| menu_comments | ADMINWRITE | 所有用户可读，仅管理员可写 |
| workflow_templates | ADMINWRITE | 所有用户可读，仅管理员可写（用户需查询模板提交工单） |
| work_orders | ADMINWRITE | 所有用户可读，仅管理员可写（云函数创建，前端按 initiatorId 过滤） |
| workflow_tasks | ADMINWRITE | 所有用户可读，仅管理员可写（云函数创建，前端按 approverId 过滤） |
| workflow_logs | ADMINWRITE | 所有用户可读，仅管理员可写（用户需查看审批历史） |

### 1.5.1.1 安全规则配置重要经验

**核心原则：`PRIVATE` 规则检查的是 `_openid` 字段（创建者），而非业务字段**

**常见错误场景**：

当集合数据由**云函数**创建时，记录的 `_openid` 是云函数的标识，而不是实际用户。此时使用 `PRIVATE` 规则会导致：

1. **notifications 集合**：云函数创建通知，`openid` 字段存储接收者
   - ❌ `PRIVATE`：用户无法看到自己的通知（`_openid` 是云函数）
   - ✅ `READONLY`：用户可读所有，前端按 `openid` 字段过滤

2. **workflow_tasks 集合**：云函数创建任务，`approverId` 存储审批人
   - ❌ `PRIVATE`：审批人无法看到分配给自己的任务
   - ✅ `ADMINWRITE`：用户可读所有，前端按 `approverId` 过滤

3. **work_orders 集合**：云函数创建工单，`initiatorId` 存储申请人
   - ❌ `PRIVATE`：申请人无法看到自己的工单
   - ✅ `ADMINWRITE`：用户可读所有，前端按 `initiatorId` 过滤

4. **workflow_templates 集合**：用户提交工单时需查询模板
   - ❌ `PRIVATE`：用户无法查询模板，提交工单失败
   - ✅ `ADMINWRITE`：用户可读取模板列表

**正确配置流程**：

```
1. 确定数据创建者：用户直接创建 → PRIVATE；云函数创建 → ADMINWRITE/READONLY
2. 确定读取需求：全员可见 → ADMINWRITE；仅相关人可见 → 前端过滤
3. 敏感数据：如用户个人信息 → ADMINONLY
```

**配置检查清单**：
- [ ] 集合数据是由用户创建还是云函数创建？
- [ ] 如果是云函数创建，是否有业务字段标识相关用户？
- [ ] 前端是否正确过滤了数据？
- [ ] 敏感数据是否使用了 ADMINONLY 规则？

### 1.5.2 数据库索引配置规范

**规则**：所有数据库集合应根据查询模式配置合适的索引，提高查询效率。

**索引类型**：

| 索引类型 | 说明 | 适用场景 |
|----------|------|----------|
| 单字段索引 | 对单个字段建立索引 | 经常单独查询的字段 |
| 组合索引 | 对多个字段建立组合索引 | 经常同时查询多个字段 |
| 唯一索引 | 字段值必须唯一 | 工单编号、用户标识等 |

**索引设计原则**：

1. **根据查询创建索引**：索引应基于实际查询模式创建
2. **避免过度索引**：每个索引都会占用存储空间并影响写入性能
3. **组合索引顺序**：将等值查询的字段放在前面，范围查询的字段放在后面
4. **排序优化**：如果查询包含排序，考虑将排序字段加入索引

**配置流程**：

1. **在 `initDatabase` 云函数中定义**：
```javascript
const REQUIRED_COLLECTIONS = [
  {
    name: 'my_collection',
    description: '我的集合',
    aclTag: 'PRIVATE',
    indexes: [
      // 单字段索引
      { name: 'idx_status', keys: [{ name: 'status', direction: '1' }] },
      // 组合索引
      { name: 'idx_openid_createdAt', keys: [{ name: 'openid', direction: '1' }, { name: 'createdAt', direction: '-1' }] },
      // 唯一索引
      { name: 'idx_code', keys: [{ name: 'code', direction: '1' }], unique: true }
    ],
    initialData: null
  }
]
```

2. **更新 `DATABASE_COLLECTIONS_REFERENCE.md` 文档**：
```markdown
**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_status` - 状态索引
- `idx_openid_createdAt` - openid + 创建时间组合索引
```

3. **使用 MCP 工具创建索引**：
```javascript
// AI 助手会自动调用 MCP 工具创建索引
mcp_call_tool({
  serverName: "CloudBase MCP",
  toolName: "writeNoSqlDatabaseStructure",
  arguments: {
    action: "updateCollection",
    collectionName: "my_collection",
    updateOptions: {
      CreateIndexes: [
        {
          IndexName: "idx_openid_createdAt",
          MgoKeySchema: {
            MgoIsUnique: false,
            MgoIndexKeys: [
              { Name: "openid", Direction: "1" },
              { Name: "createdAt", Direction: "-1" }
            ]
          }
        }
      ]
    }
  }
})
```

**当前项目索引配置**：

| 集合名 | 索引列表 |
|--------|----------|
| notifications | `idx_openid_createdAt` (openid 升序 + createdAt 降序) - 优化消息列表查询 |
| menus | `idx_createdAt` (createdAt 降序) - 优化菜单列表查询 |
| menu_comments | `idx_menuId_createdAt` (menuId 升序 + createdAt 升序) - 优化菜单评论查询 |
| office_registration_requests | `status_updatedAt_idx`, `openid_idx` |
| work_orders | `idx_applicantId`, `idx_orderType`, `idx_status`, `idx_createTime`, `idx_updateTime` |
| workflow_tasks | `idx_approverId`, `idx_orderId`, `idx_status`, `idx_assignTime` |
| workflow_logs | `idx_orderId`, `idx_action`, `idx_operatorId`, `idx_operateTime` |
| workflow_templates | `idx_name_version` (唯一), `idx_status`, `idx_createTime` |

### 1.6 常量统一管理规范

**规则**：所有常量必须统一在 `initSystemConfig` 云函数中定义，禁止在代码中自行定义常量。

**强制要求**：
- 常量统一存储在 `sys_config` 数据库集合中
- 常量定义只能在 `cloudfunctions/initSystemConfig/index.js` 中
- 前端代码通过 `common/constants.js` 从数据库获取常量
- 禁止在前端代码中硬编码常量值

**常量定义位置**：
```javascript
// cloudfunctions/initSystemConfig/index.js

const SYSTEM_CONFIGS = [
  // ==================== 角色相关 ====================
  {
    type: 'role',
    key: 'ROLE_OPTIONS',
    value: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
    description: '角色选项列表',
    sort: 1
  },

  // ==================== 角色字段映射 ====================
  {
    type: 'role_field_mapping',
    key: 'ROLE_FIELD_VISIBILITY',
    value: {
      '馆领导': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '部门负责人': { showPosition: true, showDepartment: true, fixedDepartment: null },
      '馆员': { showPosition: true, showDepartment: true, fixedDepartment: null },
      '工勤': { showPosition: true, showDepartment: true, fixedDepartment: '办公室' },
      '物业': { showPosition: false, showDepartment: false, fixedDepartment: null },
      '配偶': { showPosition: true, showDepartment: false, fixedDepartment: null },
      '家属': { showPosition: false, showDepartment: false, fixedDepartment: null }
    },
    description: '角色-字段显示映射关系',
    sort: 30
  },

  // ... 其他常量 ...
]
```

**前端获取常量**：
```javascript
// miniprogram/pages/example/example.js
const constants = require('../../../common/constants.js')

Page({
  data: {
    roleOptions: []
  },

  async onLoad() {
    // 异步获取常量
    const roleOptions = await constants.getConstant('ROLE_OPTIONS')
    this.setData({ roleOptions })

    // 或同步获取（使用缓存/默认值）
    const roleOptions = constants.getConstantSync('ROLE_OPTIONS')
  }
})
```

**违规示例**：
```javascript
// ❌ 错误：在页面代码中硬编码常量
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员']
const MEDICAL_INSTITUTIONS = ['医院A', '医院B']

// ✅ 正确：从数据库获取常量
const constants = require('../../../common/constants.js')
const roleOptions = await constants.getConstant('ROLE_OPTIONS')
const medicalInstitutions = await constants.getConstant('MEDICAL_INSTITUTIONS')
```

**检查清单**：
- [ ] 新增常量是否已添加到 `initSystemConfig` 云函数
- [ ] 是否设置了正确的 `type`、`key`、`value`、`description`
- [ ] 是否已更新 `common/constants.js` 的默认值（降级方案）
- [ ] 前端代码是否使用 `constants.getConstant()` 获取常量

---

## 2. 云函数相关规范

### 2.1 必须先查阅参考文档

**规则**：编写云函数前，必须查阅以下文档：
1. `DATABASE_COLLECTIONS_REFERENCE.md` - 确认集合名称和结构
2. `CLOUD_FUNCTIONS_GUIDE.md` - 确认云函数开发规范

### 2.2 集合引用规范

**规则**：
- 在云函数开头集中定义所有集合引用
- 使用常量命名集合引用
- 使用描述性的变量名

**示例**：
```javascript
// ✅ 正确
const db = cloud.database()
const workOrdersCollection = db.collection('work_orders')
const workflowTemplatesCollection = db.collection('workflow_templates')
const announcementsCollection = db.collection('announcements')

// ❌ 错误
const db = cloud.database()
// 在函数中直接使用 db.collection('workflow_orders')  // 可能拼写错误
```

### 2.3 错误处理规范

**规则**：
- 统一的错误返回格式
- 明确的错误码和消息
- 详细的错误日志

**示例**：
```javascript
// ✅ 正确
function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

// 使用
try {
  // 业务逻辑
  return success(result, '操作成功')
} catch (error) {
  console.error('操作失败:', error)
  return fail(error.message || '操作失败', 500)
}
```

---

## 3. 前端代码规范

### 3.1 页面文件结构

**规则**：
- 每个页面包含 4 个文件：`.js`, `.json`, `.wxml`, `.wxss`
- 使用页面功能命名文件和目录
- 保持文件命名一致性

**示例**：
```
pages/
  office/
    announcement-list/
      announcement-list.js
      announcement-list.json
      announcement-list.wxml
      announcement-list.wxss
```

### 3.2 数据绑定规范

**规则**：
- 使用双大括号 `{{ }}` 绑定数据
- 复杂逻辑使用 computed 或 methods
- 避免在模板中写复杂逻辑

**示例**：
```javascript
// ✅ 正确
// JS 中
data: {
  userName: '张三',
  isUserAdmin: false
}

// WXML 中
<view>{{userName}}</view>
<view wx:if="{{isUserAdmin}}">管理员</view>

// ❌ 错误
<view>{{user.name}}</view>  // 复杂表达式
<view wx:if="{{user.role === 'admin'}}">管理员</view>  // 复杂条件
```

### 3.3 事件处理规范

**规则**：
- 事件处理函数以 handle 开头
- 使用 data-* 传递参数
- 统一的错误处理

**示例**：
```javascript
// ✅ 正确
// WXML
<button bindtap="handleSubmit" data-id="{{item.id}}">提交</button>

// JS
handleSubmit(e) {
  const id = e.currentTarget.dataset.id
  if (!id) {
    wx.showToast({ title: '参数错误', icon: 'none' })
    return
  }

  // 处理逻辑
}

// ❌ 错误
<button bindtap="submit(id)">提交</button>  // 直接传参不规范
```

---

## 4. UI设计规范

### 4.1 列表页面设计规范

**规则**：所有需要展示列表的页面UI必须参照"每周菜单"页面进行设计。

**强制要求**：
- 使用渐变色头部（gradient header）
- 使用卡片式布局展示列表项
- 每个列表项应包含图标、标题、描述等关键信息
- 提供筛选/过滤功能（如适用）
- 统一的间距和圆角样式
- 适配移动端响应式布局

**参考页面**：`miniprogram/pages/office/menu-list/menu-list`

**示例结构**：
```wxml
<view class="page-container">
  <view class="gradient-header">
    <view class="header-content">
      <text class="page-title">页面标题</text>
    </view>
  </view>

  <view class="filter-tabs">
    <view class="tab active">全部</view>
    <view class="tab">筛选项1</view>
    <view class="tab">筛选项2</view>
  </view>

  <view class="list-container">
    <view class="list-item" wx:for="{{listData}}" wx:key="id">
      <view class="item-icon">
        <image src="{{item.icon}}" />
      </view>
      <view class="item-content">
        <text class="item-title">{{item.title}}</text>
        <text class="item-desc">{{item.description}}</text>
      </view>
      <view class="item-arrow">
        <text>></text>
      </view>
    </view>
  </view>
</view>
```

### 4.2 表单页面设计规范

**规则**：所有涉及填写内容的页面UI必须参照"新增菜单"页面进行设计。

**强制要求**：
- 使用渐变色头部（gradient header）
- 使用卡片式表单布局
- 表单项分组展示，每组有清晰的标题
- 必填项有明确标识
- 统一的输入框样式和间距
- 合理的按钮布局（主按钮/次按钮）
- 表单验证和错误提示

**参考页面**：`miniprogram/pages/office/menu-create/menu-create`

**示例结构**：
```wxml
<view class="page-container">
  <view class="gradient-header">
    <view class="header-content">
      <text class="page-title">新增项目</text>
    </view>
  </view>

  <view class="form-container">
    <view class="form-group">
      <view class="group-title">基本信息</view>
      <view class="form-item">
        <text class="label">名称 <text class="required">*</text></text>
        <input class="input" placeholder="请输入名称" />
      </view>
      <view class="form-item">
        <text class="label">类型</text>
        <picker bindchange="handleTypeChange" range="{{typeOptions}}">
          <view class="picker">
            {{typeValue || '请选择类型'}}
          </view>
        </picker>
      </view>
    </view>
  </view>

  <view class="button-container">
    <button class="btn-submit" bindtap="handleSubmit">提交</button>
    <button class="btn-cancel" bindtap="handleCancel">取消</button>
  </view>
</view>
```

### 4.3 分页加载规范

**规则**：所有涉及查询数据库显示列表的页面，必须使用分页加载框架。

**强制要求**：
- 引入 `PaginationBehavior` behavior
- 定义分页参数（page, pageSize, hasMore）
- 实现上拉加载更多（onReachBottom）
- 实现下拉刷新（onPullDownRefresh）
- 显示加载状态（loading, noMore）
- 合理设置每页数据量（建议10-20条）

**实现示例**：
```javascript
// pages/example/example.js
const PaginationBehavior = require('../../behaviors/pagination')

Page({
  behaviors: [PaginationBehavior],

  data: {
    listData: [],
    // 分页相关
    page: 1,
    pageSize: 15,
    hasMore: true,
    loading: false,
    noMore: false
  },

  onLoad() {
    this.loadData()
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadData()
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      noMore: false
    })
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 加载数据
  async loadData() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const result = await db.collection('collection_name')
        .skip((this.data.page - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .get()

      const newData = result.data
      const isLoadMore = this.data.page > 1

      this.setData({
        listData: isLoadMore ? [...this.data.listData, ...newData] : newData,
        hasMore: newData.length >= this.data.pageSize,
        noMore: newData.length < this.data.pageSize,
        loading: false
      })
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  }
})
```

**配置文件**：
```json
// pages/example/example.json
{
  "enablePullDownRefresh": true,
  "onReachBottomDistance": 50
}
```

### 4.4 Tab切换加载规范

**规则**：所有带Tab切换的列表页面，必须使用统一的Tab切换加载逻辑。

**强制要求**：
- 切换Tab时先清空列表
- 设置loading状态
- 显示加载中toast（使用wx.showLoading）
- 重置分页状态到第一页
- 加载数据完成后隐藏toast（使用wx.hideLoading）
- 使用finally确保toast总是被隐藏

**实现示例**：
```javascript
// pages/example/example.js
Page({
  data: {
    activeTab: 'all',  // 当前选中的Tab
    currentList: [],   // 当前显示的列表
    loading: false,    // 加载状态
    pagination: {      // 分页状态
      all: { page: 1, hasMore: true },
      pending: { page: 1, hasMore: true },
      completed: { page: 1, hasMore: true }
    }
  },

  onLoad() {
    this.loadTabData()
  },

  /**
   * Tab切换处理
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    
    // 如果点击的是当前Tab，不执行任何操作
    if (tab === this.data.activeTab) {
      return
    }
    
    // 切换 tab 时，先清空列表并显示加载中
    this.setData({
      activeTab: tab,
      currentList: [],  // 先清空列表
      loading: true
    })

    // 显示加载中动画toast
    wx.showLoading({
      title: '加载中',
      mask: true
    })

    // 始终重新加载第一页数据
    this.setData({
      [`pagination.${tab}.page`]: 1,
      [`pagination.${tab}.hasMore`]: true
    })

    this.loadTabData().finally(() => {
      wx.hideLoading()  // 加载完成后隐藏toast
    })
  },

  /**
   * 加载Tab数据
   */
  async loadTabData() {
    const { activeTab, pagination } = this.data
    const { page, pageSize } = pagination[activeTab]

    try {
      this.setData({ loading: true })

      // 调用云函数加载数据
      const res = await wx.cloud.callFunction({
        name: 'exampleCloudFunction',
        data: {
          action: 'list',
          params: {
            tab: activeTab,
            page,
            pageSize
          }
        }
      })

      const result = res.result
      if (result.code === 0) {
        const newData = result.data.list || []
        const hasMore = result.data.hasMore || false

        this.setData({
          currentList: newData,
          [`pagination.${activeTab}.hasMore`]: hasMore,
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    }
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    const { activeTab, loading, pagination } = this.data
    const { page, hasMore } = pagination[activeTab]

    // 如果正在加载或没有更多数据，不执行加载
    if (loading || !hasMore) {
      return
    }

    // 更新页码
    this.setData({
      [`pagination.${activeTab}.page`]: page + 1
    })

    // 加载数据
    this.loadTabData()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    const { activeTab } = this.data

    // 重置分页状态
    this.setData({
      currentList: [],
      [`pagination.${activeTab}.page`]: 1,
      [`pagination.${activeTab}.hasMore`]: true
    })

    // 加载数据
    this.loadTabData().then(() => {
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.stopPullDownRefresh()
    })
  }
})
```

**WXML示例**：
```xml
<view class="tabs">
  <view 
    class="tab {{activeTab === 'all' ? 'active' : ''}}" 
    bindtap="switchTab" 
    data-tab="all"
  >
    全部
  </view>
  <view 
    class="tab {{activeTab === 'pending' ? 'active' : ''}}" 
    bindtap="switchTab" 
    data-tab="pending"
  >
    待处理
  </view>
  <view 
    class="tab {{activeTab === 'completed' ? 'active' : ''}}" 
    bindtap="switchTab" 
    data-tab="completed"
  >
    已完成
  </view>
</view>

<view class="list" wx:if="{{currentList.length > 0}}">
  <view class="item" wx:for="{{currentList}}" wx:key="_id">
    {{item.title}}
  </view>
</view>

<view class="loading" wx:if="{{loading}}">
  <text>加载中...</text>
</view>

<view class="empty" wx:if="{{!loading && currentList.length === 0}}">
  <text>暂无数据</text>
</view>
```

**重要提示**：
- 使用 `wx.showLoading` 和 `wx.hideLoading` 显示/隐藏加载提示
- 使用 `finally` 确保无论成功或失败，加载提示都会被隐藏
- 使用 `mask: true` 防止用户在加载过程中进行其他操作
- 每个Tab维护独立的分页状态（`pagination.{tabName}`）
- 切换Tab时清空列表，提供更好的用户体验
- 避免重复加载：点击当前Tab时不执行任何操作

---

## 5. 权限控制规范

### 5.1 功能权限配置要求

**规则**：后续新增任何功能，都必须在 `permissions` 表中写入相应的权限记录（如无特别说明，使用默认配置）。

**强制流程**：
1. 新增功能前，先确认功能模块名称和权限配置
2. 在 `permissions` 表中添加权限记录
3. 前端使用 `permissionManager` 云函数验证用户权限
4. 在页面中使用 app.checkPermission() 等封装方法检查权限

**权限表结构**：
```javascript
// permissions - 权限配置表
{
  _id: String,
  featureKey: String,              // 功能标识（如 'medical_application'）
  featureName: String,            // 功能名称（如 '就医申请'）
  description: String,            // 功能描述
  enabledRoles: Array[String],     // 允许访问的角色列表
  requireAdmin: Boolean,          // 是否需要管理员权限
  createdAt: Number,
  updatedAt: Number
}
```

**云函数 API**：
```javascript
// 1. 初始化权限配置（仅管理员）
wx.cloud.callFunction({
  name: 'permissionManager',
  data: { action: 'initPermissions' }
})

// 2. 检查单个功能权限
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'checkPermission',
    featureKey: 'medical_application'
  }
})

// 3. 批量检查权限
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'batchCheckPermissions',
    featureKeys: ['medical_application', 'weekly_menu']
  }
})

// 4. 更新权限配置（仅管理员）
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'updatePermission',
    featureKey: 'medical_application',
    config: {
      featureName: '就医申请',
      description: '提交就医申请',
      enabledRoles: ['馆领导', '部门负责人', '馆员'],
      requireAdmin: false
    }
  }
})
```

**前端封装方法（app.js）**：
```javascript
const app = getApp()

// 检查单个功能权限
app.checkPermission('medical_application')
  .then(hasPermission => {
    if (hasPermission) {
      // 允许访问
    } else {
      // 提示无权限
    }
  })

// 获取权限详细信息
app.getPermissionInfo('medical_application')
  .then(permInfo => {
    console.log('权限信息:', permInfo)
  })

// 批量检查权限
app.batchCheckPermissions(['medical_application', 'weekly_menu'])
  .then(result => {
    console.log('批量权限检查结果:', result)
  })
```

**使用示例：页面权限检查**
```javascript
// 在页面 onLoad 时检查权限
onLoad() {
  app.checkPermission('announcement:create').then(hasPermission => {
    this.setData({ hasCreatePermission: hasPermission })
  })
}

// 点击按钮时检查权限
handleQuickAction(e) {
  const label = e.currentTarget.dataset.label
  if (label === '就医申请') {
    app.checkPermission('medical_application')
      .then((hasPermission) => {
        if (hasPermission) {
          wx.navigateTo({
            url: '/pages/office/medical-application/medical-application'
          })
        } else {
          app.getPermissionInfo('medical_application')
            .then((permInfo) => {
              const message = permInfo.feature ? permInfo.feature.message : '您没有权限使用此功能'
              wx.showModal({
                title: '权限提示',
                content: message,
                showCancel: false,
                confirmText: '我知道了'
              })
            })
        }
      })
  }
}
```

**默认权限配置**：
| featureKey | featureName | enabledRoles | requireAdmin |
|-----------|-------------|--------------|---------------|
| medical_application | 就医申请 | 馆领导、部门负责人、馆员、工勤 | 否 |
| weekly_menu | 每周菜单 | 馆领导、部门负责人、馆员、工勤、物业、配偶、家属 | 否 |
| user_management | 用户管理 | 馆领导、部门负责人 | 是 |
| approval_management | 审批管理 | 馆领导、部门负责人 | 否 |

### 5.2 权限配置检查清单

在新增功能上线前，必须检查：
- [ ] 是否在 `permissions` 表中添加了权限记录（通过 permissionManager 云函数）
- [ ] featureKey 是否符合命名规范（使用下划线分隔，如 'medical_application'）
- [ ] featureName 和 description 是否清晰
- [ ] enabledRoles 是否配置正确
- [ ] 前端是否添加了权限检查逻辑
- [ ] 权限检查失败时是否有友好提示

---

## 6. 工作流相关规范

### 6.1 工作流模板初始化规范

**规则**：任何涉及工作流的功能，必须通过 `initWorkflowDB` 云函数初始化工作流模板。

**强制要求**：
- 在 `app.js` 的 `onLaunch` 中调用 `initWorkflowTemplates()` 自动初始化
- 使用本地存储标记（`WORKFLOW_INIT_KEY`）避免重复初始化
- 提供 `reinitWorkflowTemplates()` 方法用于强制刷新模板
- 确保必需的工作流模板已导入，否则功能无法使用

**实现示例**：
```javascript
// app.js

// 1. 定义存储键常量
const WORKFLOW_INIT_KEY = 'office-workflow-initialized'

// 2. 在 onLaunch 中调用初始化
onLaunch(opts, data) {
  // ... 原有代码 ...
  
  this.restoreAuthState()
  this.initWorkflowTemplates()  // 初始化工作流模板
}

// 3. 实现初始化方法
/**
 * 初始化工作流模板（确保必需的工作流模板已导入）
 * 使用本地存储标记避免重复初始化
 */
initWorkflowTemplates() {
  const initialized = wx.getStorageSync(WORKFLOW_INIT_KEY)
  
  // 如果已经初始化过，则跳过
  if (initialized) {
    return
  }
  
  // 调用云函数初始化工作流模板
  wx.cloud.callFunction({
    name: 'initWorkflowDB',
    data: {}
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      console.log('工作流模板初始化成功:', result.data)
      // 标记为已初始化
      wx.setStorageSync(WORKFLOW_INIT_KEY, {
        initialized: true,
        timestamp: Date.now(),
        data: result.data
      })
    } else {
      console.warn('工作流模板初始化失败:', result.message)
    }
  }).catch(error => {
    console.error('工作流模板初始化异常:', error)
    // 静默失败，不影响用户使用
  })
}

// 4. 提供重新初始化方法（可选）
/**
 * 重新初始化工作流模板（用于强制刷新模板）
 * @returns {Promise<Object>} 初始化结果
 */
reinitWorkflowTemplates() {
  return wx.cloud.callFunction({
    name: 'initWorkflowDB',
    data: {}
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      console.log('工作流模板重新初始化成功:', result.data)
      // 更新初始化标记
      wx.setStorageSync(WORKFLOW_INIT_KEY, {
        initialized: true,
        timestamp: Date.now(),
        data: result.data
      })
      return result.data
    } else {
      throw new Error(result.message || '重新初始化失败')
    }
  })
}
```

**检查清单**：
- [ ] 新工作流功能是否调用 `initWorkflowDB` 云函数
- [ ] 是否在 app.js onLaunch 中自动初始化
- [ ] 是否使用本地存储标记避免重复初始化
- [ ] 是否提供重新初始化方法
- [ ] 工作流模板是否成功导入到 `workflow_templates` 集合

### 6.3 工作流申请卡片和详情页动态渲染规范

**规则**：所有工作流申请类型的卡片显示和详情页显示，必须使用 `displayConfig` 动态配置，禁止硬编码。

**核心要求**：
- ✅ 在工作流模板的 `displayConfig` 字段中定义显示配置
- ✅ 创建工单时，`workflowEngine` 云函数自动快照 `displayConfig`
- ✅ 前端根据 `displayConfig` 动态渲染字段
- ✅ 支持条件显示（如某些字段只在特定条件下显示）
- ❌ 禁止在前端代码中硬编码字段列表

**displayConfig 结构**：
```javascript
{
  displayConfig: {
    cardFields: [
      { field: 'patientName', label: '就医人' },
      { field: 'relation', label: '关系' }
    ],
    detailFields: [
      { field: 'patientName', label: '就医人姓名' },
      { field: 'relation', label: '与申请人关系' },
      { field: 'institution', label: '就医机构' },
      // 条件显示字段
      { 
        field: 'otherInstitution', 
        label: '机构名称', 
        condition: { field: 'institution', value: '其他' }
      }
    ]
  }
}
```

**字段配置属性**：
| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field` | String | 是 | 字段名（对应 businessData 中的字段） |
| `label` | String | 是 | 显示标签 |
| `condition` | Object | 否 | 条件显示配置 |
| `condition.field` | String | 是 | 条件字段名 |
| `condition.value` | Any | 是 | 条件值（支持字符串、数字、布尔值） |

**实现示例：卡片列表动态渲染**：
```javascript
// miniprogram/pages/office/approval/approval.js

/**
 * 将请求数据转换为显示格式
 * @param {Object} request - 请求数据
 * @returns {Object} 转换后的显示数据
 */
function mapRequestItem(request) {
  const { orderType, businessData, displayConfig, workflowSnapshot } = request
  
  // 优先使用 displayConfig（动态配置）
  const config = displayConfig || workflowSnapshot?.displayConfig || null
  
  let detail = ''
  let detailParts = []
  
  if (config && config.cardFields && config.cardFields.length > 0) {
    // 动态生成字段显示
    for (const fieldConfig of config.cardFields) {
      const { field, label, condition } = fieldConfig
      
      // 检查条件显示
      if (condition) {
        const conditionField = businessData[condition.field]
        // 支持多种条件判断
        let showField = false
        if (condition.op === 'neq') {
          showField = conditionField !== condition.value
        } else {
          // 默认相等判断
          showField = conditionField === condition.value
        }
        if (!showField) continue
      }
      
      const value = businessData[field]
      if (value !== undefined && value !== null && value !== '') {
        detailParts.push(`${label}：${value}`)
      }
    }
    detail = detailParts.join(' | ')
  } else {
    // 降级方案：使用硬编码（仅用于兼容旧数据）
    // ... 硬编码逻辑
  }
  
  return {
    id: request._id,
    orderType,
    detail: detail || '暂无详情',
    // ... 其他字段
  }
}
```

**实现示例：详情页动态渲染**：
```javascript
// miniprogram/components/approval-detail/approval-detail.js

Component({
  properties: {
    request: {
      type: Object,
      value: {}
    }
  },

  data: {
    detailFields: []
  },

  observers: {
    'request': function(request) {
      if (!request) return
      
      const { businessData, displayConfig, workflowSnapshot } = request
      const config = displayConfig || workflowSnapshot?.displayConfig || null
      
      let fields = []
      
      if (config && config.detailFields) {
        // 动态生成详情字段
        fields = config.detailFields.map(fieldConfig => {
          const { field, label, condition } = fieldConfig
          
          // 检查条件显示
          if (condition) {
            const conditionValue = businessData[condition.field]
            let showField = false
            if (condition.op === 'neq') {
              showField = conditionValue !== condition.value
            } else {
              showField = conditionValue === condition.value
            }
            if (!showField) return null
          }
          
          const value = businessData[field]
          return {
            field,
            label,
            value: value !== undefined && value !== null ? String(value) : ''
          }
        }).filter(f => f !== null)
      } else {
        // 降级方案：使用硬编码 fieldConfigs
        // ... 硬编码逻辑
      }
      
      this.setData({ detailFields: fields })
    }
  }
})
```

**WXML 模板**：
```xml
<!-- approval-detail.wxml -->
<!-- 动态渲染详情字段 -->
<block wx:for="{{detailFields}}" wx:key="field">
  <view class="approval-modal-row">
    <text class="approval-modal-label">{{item.label}}</text>
    <text class="approval-modal-value">{{item.value}}</text>
  </view>
</block>
```

**新增工作流类型流程**：
1. 在 `initWorkflowDB` 云函数中添加新模板
2. 在模板中定义 `displayConfig` 配置
3. 创建工单时，`workflowEngine` 自动快照配置
4. 前端自动根据配置渲染，无需修改代码

**检查清单**：
- [ ] 新增工作流类型是否在模板中定义了 `displayConfig`
- [ ] `cardFields` 是否包含卡片列表需要显示的关键字段
- [ ] `detailFields` 是否包含详情页需要显示的所有字段
- [ ] 条件显示字段是否正确配置了 `condition`
- [ ] 是否提供了降级方案（兼容旧数据）
- [ ] 前端代码是否使用动态渲染而非硬编码

### 6.4 工作流引擎使用规范

**规则**：使用工作流功能时，必须通过 `workflowEngine` 云函数操作。

**核心要求**：
- 使用 `workflowEngine` 云函数
- 工作流模板存储在 `workflow_templates` 集合
- 工单存储在 `work_orders` 集合
- 工作流任务存储在 `workflow_tasks` 集合
- 工作流日志存储在 `workflow_logs` 集合

**主要 Action**：
```javascript
// 1. 提交工单
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'submitOrder',
    orderType: 'user_registration',  // 工单类型
    businessData: {
      applicantId: app.globalData.openid,
      applicantName: '张三',
      // ...其他业务数据
    }
  }
})

// 2. 查询我的待办
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'getMyTasks',
    page: 1,
    pageSize: 20
  }
})

// 3. 审批任务
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'approveTask',
    taskId: taskId,
    approvalAction: 'approve',  // 'approve', 'reject', 'return'
    comment: '审批意见',
    operatorName: '李四'
  }
})

// 4. 查询工单详情
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'getOrderDetail',
    orderId: orderId
  }
})
```

**工作流模板配置规范**：
```javascript
// workflow_templates 集合结构
{
  _id: String,
  name: String,                   // 模板名称
  code: String,                   // 模板代码（唯一，如 'user_registration'）
  version: Number,                // 版本号
  description: String,            // 模板描述
  category: String,               // 分类：'approval'（审批）| 'notification'（通知）
  steps: Array,                   // 审批步骤列表
  defaultTimeout: Number,          // 默认超时时间（小时）
  notifyOnSubmit: Boolean,         // 提交时是否通知
  notifyOnComplete: Boolean,        // 完成时是否通知
  notifyOnTimeout: Boolean,        // 超时时是否通知
  status: String,                 // 状态：'active'（启用）| 'disabled'（禁用）
  createdAt: Number,
  updatedAt: Number
}
```

**steps 数组结构**（审批步骤）：
```javascript
{
  stepNo: Number,                 // 步骤编号
  stepName: String,               // 步骤名称
  stepType: String,               // 步骤类型：'serial'（串行）
  approverType: String,           // 审批人类型：'role'（角色）| 'user'（指定用户）
  approverConfig: Object,          // 审批人配置
    - roleIds: Array[String]      // 角色列表
    - userIds: Array[String]      // 用户 openid 列表
  canReject: Boolean,            // 是否可以拒绝
  canReturn: Boolean,            // 是否可以退回
  returnTo: Number,              // 退回到哪个步骤（0 表示第一步）
  timeout: Number,               // 超时时间（小时）
  timeoutAction: String,         // 超时动作：'remind'（提醒）| 'auto_approve'（自动通过）| 'auto_reject'（自动拒绝）
}
```

**使用示例：提交工作流工单**：
```javascript
// 小程序端调用云函数
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'submitOrder',
    orderType: 'notification_publish',
    businessData: {
      title: '测试通知',
      content: '这是一个测试通知',
      type: 'normal'
    }
  }
}).then(res => {
  if (res.result.code === 0) {
    console.log('工单提交成功:', res.result.data.orderNo)
    wx.showToast({ title: '提交成功', icon: 'success' })
  } else {
    wx.showToast({ title: res.result.message, icon: 'none' })
  }
})
```

**检查清单**：
- [ ] 是否使用 `workflowEngine` 云函数
- [ ] 工作流模板是否已创建在 `workflow_templates` 集合
- [ ] orderType 是否与模板的 code 字段匹配
- [ ] businessData 是否符合业务需求
- [ ] 是否处理了提交成功/失败的回调
- [ ] 是否有友好的错误提示

---

## 7. 云函数部署规范

### 7.1 云函数修改流程

**规则**：修改云函数后必须重新部署并测试验证。

**强制流程**：
1. 修改云函数代码
2. 保存代码文件
3. 上传并部署云函数
4. 在控制台测试云函数
5. 验证功能是否正常

**部署步骤**：
```javascript
// 1. 在微信开发者工具中右键云函数目录
// 2. 选择"上传并部署：云端安装依赖"
// 3. 等待部署完成（约30秒-1分钟）
```

**控制台部署步骤**：
1. 打开云开发控制台的云函数详情页：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=云函数名&NameSpace=cloud1-8gdftlggae64d5d0
   ```

2. 点击"代码"标签页

3. 点击"上传并部署：云端安装依赖"

4. 等待部署完成（约30秒-1分钟）

5. 部署完成后，点击"运行测试"验证

### 7.2 云函数测试验证

**规则**：部署后必须使用测试功能验证云函数是否正常工作。

**测试流程**：
```javascript
// 1. 点击"运行测试"按钮
// 2. 输入测试参数
// 3. 查看返回结果
// 4. 验证返回值是否符合预期
```

**测试用例示例**：
```json
{
  "action": "list",
  "params": {
    "page": 1,
    "pageSize": 10
  }
}
```

**预期结果**：
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 10,
    "hasMore": false
  }
}
```

### 7.3 云函数代码规范

**规则**：
- 云函数开头集中定义所有集合引用
- 使用常量命名集合引用
- 统一的错误处理和返回格式
- 详细的日志输出
- 清晰的注释

**示例**：
```javascript
// cloudfunctions/example/index.js

const cloud = require('wx-server-sdk')
cloud.init()
const db = cloud.database()
const _ = db.command

// 集合引用
const workOrdersCollection = db.collection('work_orders')
const workflowTemplatesCollection = db.collection('workflow_templates')
const announcementsCollection = db.collection('announcements')
const usersCollection = db.collection('office_users')

// 成功返回
function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

// 失败返回
function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

exports.main = async (event, context) => {
  const { action, params } = event
  const openid = cloud.getWXContext().OPENID
  
  console.log('云函数调用:', { action, params, openid })
  
  try {
    // 业务逻辑
    return success(result, '操作成功')
  } catch (error) {
    console.error('操作失败:', error)
    return fail(error.message || '操作失败', 500)
  }
}
```

**检查清单**：
- [ ] 云函数代码是否已保存
- [ ] 云函数是否已重新部署
- [ ] 云函数测试是否通过（返回 code: 0）
- [ ] 是否测试了所有 action 分支
- [ ] 是否有详细的日志输出
- [ ] 是否有统一的错误处理
- [ ] 是否定义了常量集合引用

---

## 8. 错误处理规范

### 8.1 统一错误返回格式

**规则**：所有云函数必须使用统一的错误返回格式。

**成功返回格式**：
```javascript
{
  code: 0,           // 0 表示成功
  message: 'ok',    // 成功消息
  data: {...}       // 返回的数据
}
```

**失败返回格式**：
```javascript
{
  code: 500,                 // 非 0 表示失败
  message: '错误描述',       // 错误消息
  data: null                 // 错误相关数据（可选）
}
```

**常用错误码**：
```javascript
// 成功
code: 0

// 客户端错误
code: 400   // 请求参数错误
code: 401   // 未授权
code: 403   // 权限不足
code: 404   // 资源不存在
code: 409   // 资源冲突

// 服务器错误
code: 500   // 服务器内部错误
code: 503   // 服务不可用
```

### 8.2 云函数错误处理

**规则**：云函数必须使用 try-catch 捕获所有异常，并返回统一格式的错误。

**实现示例**：
```javascript
exports.main = async (event, context) => {
  const { action, params } = event
  
  try {
    // 参数验证
    if (!action) {
      return fail('缺少 action 参数', 400)
    }
    
    // 业务逻辑
    switch (action) {
      case 'create':
        return await handleCreate(params)
      case 'update':
        return await handleUpdate(params)
      case 'delete':
        return await handleDelete(params)
      default:
        return fail('未知的 action', 400)
    }
  } catch (error) {
    console.error('云函数执行错误:', error)
    
    // 判断错误类型
    if (error.name === 'ValidationError') {
      return fail(error.message, 400)
    } else if (error.name === 'PermissionError') {
      return fail(error.message, 403)
    } else {
      return fail('服务器内部错误', 500)
    }
  }
}

// 辅助函数
function success(data, message) {
  return { code: 0, message: message || 'ok', data: data || {} }
}

function fail(message, code, data) {
  return { code: code || 500, message: message || '服务异常', data: data || null }
}
```

### 8.3 前端错误处理

**规则**：前端必须处理云函数调用的所有错误情况，并给出友好提示。

**实现示例**：
```javascript
// 小程序端调用云函数
async callCloudFunction(functionName, data) {
  try {
    const result = await wx.cloud.callFunction({
      name: functionName,
      data: data
    })
    
    const response = result.result
    
    // 检查返回码
    if (response.code !== 0) {
      throw new Error(response.message || '操作失败')
    }
    
    return response.data
  } catch (error) {
    console.error('云函数调用失败:', error)
    
    // 显示友好提示
    wx.showToast({
      title: error.message || '操作失败，请稍后重试',
      icon: 'none',
      duration: 2000
    })
    
    // 重新抛出错误，供上层处理
    throw error
  }
}

// 使用示例
Page({
  async handleSubmit() {
    try {
      await this.callCloudFunction('example', {
        action: 'create',
        data: this.data.formData
      })
      
      wx.showToast({ title: '提交成功', icon: 'success' })
      
    } catch (error) {
      // 错误已在 callCloudFunction 中处理
    }
  }
})
```

### 8.4 错误日志记录

**规则**：所有错误必须记录详细的日志信息。

**日志记录示例**：
```javascript
// 云函数中
try {
  // 业务逻辑
} catch (error) {
  console.error('操作失败:', {
    action: action,
    params: params,
    openid: openid,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })
  
  return fail(error.message, 500)
}

// 前端中
try {
  // 业务逻辑
} catch (error) {
  console.error('页面操作失败:', {
    page: getCurrentPages()[0].route,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  })
  
  wx.showToast({ title: '操作失败', icon: 'none' })
}
```

**检查清单**：
- [ ] 云函数是否有统一的错误返回格式
- [ ] 是否使用 try-catch 捕获所有异常
- [ ] 是否定义了常用错误码
- [ ] 前端是否处理了所有错误情况
- [ ] 是否有友好的错误提示
- [ ] 是否记录了详细的错误日志
- [ ] 是否区分了不同类型的错误

---

## 9. 数据验证规范

### 9.1 前端表单验证

**规则**：所有表单提交前必须在前端进行数据验证。

**验证要求**：
- 必填项检查
- 数据格式验证
- 数据范围验证
- 实时验证反馈

**实现示例**：
```javascript
Page({
  data: {
    formData: {
      title: '',
      content: '',
      type: 'normal'
    },
    errors: {}
  },
  
  // 实时验证
  handleInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    
    this.setData({
      [`formData.${field}`]: value
    })
    
    // 实时验证
    this.validateField(field, value)
  },
  
  // 字段验证
  validateField(field, value) {
    let error = ''
    
    switch (field) {
      case 'title':
        if (!value) {
          error = '标题不能为空'
        } else if (value.length > 100) {
          error = '标题不能超过100个字符'
        }
        break
        
      case 'content':
        if (!value) {
          error = '内容不能为空'
        } else if (value.length < 10) {
          error = '内容不能少于10个字符'
        }
        break
        
      case 'type':
        if (!['urgent', 'important', 'normal'].includes(value)) {
          error = '类型无效'
        }
        break
    }
    
    this.setData({
      [`errors.${field}`]: error
    })
    
    return !error
  },
  
  // 表单提交验证
  validateForm() {
    const { formData } = this.data
    let isValid = true
    
    // 验证所有字段
    Object.keys(formData).forEach(field => {
      if (!this.validateField(field, formData[field])) {
        isValid = false
      }
    })
    
    return isValid
  },
  
  // 提交表单
  async handleSubmit() {
    // 验证表单
    if (!this.validateForm()) {
      wx.showToast({ title: '请检查表单填写', icon: 'none' })
      return
    }
    
    // 提交数据
    try {
      await wx.cloud.callFunction({
        name: 'example',
        data: this.data.formData
      })
      
      wx.showToast({ title: '提交成功', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '提交失败', icon: 'none' })
    }
  }
})
```

**WXML 中的错误提示**：
```xml
<view class="form-item">
  <text class="label">标题 <text class="required">*</text></text>
  <input 
    class="input {{errors.title ? 'error' : ''}}"
    placeholder="请输入标题"
    value="{{formData.title}}"
    bindinput="handleInput"
    data-field="title"
  />
  <text class="error-text" wx:if="{{errors.title}}">{{errors.title}}</text>
</view>
```

### 9.2 云函数数据验证

**规则**：云函数必须验证所有传入的参数。

**验证要求**：
- 参数存在性检查
- 参数类型检查
- 参数格式检查
- 业务规则验证

**实现示例**：
```javascript
// 验证工具函数
function validate(data, rules) {
  const errors = []
  
  for (const field in rules) {
    const rule = rules[field]
    const value = data[field]
    
    // 必填检查
    if (rule.required && !value) {
      errors.push(`${rule.label}不能为空`)
      continue
    }
    
    // 如果非必填且为空，跳过其他验证
    if (!rule.required && !value) {
      continue
    }
    
    // 类型检查
    if (rule.type && typeof value !== rule.type) {
      errors.push(`${rule.label}类型错误，应为${rule.type}`)
      continue
    }
    
    // 枚举值检查
    if (rule.enum && !rule.enum.includes(value)) {
      errors.push(`${rule.label}值无效`)
      continue
    }
    
    // 长度检查
    if (rule.minLength && value.length < rule.minLength) {
      errors.push(`${rule.label}长度不能少于${rule.minLength}`)
    }
    
    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push(`${rule.label}长度不能超过${rule.maxLength}`)
    }
    
    // 自定义验证
    if (rule.validator && !rule.validator(value)) {
      errors.push(rule.message || `${rule.label}验证失败`)
    }
  }
  
  return errors
}

// 使用示例
exports.main = async (event, context) => {
  const { action, params } = event
  
  try {
    // 验证参数
    if (action === 'create') {
      const rules = {
        title: {
          required: true,
          type: 'string',
          label: '标题',
          maxLength: 100
        },
        content: {
          required: true,
          type: 'string',
          label: '内容',
          minLength: 10,
          maxLength: 1000
        },
        type: {
          required: true,
          type: 'string',
          label: '类型',
          enum: ['urgent', 'important', 'normal']
        }
      }
      
      const errors = validate(params, rules)
      if (errors.length > 0) {
        return fail(errors[0], 400)  // 返回第一个错误
      }
    }
    
    // 业务逻辑
    return success(result, '操作成功')
  } catch (error) {
    console.error('操作失败:', error)
    return fail(error.message || '操作失败', 500)
  }
}
```

### 9.3 数据库字段验证

**规则**：使用数据库安全规则进行数据验证。

**验证规则示例**：
```json
{
  "read": "auth.openid == doc._openid || auth.openid in doc.enabledRoles",
  "write": "auth.openid == doc._openid || auth.openid in doc.enabledRoles"
}
```

**云函数中验证数据库操作**：
```javascript
// 验证集合名称
const validCollections = ['work_orders', 'workflow_templates', 'announcements']
if (!validCollections.includes(collectionName)) {
  return fail('无效的集合名称', 400)
}

// 验证字段类型
if (typeof title !== 'string') {
  return fail('标题类型错误', 400)
}

// 验证字段长度
if (title.length > 100) {
  return fail('标题长度不能超过100个字符', 400)
}

// 执行数据库操作
const result = await db.collection(collectionName).add({
  data: validatedData
})
```

**检查清单**：
- [ ] 前端表单是否有验证
- [ ] 是否有必填项检查
- [ ] 是否有数据格式验证
- [ ] 是否有数据范围验证
- [ ] 是否有实时验证反馈
- [ ] 云函数是否验证所有传入参数
- [ ] 是否有参数存在性检查
- [ ] 是否有参数类型检查
- [ ] 是否有业务规则验证
- [ ] 是否使用数据库安全规则
- [ ] 错误提示是否友好清晰

---

## 10. 代码审查检查清单

在提交代码前，必须检查以下项目：

### 10.1 数据库相关
- [ ] 是否查阅了 `DATABASE_COLLECTIONS_REFERENCE.md`
- [ ] 集合名称是否正确
- [ ] 字段命名是否符合规范
- [ ] 是否需要新增集合并已更新文档
- [ ] 是否使用了正确的集合（如 work_orders 而不是 workflow_orders）
- [ ] 新增集合是否配置了安全规则（aclTag）
- [ ] 安全规则是否已通过 MCP 工具设置
- [ ] 新增集合是否配置了必要的索引
- [ ] 索引是否已通过 MCP 工具创建

### 10.2 云函数相关
- [ ] 是否定义了常量集合引用
- [ ] 是否有统一的错误处理
- [ ] 是否有详细的日志输出
- [ ] 是否测试了所有分支
- [ ] 修改后是否重新部署
- [ ] 部署后是否测试验证

### 10.3 前端相关
- [ ] 事件处理函数是否以 handle 开头
- [ ] 数据绑定是否使用双大括号
- [ ] 是否有适当的错误提示
- [ ] 是否处理了加载状态
- [ ] 表单是否有验证

### 10.4 UI设计相关
- [ ] 列表页面是否参照"每周菜单"页面设计
- [ ] 表单页面是否参照"新增菜单"页面设计
- [ ] 是否使用了渐变色头部
- [ ] 是否使用了卡片式布局
- [ ] 是否适配移动端响应式
- [ ] 表单验证是否完善

### 10.5 分页加载相关
- [ ] 列表页面是否引入了 PaginationBehavior
- [ ] 是否实现了上拉加载更多（onReachBottom）
- [ ] 是否实现了下拉刷新（onPullDownRefresh）
- [ ] 是否正确设置了分页参数（page, pageSize, hasMore）
- [ ] 是否显示了加载状态（loading, noMore）
- [ ] 每页数据量是否合理（建议10-20条）

### 10.6 权限控制相关
- [ ] 是否在 `permissions` 表中添加了权限记录
- [ ] 权限 key 是否符合命名规范（使用下划线分隔）
- [ ] featureKey 和 description 是否清晰
- [ ] enabledRoles 是否配置正确
- [ ] 前端是否添加了权限检查逻辑
- [ ] 权限检查失败时是否有友好提示

### 10.7 工作流相关
- [ ] 新工作流功能是否调用 `initWorkflowDB` 云函数
- [ ] 是否在 app.js onLaunch 中自动初始化
- [ ] 是否使用本地存储标记避免重复初始化
- [ ] 是否使用 `workflowEngine` 云函数
- [ ] 工作流模板是否已创建在 `workflow_templates` 集合
- [ ] orderType 是否与模板的 code 字段匹配
- [ ] businessData 是否符合业务需求

### 10.8 数据验证相关
- [ ] 前端表单是否有验证
- [ ] 是否有必填项检查
- [ ] 是否有数据格式验证
- [ ] 是否有数据范围验证
- [ ] 是否有实时验证反馈
- [ ] 云函数是否验证所有传入参数
- [ ] 是否有参数存在性检查
- [ ] 是否有参数类型检查
- [ ] 是否有业务规则验证

### 10.9 错误处理相关
- [ ] 云函数是否有统一的错误返回格式
- [ ] 是否使用 try-catch 捕获所有异常
- [ ] 是否定义了常用错误码
- [ ] 前端是否处理了所有错误情况
- [ ] 是否有友好的错误提示
- [ ] 是否记录了详细的错误日志
- [ ] 是否区分了不同类型的错误

### 10.10 时间处理相关
- [ ] 后端是否只存储 GMT 时间戳（使用 `Date.now()`）
- [ ] 后端返回数据时是否返回时间戳而不是格式化字符串
- [ ] 前端是否使用 `utils.js` 中的时间格式化函数
- [ ] 前端是否从 `constants.getConstantSync('TIMEZONE_OFFSET')` 获取时区偏移量
- [ ] 时间显示是否考虑了用户时区设置

### 10.11 工具函数入口检查清单
- [ ] 是否使用 `common/utils.js` 而不是 `util/util.js`
- [ ] 引入路径是否正确（`../../../common/utils.js`）
- [ ] 是否使用 `utils.showToast` 而不是 `util.showToast`
- [ ] 是否使用 `utils.formatDuration` 而不是 `util.formatTime`
- [ ] 是否使用 `utils.formatLocation` 而不是 `util.formatLocation`

---

## 11. 时间处理规范

### 11.0 工具函数统一入口

**重要**：项目中有两个工具函数文件，请统一使用 **`miniprogram/common/utils.js`**

| 文件 | 状态 | 说明 |
|------|------|------|
| `miniprogram/common/utils.js` | ✅ **推荐使用** | 新的统一入口，支持数据库配置时区 |
| `miniprogram/util/util.js` | ❌ **即将废弃** | 旧文件，时间函数硬编码 GMT-3 |

**迁移计划**：
1. 新代码统一使用 `common/utils.js`
2. 旧代码逐步迁移到 `common/utils.js`
3. 最终删除 `util/util.js`

### 11.1 核心原则

**后端（云函数）**：
- ✅ 只存储和返回 **GMT 时间戳**（毫秒）
- ✅ 使用 `Date.now()` 获取当前时间
- ✅ 返回数据时直接返回时间戳，不进行格式化
- ❌ 禁止在后端进行时间格式化（除非用于微信订阅消息）

**前端（小程序）**：
- ✅ 所有时间格式化都在前端进行
- ✅ 使用 `miniprogram/common/utils.js` 中的时间函数
- ✅ 基于 `TIMEZONE_OFFSET` 常量计算本地时间
- ✅ 时间函数都是同步的（从缓存读取时区偏移量）

**引入方式**：
```javascript
// ✅ 正确 - 使用新的统一入口
const utils = require('../../../common/utils.js')

// ❌ 错误 - 旧的入口已废弃
const util = require('../../../util/util.js')
```

### 11.2 后端时间处理

**获取当前时间戳**：
```javascript
// ✅ 正确
const now = Date.now()

// ❌ 错误
const now = new Date().toLocaleString()
```

**存储到数据库**：
```javascript
// ✅ 正确
await db.collection('work_orders').add({
  data: {
    createdAt: Date.now(),  // GMT 时间戳
    updatedAt: Date.now()
  }
})
```

**返回数据给前端**：
```javascript
// ✅ 正确
return success({
  createdAt: 1710734400000,  // GMT 时间戳
  deadlineTime: 1710820800000
})

// ❌ 错误 - 不要在后端格式化
return success({
  createdAt: '2024-03-18 12:00:00'  // 格式化后的字符串
})
```

**例外情况（微信订阅消息）**：
```javascript
// ✅ 订阅消息可以格式化时间
function formatTimeForMessage(timestamp) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
}
```

### 11.3 前端时间处理

**引入工具函数**：
```javascript
// ✅ 正确
const utils = require('../../../common/utils.js')
```

**格式化日期时间**：
```javascript
// ✅ 正确
const formattedTime = utils.formatDateTime(timestamp, -3)  // YYYY-MM-DD HH:mm:ss

// ✅ 如果不传 offset，自动使用缓存的时区偏移量
const formattedTime = utils.formatDateTime(timestamp)
```

**格式化日期**：
```javascript
// ✅ 正确
const formattedDate = utils.formatDate(timestamp, -3)  // YYYY-MM-DD
```

**格式化相对时间**：
```javascript
// ✅ 正确
const relativeTime = utils.formatRelativeTime(timestamp, -3)  // "5分钟前"
```

**获取今天的日期**：
```javascript
// ✅ 正确
const today = utils.getTodayDate(-3)  // YYYY-MM-DD
```

### 11.4 时间函数 API

**可用函数**（全部在 `miniprogram/common/utils.js` 中）：

| 函数名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `getTimezoneOffset()` | 无 | `number` | 获取时区偏移量（同步，从缓存） |
| `formatDateTime(timestamp, offset)` | `timestamp`, `offset` | `string` | YYYY-MM-DD HH:mm:ss |
| `formatDate(timestamp, offset)` | `timestamp`, `offset` | `string` | YYYY-MM-DD |
| `formatTime(timestamp, offset)` | `timestamp`, `offset` | `string` | HH:mm:ss |
| `formatRelativeTime(timestamp, offset)` | `timestamp`, `offset` | `string` | "5分钟前" |
| `formatShortDateTime(timestamp, offset)` | `timestamp`, `offset` | `string` | MM-DD HH:mm |
| `getTodayDate(offset)` | `offset` | `string` | 今天日期 YYYY-MM-DD |
| `now()` | 无 | `number` | 当前 GMT 时间戳 |

### 11.5 时区偏移量配置

**从数据库获取**（异步）：
```javascript
const constants = require('../../../common/constants.js')

// 异步获取（首次加载时使用）
async function loadTimezone() {
  const offset = await constants.getConstant('TIMEZONE_OFFSET')
  return offset || -3  // 默认圣保罗时区
}
```

**从缓存获取**（同步）：
```javascript
const constants = require('../../../common/constants.js')

// 同步获取（用于时间格式化函数）
const offset = constants.getConstantSync('TIMEZONE_OFFSET')  // 返回 -3
```

### 11.6 常见错误案例

#### 案例A：在后端格式化时间

**错误代码**：
```javascript
// ❌ 错误：在后端格式化时间
exports.main = async (event, context) => {
  const orders = await db.collection('work_orders').get()
  
  const formattedOrders = orders.data.map(order => ({
    ...order,
    createdAt: new Date(order.createdAt).toLocaleString('zh-CN')  // ❌ 不要这样做
  }))
  
  return success(formattedOrders)
}
```

**问题**：
- 后端进行了时间格式化，破坏了数据一致性
- 如果用户时区不同，显示的时间会不正确

**正确代码**：
```javascript
// ✅ 正确：后端只返回时间戳
exports.main = async (event, context) => {
  const orders = await db.collection('work_orders').get()
  
  // 直接返回原始数据，包含时间戳
  return success(orders.data)
}

// 前端处理时间显示
const utils = require('../../../common/utils.js')
const formattedTime = utils.formatDateTime(order.createdAt)
```

#### 案例B：使用旧的函数名

**错误代码**：
```javascript
// ❌ 错误：使用已废弃的函数名
const utils = require('../../../common/utils.js')
const time = utils.formatRelativeTimeToTimezone(timestamp, -3)  // 函数不存在
```

**正确代码**：
```javascript
// ✅ 正确：使用新的函数名
const utils = require('../../../common/utils.js')
const time = utils.formatRelativeTime(timestamp, -3)
```

#### 案例C：时区偏移量硬编码

**错误代码**：
```javascript
// ❌ 错误：硬编码时区偏移量
function formatTime(timestamp) {
  const offset = -3  // 硬编码
  return utils.formatDateTime(timestamp, offset)
}
```

**正确代码**：
```javascript
// ✅ 正确：从配置读取时区偏移量
const formattedTime = utils.formatDateTime(timestamp)  // 自动使用缓存的偏移量

// 或明确指定
const constants = require('../../../common/constants.js')
const offset = constants.getConstantSync('TIMEZONE_OFFSET')
const formattedTime = utils.formatDateTime(timestamp, offset)
```

---

## 12. 常见错误案例

### 案例1：集合名称错误

**错误代码**：
```javascript
// announcementManager/index.js
const workflowOrdersCollection = db.collection('workflow_orders')  // ❌ 错误
```

**问题**：数据库中实际存在的是 `work_orders` 而不是 `workflow_orders`

**正确代码**：
```javascript
const workOrdersCollection = db.collection('work_orders')  // ✅ 正确
```

**如何避免**：
1. 编写代码前查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 复制粘贴集合名称，避免拼写错误
3. 测试时检查错误信息

### 案例2：字段命名不一致

**错误代码**：
```javascript
{
  created_at: 1234567890,  // ❌ 蛇形命名
  publisher_name: '张三',    // ❌ 蛇形命名
  read_count: 5              // ❌ 蛇形命名
}
```

**问题**：混用了命名风格

**正确代码**：
```javascript
{
  createdAt: 1234567890,    // ✅ 驼峰命名
  publisherName: '张三',      // ✅ 驼峰命名
  readCount: 5               // ✅ 驼峰命名
}
```

**如何避免**：
1. 参考现有数据的字段命名
2. 使用 ESLint 或类似工具检查
3. 代码审查时关注命名一致性

### 案例3：未查阅文档直接编码

**错误行为**：
- 看到"工作流"就认为是 `workflow_orders`
- 看到"通知"就认为是 `notifications`（实际上可能是 `announcements`）

**正确行为**：
1. 先查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认具体的集合名称和用途
3. 理解集合的字段结构
4. 然后再编写代码

### 案例4：列表页面未使用分页加载

**错误代码**：
```javascript
// ❌ 错误：一次性加载所有数据
onLoad() {
  const db = wx.cloud.database()
  db.collection('announcements').get({
    success: (res) => {
      this.setData({ list: res.data })
    }
  })
}
```

**问题**：
- 数据量大会导致页面卡顿
- 没有上拉加载更多功能
- 没有下拉刷新功能
- 用户体验差

**正确代码**：
```javascript
// ✅ 正确：使用分页加载框架
const PaginationBehavior = require('../../behaviors/pagination')

Page({
  behaviors: [PaginationBehavior],

  data: {
    listData: [],
    page: 1,
    pageSize: 15,
    hasMore: true,
    loading: false,
    noMore: false
  },

  onLoad() {
    this.loadData()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadData()
    }
  },

  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true,
      noMore: false
    })
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadData() {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const db = wx.cloud.database()
      const result = await db.collection('announcements')
        .skip((this.data.page - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .get()

      const newData = result.data
      const isLoadMore = this.data.page > 1

      this.setData({
        listData: isLoadMore ? [...this.data.listData, ...newData] : newData,
        hasMore: newData.length >= this.data.pageSize,
        noMore: newData.length < this.data.pageSize,
        loading: false
      })
    } catch (error) {
      console.error('加载数据失败:', error)
      this.setData({ loading: false })
    }
  }
})
```

**如何避免**：
1. 任何列表页面都必须使用分页加载
2. 引入 `PaginationBehavior` behavior
3. 配置上拉加载和下拉刷新
4. 设置合理的每页数据量（10-20条）

### 案例5：UI设计不统一

**错误代码**：
```wxml
<!-- ❌ 错误：样式不统一，没有参照参考页面 -->
<view class="list">
  <view class="item" wx:for="{{list}}" wx:key="id">
    <text>{{item.title}}</text>
  </view>
</view>
```

**问题**：
- 没有使用渐变色头部
- 列表项样式简陋
- 与其他页面风格不一致
- 用户体验差

**正确代码**：
```wxml
<!-- ✅ 正确：参照"每周菜单"页面设计 -->
<view class="page-container">
  <view class="gradient-header">
    <view class="header-content">
      <text class="page-title">通知公告</text>
    </view>
  </view>

  <view class="filter-tabs">
    <view class="tab {{currentType === '' ? 'active' : ''}}" bindtap="handleFilter" data-type="">全部</view>
    <view class="tab {{currentType === 'notice' ? 'active' : ''}}" bindtap="handleFilter" data-type="notice">通知</view>
    <view class="tab {{currentType === 'announcement' ? 'active' : ''}}" bindtap="handleFilter" data-type="announcement">公告</view>
  </view>

  <view class="list-container">
    <view class="list-item" wx:for="{{listData}}" wx:key="id" bindtap="handleItemClick" data-id="{{item.id}}">
      <view class="item-icon">
        <image src="{{item.type === 'notice' ? '/images/icon-notice.png' : '/images/icon-announcement.png'}}" />
      </view>
      <view class="item-content">
        <text class="item-title">{{item.title}}</text>
        <text class="item-desc">{{item.description}}</text>
        <text class="item-time">{{item.createdAt}}</text>
      </view>
      <view class="item-arrow">
        <text>></text>
      </view>
    </view>
  </view>

  <view class="loading-tip" wx:if="{{loading}}">
    <text>加载中...</text>
  </view>
  <view class="no-more-tip" wx:if="{{noMore}}">
    <text>没有更多了</text>
  </view>
</view>
```

```wxss
/* ✅ 正确：使用统一的样式 */
.page-container {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.gradient-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 40rpx 30rpx 60rpx;
}

.header-content {
  display: flex;
  align-items: center;
}

.page-title {
  font-size: 36rpx;
  font-weight: bold;
  color: #ffffff;
}

.list-container {
  padding: 20rpx;
  margin-top: -30rpx;
}

.list-item {
  background-color: #ffffff;
  border-radius: 12rpx;
  padding: 30rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 2rpx 10rpx rgba(0, 0, 0, 0.05);
}
```

**如何避免**：
1. 列表页面必须参照"每周菜单"页面
2. 表单页面必须参照"新增菜单"页面
3. 使用统一的渐变色头部
4. 使用卡片式布局
5. 保持与其他页面风格一致

### 案例6：未配置功能权限

**错误代码**：
```javascript
// ❌ 错误：上线新功能但没有配置权限
onLoad() {
  // 直接显示创建按钮，没有权限检查
  this.loadData()
}
```

**问题**：
- 没有在权限表中添加权限记录
- 前端没有权限检查逻辑
- 可能导致未授权用户访问
- 安全性差

**正确代码**：
```javascript
// ✅ 正确：配置权限并检查
// 1. 通过 permissionManager 云函数初始化权限
wx.cloud.callFunction({
  name: 'permissionManager',
  data: {
    action: 'updatePermission',
    featureKey: 'announcement:create',
    config: {
      featureName: '创建通知公告',
      description: '创建和发布通知公告',
      enabledRoles: ['馆领导', '部门负责人', '馆员'],
      requireAdmin: false
    }
  }
})

// 2. 前端使用 app.checkPermission() 检查权限
const app = getApp()

onLoad() {
  app.checkPermission('announcement:create').then(hasPermission => {
    this.setData({ hasCreatePermission: hasPermission })
    if (hasPermission) {
      this.loadData()
    }
  })
}
```

**如何避免**：
1. 新增功能前必须通过 permissionManager 云函数配置权限
2. featureKey 使用下划线分隔的格式（如 'announcement_create'）
3. 前端使用 app.checkPermission() 等封装方法检查权限
4. 权限检查失败时友好提示

---

## 12. 工具和配置

### 12.1 ESLint 配置

项目应配置 ESLint 检查：
- 集合名称拼写检查
- 命名风格检查
- 代码质量检查

### 12.2 代码审查流程

1. 编写代码前查阅参考文档
2. 编写代码
3. 自查是否符合规范
4. 使用检查清单确认
5. 提交代码审查
6. 根据反馈修改

---

## 13. 更新和维护

### 13.1 文档更新

当发生以下情况时，必须更新 `DATABASE_COLLECTIONS_REFERENCE.md`：
- 新增数据库集合
- 修改集合字段结构
- 新增或删除索引
- 发现集合命名错误

### 13.2 规范更新

当发现以下情况时，应考虑更新本规范：
- 新的最佳实践
- 频繁出现的错误
- 团队共识的改进

---

## 14. 违规处理

### 14.1 发现违规的处理

当发现代码违反本规范时：
1. 标记违规代码
2. 说明违反的具体规范
3. 提供正确的代码示例
4. 要求立即修改

### 14.2 持续违规的后果

- 代码审查不通过
- 影响团队协作效率
- 可能引入严重 bug
- 增加维护成本

---

## 15. 附录：参考文档

1. `DATABASE_COLLECTIONS_REFERENCE.md` - 数据库集合参考
2. `CLOUD_FUNCTIONS_GUIDE.md` - 云函数开发指南
3. `PROJECT_STRUCTURE.md` - 项目结构说明

---

## 16. MCP工具自动执行规范

### 16.1 规范目的

本规范定义了AI助手在使用CloudBase开发微信小程序时，如何自动执行涉及云数据库和云函数的操作，而无需用户手动操作。

**核心理念**：凡是涉及云数据库和云函数的操作，AI助手应自行使用已绑定的CloudBase MCP工具完成，用户只需关注业务逻辑。

### 16.2 适用范围

**数据库操作**：
- ✅ 创建数据库集合（collections）
- ✅ 读取/写入数据库数据
- ✅ 查询数据库记录
- ✅ 更新数据库文档
- ✅ 删除数据库记录
- ✅ 配置数据库安全规则
- ✅ 执行SQL查询（MySQL）

**云函数操作**：
- ✅ 创建云函数
- ✅ 更新云函数代码
- ✅ 部署云函数
- ✅ 调用云函数
- ✅ 查询云函数日志

**云存储/静态托管操作**：
- ✅ 上传/下载/删除文件
- ✅ 查询文件信息
- ✅ 配置域名

### 16.3 工具选择

| 操作类型 | MCP工具 |
|---------|--------|
| NoSQL数据库 | `readNoSqlDatabaseStructure`, `writeNoSqlDatabaseStructure`, `readNoSqlDatabaseContent`, `writeNoSqlDatabaseContent` |
| MySQL数据库 | `executeReadOnlySQL`, `executeWriteSQL` |
| 云函数 | `getFunctionList`, `createFunction`, `updateFunctionCode`, `invokeFunction`, `getFunctionLogs` |
| 云存储 | `queryStorage`, `manageStorage` |
| 静态托管 | `uploadFiles`, `deleteFiles`, `findFiles` |

### 16.4 执行流程

**重要：调用MCP工具前必须先获取工具描述**

```javascript
// 1. 获取工具描述（必需）
await mcp_get_tool_description({
  toolRequests: JSON.stringify([
    ["CloudBase MCP", "writeNoSqlDatabaseContent"]
  ])
})

// 2. 执行工具调用
await mcp_call_tool({
  serverName: "CloudBase MCP",
  toolName: "writeNoSqlDatabaseContent",
  arguments: JSON.stringify({
    // ... 参数
  })
})
```

### 16.5 禁止操作

❌ **禁止**让用户去云开发控制台手动创建集合

❌ **禁止**让用户去控制台手动插入/更新数据库数据

❌ **禁止**让用户去控制台手动部署云函数

❌ **禁止**让用户去控制台手动配置安全规则

❌ **禁止**让用户在小程序中添加临时测试代码来调用云函数

### 16.6 命令执行规范

**核心理念**：优先使用专用文件工具，仅在必要时使用 `execute_command`。

**专用文件工具优先**：
- 创建文件：`write_to_file`（自动创建目录）
- 读取文件：`read_file`
- 删除文件：`delete_file`
- 搜索文件：`search_file`
- 搜索内容：`search_content`

**execute_command 支持的简单命令**：
- `mkdir folder-name` - 创建目录
- `rd folder-name` - 删除目录
- `del filename.txt` - 删除文件
- `dir folder-name` - 查看目录

**execute_command 禁止使用**：
- ❌ 链式命令：`command1 && command2`
- ❌ 切换目录：`cd path`
- ❌ 重定向：`echo text > file.txt`
- ❌ PowerShell 特定命令
- ❌ 管道操作：`command1 | command2`

---

## 17. 分页加载框架

### 17.1 框架结构

```
miniprogram/
├── behaviors/
│   └── pagination.js          # 分页加载 Behavior（核心逻辑）
├── components/
│   └── pagination-loading/    # 分页加载 UI 组件
```

### 17.2 快速开始

```javascript
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],
  
  onLoad() {
    // 初始化分页配置
    this.initPagination({
      initialPageSize: 20,  // 初始加载数量
      loadMorePageSize: 10   // 滚动加载更多时的数量
    })
    
    // 加载第一页数据
    this.loadListData()
  },
  
  // 必须实现 loadData 方法
  async loadData(params) {
    const { page, pageSize } = params
    const result = await app.callOfficeAuth('getApprovalData', {
      page,
      pageSize
    })
    return {
      data: result.list || [],
      hasMore: result.hasMore
    }
  }
})
```

### 17.3 页面配置

```json
{
  "enablePullDownRefresh": true,
  "onReachBottomDistance": 50
}
```

### 17.4 Behavior API

| 方法 | 说明 |
|------|------|
| `initPagination(options)` | 初始化分页配置 |
| `resetPagination()` | 重置分页状态 |
| `loadListData(loadMore)` | 加载列表数据 |
| `refreshList()` | 刷新列表 |
| `loadMore()` | 加载更多 |
| `setListData(list, hasMore)` | 设置列表数据 |
| `appendToList(data)` | 追加数据到列表 |
| `updateListItem(id, updates)` | 更新列表项 |
| `removeListItem(id)` | 删除列表项 |

### 17.5 多Tab分页

```javascript
Page({
  behaviors: [paginationBehavior],
  
  data: {
    activeTab: 'pending',
    pagination: {
      pending: { page: 1, hasMore: true },
      mine: { page: 1, hasMore: true },
      done: { page: 1, hasMore: true }
    }
  },
  
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
    if (this.data[tab + 'List'].length === 0) {
      this.loadListData()
    }
  }
})
```

---

## 18. 小程序页面开发规范

### 18.1 相对路径引用规范

创建新页面时，必须正确计算相对于项目根目录的路径：

**路径计算公式**：
```
../ 的数量 = (当前页面深度 - 1) + (目标文件深度)
```

**常用引用路径示例**：

| 当前文件 | 引用文件 | 正确路径 |
|---------|---------|---------|
| `pages/auth/register/register.js` | `util/util.js` | `../../../../util/util.js` (4个../) |
| `pages/office/home/home.js` | `util/util.js` | `../../../util/util.js` (3个../) |
| `pages/office/profile/edit-profile/edit-profile.js` | `util/util.js` | `../../../../util/util.js` (5个../) |

**验证方法**：
1. 创建页面后立即编译，确保没有 "module not defined" 错误
2. 从当前文件位置开始，每向上一级目录添加一个 `../`

### 18.2 app.json 页面注册规范

创建新页面时，必须在 `app.json` 的 `pages` 数组中注册页面路径：

```json
{
  "pages": [
    "pages/office/profile/edit-profile/edit-profile"
  ]
}
```

---

## 19. 消息中心运作机制

### 19.1 消息类型常量

**规则**：消息类型必须在 `initSystemConfig` 云函数中定义常量，禁止硬编码。

**常量定义位置**：
```javascript
// cloudfunctions/initSystemConfig/index.js

{
  type: 'notification',
  key: 'NOTIFICATION_TYPES',
  value: {
    MENU: 'menu',                         // 菜单通知
    NEW_REGISTRATION: 'new_registration', // 新注册申请
    TASK_ASSIGNED: 'task_assigned',       // 任务分配（审批人收到）
    TASK_COMPLETED: 'task_completed',     // 审批完成（申请人收到）
    PROCESS_RETURNED: 'process_returned', // 流程退回（申请人收到）
    WORKFLOW_COMPLETED: 'workflow_completed', // 工作流完成（申请人收到）
    ORDER_TERMINATED: 'order_terminated'  // 工单中止（申请人收到）
  },
  description: '通知消息类型枚举',
  sort: 90
}
```

### 19.2 消息跳转映射配置

**规则**：消息跳转目标 tab 必须在 `NOTIFICATION_TARGET_TAB` 常量中配置。

**跳转映射定义**：
```javascript
// cloudfunctions/initSystemConfig/index.js

{
  type: 'notification',
  key: 'NOTIFICATION_TARGET_TAB',
  value: {
    menu: 'none',              // 菜单通知跳转到详情页，不需要tab
    new_registration: 'pending', // 新注册申请 → 待审批
    task_assigned: 'pending',    // 任务分配 → 待审批
    task_completed: 'mine',      // 审批完成 → 我的发起
    process_returned: 'mine',    // 流程退回 → 我的发起
    workflow_completed: 'mine',  // 工作流完成 → 我的发起
    order_terminated: 'mine'     // 工单中止 → 我的发起
  },
  description: '通知消息类型与跳转tab映射（pending=待审批, mine=我的发起）',
  sort: 91
}
```

### 19.3 消息跳转实现

**跳转机制**：通过全局变量 `app.globalData.targetApprovalTab` 传递目标 tab。

**消息点击处理**：
```javascript
// miniprogram/pages/office/notifications/notifications.js

const constants = require('../../../common/constants.js')

Page({
  handleNotificationTap(e) {
    const id = e.currentTarget.dataset.id
    const notification = this.data.notifications.find(n => n._id === id)

    // 标记为已读
    app.markNotificationAsRead(id, function(success) {
      if (success) {
        this.loadNotifications()
      }
    }.bind(this))

    // 根据通知类型跳转到对应页面
    if (notification) {
      // 从常量获取消息类型和跳转映射
      const NOTIFICATION_TYPES = constants.getConstantSync('NOTIFICATION_TYPES')
      const NOTIFICATION_TARGET_TAB = constants.getConstantSync('NOTIFICATION_TARGET_TAB')

      if (notification.type === NOTIFICATION_TYPES.MENU && notification.menuId) {
        // 菜单通知，跳转到菜单详情页
        wx.navigateTo({
          url: `/pages/office/menu-detail/menu-detail?id=${notification.menuId}`
        })
      } else {
        // 其他通知类型，根据映射跳转到审批中心的对应tab
        const targetTab = NOTIFICATION_TARGET_TAB[notification.type]
        if (targetTab && targetTab !== 'none') {
          // 设置全局变量，通知审批中心切换到指定tab
          app.globalData.targetApprovalTab = targetTab
          wx.switchTab({
            url: '/pages/office/approval/approval'
          })
        }
      }
    }
  }
})
```

### 19.4 审批中心跳转处理

**规则**：审批中心页面 `onShow` 时必须检查 `targetApprovalTab` 并自动切换。

**实现示例**：
```javascript
// miniprogram/pages/office/approval/approval.js

Page({
  onShow() {
    // 检查是否有跳转目标（从消息中心或申请提交跳转过来）
    const targetTab = app.globalData.targetApprovalTab
    if (targetTab) {
      // 清除全局变量
      app.globalData.targetApprovalTab = null
      // 设置目标tab
      this.setData({
        activeTab: targetTab
      })
    }

    // 刷新数据...
  }
})
```

### 19.5 申请提交成功跳转

**规则**：申请提交成功后，应跳转到"我的发起"tab。

**实现示例**：
```javascript
// miniprogram/pages/office/medical-application/medical-application.js

wx.showModal({
  title: '提交成功',
  content: '就医申请已提交，请等待审批。',
  showCancel: false,
  success: () => {
    // 设置跳转目标为"我的发起"tab
    app.globalData.targetApprovalTab = 'mine'
    wx.switchTab({
      url: '/pages/office/approval/approval'
    })
  }
})
```

### 19.6 消息跳转规则表

| 消息类型 | 值 | 接收者 | 跳转目标 | 说明 |
|---------|-----|--------|---------|------|
| `menu` | 菜单通知 | 全员 | 菜单详情页 | 点击查看菜单详情 |
| `new_registration` | 新注册申请 | 管理员 | 待审批 tab | 新用户注册待审批 |
| `task_assigned` | 任务分配 | 审批人 | 待审批 tab | 有新的审批任务 |
| `task_completed` | 审批完成 | 申请人 | 我的发起 tab | 申请已审批完成 |
| `process_returned` | 流程退回 | 申请人 | 我的发起 tab | 申请被退回修改 |
| `workflow_completed` | 工作流完成 | 申请人 | 我的发起 tab | 整个流程已完成 |
| `order_terminated` | 工单中止 | 申请人 | 我的发起 tab | 工单被中止 |

### 19.7 检查清单

- [ ] 消息类型是否在 `initSystemConfig` 云函数中定义
- [ ] 跳转映射是否在 `NOTIFICATION_TARGET_TAB` 中配置
- [ ] 前端是否使用 `constants.getConstantSync()` 获取常量
- [ ] 是否使用 `app.globalData.targetApprovalTab` 传递跳转目标
- [ ] 审批中心 `onShow` 是否检查并切换 tab
- [ ] 申请提交成功是否跳转到"我的发起"

---

## 总结

**核心原则**：
1. 先查阅文档，再编写代码
2. 遵循命名规范，保持一致性
3. 参考现有代码，避免重复错误
4. 重视代码审查，及时修复问题
5. 优先使用专用工具，避免手动操作控制台

**强制要求**：
- ✅ 所有数据库操作必须先查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
- ✅ 新增集合必须更新 `DATABASE_COLLECTIONS_REFERENCE.md`
- ✅ 代码审查前必须使用检查清单
- ✅ 发现违规必须立即修复
- ✅ 所有列表页面必须使用分页加载框架
- ✅ 所有列表页面UI必须参照"每周菜单"页面
- ✅ 所有表单页面UI必须参照"新增菜单"页面
- ✅ 新增功能必须通过 `permissionManager` 云函数配置权限
- ✅ 工作流功能必须在 app.js onLaunch 中自动初始化
- ✅ 云函数修改后必须重新部署并测试验证
- ✅ 数据库和云函数操作必须使用MCP工具自动完成
- ✅ 文件操作优先使用专用工具，避免使用命令行

记住：规范的目的是提高代码质量和团队协作效率，不是为了限制创造性！
