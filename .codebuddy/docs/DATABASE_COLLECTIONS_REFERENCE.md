# CloudBase 数据库集合参考

## 概述

本文档列出了项目中所有数据库集合的详细信息，包括集合名称、用途、字段结构、索引、安全规则等。

**重要**：所有新增功能涉及数据库操作时，必须先参考本文档！如果需要新的集合，请添加到本文档中。

---

## 安全规则说明

### aclTag 权限类别

| aclTag | 名称 | 说明 |
|--------|------|------|
| `ADMINONLY` | 仅管理员可读写 | 只有管理员可以读取和写入数据 |
| `ADMINWRITE` | 管理员可写 | 所有用户可读，仅管理员可写 |
| `READONLY` | 只读 | 所有用户可读，仅创建者可写 |
| `PRIVATE` | 私有 | 仅创建者（及管理员）可读写 |
| `CUSTOM` | 自定义 | 使用自定义安全规则 |

### 权限配置要求

**重要**：所有新增数据库集合必须在以下两处配置安全规则：
1. 本文档的集合定义中添加 `aclTag` 字段
2. `cloudfunctions/initDatabase/index.js` 的 `REQUIRED_COLLECTIONS` 数组中添加 `aclTag`

---

## 索引管理说明

### 索引类型

| 索引类型 | 说明 | 适用场景 |
|----------|------|----------|
| 单字段索引 | 对单个字段建立索引 | 经常单独查询的字段 |
| 组合索引 | 对多个字段建立组合索引 | 经常同时查询多个字段 |
| 唯一索引 | 字段值必须唯一 | 工单编号、用户标识等 |

### 索引配置要求

**重要**：所有新增数据库集合必须在以下两处配置索引：
1. 本文档的集合定义中添加索引说明
2. `cloudfunctions/initDatabase/index.js` 的 `REQUIRED_COLLECTIONS` 数组中添加 `indexes` 字段

### 索引设计原则

1. **根据查询创建索引**：索引应基于实际查询模式创建
2. **避免过度索引**：每个索引都会占用存储空间并影响写入性能
3. **组合索引顺序**：将等值查询的字段放在前面，范围查询的字段放在后面
4. **排序优化**：如果查询包含排序，考虑将排序字段加入索引

---

## 集合列表

### 1. announcements - 通知公告

**用途**：存储系统通知公告

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：0

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的工作订单 ID
  title: String,                   // 通知标题
  content: String,                 // 通知内容
  type: String,                   // 通知类型：'urgent'（紧急）| 'important'（重要）| 'normal'（普通）
  publisherId: String,             // 发布者 openid
  publisherName: String,           // 发布者姓名
  publishedAt: Number,             // 发布时间戳
  status: String,                 // 状态：'published'（已发布）| 'revoked'（已撤回）
  readCount: Number,               // 阅读次数
  readUsers: Array[String],         // 已读用户 openid 列表
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 2. menu_comments - 菜单评论

**用途**：存储每周菜单的用户评论

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：2

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  menuId: String,                  // 关联的菜单 ID
  openid: String,                  // 评论者 openid
  content: String,                 // 评论内容
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 3. menus - 每周菜单

**用途**：存储每周菜单信息

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：2

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  week: String,                    // 周数，如 "2026-W12"
  startDate: String,               // 周起始日期
  endDate: String,                 // 周结束日期
  meals: Array,                    // 餐次列表
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 4. notifications - 用户通知

**用途**：存储用户个人通知（如审批通知、系统通知等）

**安全规则**：`PRIVATE` - 仅创建者可读写（用户只能看到自己的通知）

**记录数**：4

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `openid_createdAt_idx` - 组合索引：openid（升序）+ createdAt（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                  // 接收者 openid
  type: String,                   // 通知类型：'approval'（审批）| 'announcement'（公告）| 'system'（系统）
  title: String,                  // 通知标题
  content: String,                 // 通知内容
  announcementId: String,          // 关联的公告 ID（可选）
  read: Boolean,                   // 是否已读
  createdAt: Number                // 创建时间戳
}
```

---

### 5. office_registration_requests - 用户注册请求

**用途**：存储用户注册申请

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：0

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `status_updatedAt_idx` - 状态 + 更新时间复合索引
- `openid_idx` - 用户 openid 索引

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                  // 申请者 openid
  status: String,                 // 状态：'pending'（待审批）| 'approved'（已通过）| 'rejected'（已拒绝）
  formData: Object,                // 申请表单数据
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}

**formData 字段结构**：
```javascript
{
  name: String,                   // 姓名
  gender: String,                 // 性别：'男' | '女'
  birthday: String,               // 生日
  role: String,                   // 角色：'馆领导' | '部门负责人' | '馆员' | '工勤' | '物业' | '配偶' | '家属'
  position: String,               // 职位
  isAdmin: Boolean,              // 是否管理员
  relativeName: String,           // 关系人姓名（紧急联系人）
  department: String              // 部门：'政治处' | '新公处' | '经商处' | '科技处' | '武官处' | '领侨处' | '文化处' | '办公室' | '党委办'
}
```

---

### 6. office_users - 办公系统用户

**用途**：存储注册用户信息

**安全规则**：`ADMINONLY` - 仅管理员可读写

**记录数**：3

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                  // 用户 openid（唯一标识）
  name: String,                   // 姓名
  phone: String,                  // 电话号码
  email: String,                  // 邮箱地址
  gender: String,                  // 性别：'男' | '女'
  birthday: String,                // 生日
  role: String,                   // 角色：'admin'（管理员）| 'department_head'（部门负责人）| 'accountant_supervisor'（会计主管）| 'library_leader'（馆领导）| '馆员'
  position: String,                // 职位
  isAdmin: Boolean,                // 是否管理员
  status: String,                 // 状态：'approved'（已通过）| 'pending'（待审批）| 'rejected'（已拒绝）
  avatarText: String,              // 头像文字（取姓名第一个字）
  relativeName: String,            // 关系人姓名（紧急联系人）
  department: String               // 部门：'政治处' | '新公处' | '经商处' | '科技处' | '武官处' | '领侨处' | '文化处' | '办公室' | '党委办'
  createdAt: Number,               // 创建时间戳
  updatedAt: Number,               // 更新时间戳
  approvedAt: Number               // 审批通过时间戳
}
```

---

### 7. permissions - 权限配置

**用途**：存储功能权限配置

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：2

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  featureKey: String,             // 功能标识（如 'medical_application'）
  featureName: String,            // 功能名称（如 '就医申请'）
  allowedRoles: Array[String],     // 允许访问的角色列表
  description: String,             // 功能描述
  status: String,                 // 状态：'active'（启用）| 'disabled'（禁用）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 8. sys_config - 系统配置

**用途**：存储系统配置常量（角色选项、部门选项、医疗机构等）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：动态

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  type: String,                   // 配置类型：'role' | 'department' | 'institution' 等
  key: String,                    // 配置键名（如 'ROLE_OPTIONS', 'DEPARTMENTS'）
  value: Any,                     // 配置值（可以是数组、对象等）
  description: String,            // 配置描述
  sort: Number,                   // 排序权重
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**常用配置项**：
| type | key | 说明 |
|------|-----|------|
| role | ROLE_OPTIONS | 角色选项列表 |
| department | DEPARTMENTS | 部门选项列表 |
| institution | MEDICAL_INSTITUTIONS | 医疗机构列表 |
| relation | RELATION_OPTIONS | 关系选项列表 |
| role_field_mapping | ROLE_FIELD_VISIBILITY | 角色字段显示映射 |

---

### 9. work_orders - 工作订单（重要：不是 workflow_orders）

**用途**：存储工作流工单记录

**安全规则**：`PRIVATE` - 仅创建者可读写

**记录数**：4

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `idx_applicantId` - 申请人 ID 索引
- `idx_orderType` - 工单类型索引
- `idx_status` - 状态索引
- `idx_createTime` - 创建时间索引（降序）
- `idx_updateTime` - 更新时间索引（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderNo: String,                 // 工单编号（唯一）
  orderType: String,               // 工单类型（如 'medical_application', 'notification_publish'）
  templateId: String,              // 关联的模板 ID
  templateVersion: Number,          // 模板版本
  businessData: Object,            // 业务数据（根据工单类型不同）
  currentStep: Number,             // 当前步骤编号
  needSupplement: Boolean,         // 是否需要补充材料
  supplementCount: Number,          // 补充次数
  workflowStatus: String,           // 工作流状态：'pending'（待处理）| 'in_progress'（进行中）| 'completed'（已完成）| 'rejected'（已拒绝）| 'returned'（已退回）
  workflowSnapshot: Object,         // 工作流模板快照（包含 steps 等）
  initiatorId: String,             // 发起人 openid
  initiatorName: String,           // 发起人姓名
  initiatorRole: String,            // 发起人角色
  completedAt: Number,             // 完成时间戳
  createdAt: Number,               // 创建时间戳
  startedAt: Number,               // 开始时间戳
  submittedAt: Number,             // 提交时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 10. workflow_logs - 工作流日志

**用途**：记录工作流操作日志

**安全规则**：`PRIVATE` - 仅创建者可读写

**记录数**：7

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `idx_action` - 操作类型索引
- `idx_operatorId` - 操作人 ID 索引
- `idx_orderId` - 工单 ID 索引
- `idx_operateTime` - 操作时间索引（降序）
- `idx_eventType` - 事件类型索引

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的工单 ID
  action: String,                  // 操作类型：'submit'（提交）| 'approve'（同意）| 'reject'（拒绝）| 'return'（退回）| 'supplement'（补充）| 'revoke'（撤回）
  operatorId: String,              // 操作人 openid
  operatorName: String,            // 操作人姓名
  operateTime: Number,             // 操作时间戳
  eventType: String,               // 事件类型：'task_assigned'（任务分配）| 'task_completed'（任务完成）| 'order_status_changed'（状态变更）
  templateId: String,              // 模板 ID（可选）
  description: String,             // 操作描述
  createdAt: Number                // 创建时间戳
}
```

---

### 11. workflow_subscriptions - 工作流订阅配置

**用途**：存储订阅消息模板配置

**安全规则**：`PRIVATE` - 仅创建者可读写

**记录数**：4

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `idx_templateId` - 模板 ID 索引
- `idx_eventType` - 事件类型索引

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  templateId: String,              // 订阅消息模板 ID（如 'y1bXHAg_oDuvrQ3pHgcODcMPl-2hZHenWugsqdB2CXY'）
  notifyType: String,              // 通知类型：'process_submitted'（流程提交）| 'process_approved'（流程通过）| 'process_returned'（流程退回）
  orderType: String,               // 工单类型（可选）
  pagePath: String,                // 跳转页面路径
  dataMapping: Object,             // 消息数据映射
  status: String,                 // 状态：'active'（启用）| 'disabled'（禁用）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 12. workflow_tasks - 工作流任务

**用途**：存储工作流任务（审批任务）

**安全规则**：`PRIVATE` - 仅创建者可读写

**记录数**：18

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `idx_approverId` - 审批人 ID 索引
- `idx_orderId` - 工单 ID 索引
- `idx_status` - 状态索引
- `idx_assignTime` - 分配时间索引（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的工单 ID
  templateId: String,              // 模板 ID
  stepId: String,                  // 步骤 ID（如 'step_1'）
  stepName: String,                // 步骤名称
  approverId: String,              // 审批人 openid
  approverName: String,            // 审批人姓名
  status: String,                 // 状态：'pending'（待审批）| 'approved'（已同意）| 'rejected'（已拒绝）| 'returned'（已退回）
  assignTime: Number,              // 分配时间戳
  completeTime: Number,             // 完成时间戳
  approvalComment: String,          // 审批意见
  timeout: Number,                 // 超时时间（小时）
  timeoutAction: String,            // 超时动作：'remind'（提醒）| 'auto_approve'（自动通过）| 'auto_reject'（自动拒绝）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 13. workflow_templates - 工作流模板

**用途**：存储工作流模板配置

**安全规则**：`PRIVATE` - 仅创建者可读写

**记录数**：3

**索引**：
- `_openid` - 用户 openid（云开发自动创建）
- `_id` - 记录 ID（云开发自动创建）
- `idx_name_version` - 名称 + 版本复合索引（唯一）
- `idx_status` - 状态索引
- `idx_createTime` - 创建时间索引（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  name: String,                   // 模板名称
  code: String,                   // 模板代码（唯一，如 'medical_application', 'notification_publish'）
  version: Number,                // 版本号
  description: String,             // 模板描述
  category: String,                // 分类：'approval'（审批）| 'notification'（通知）
  steps: Array,                   // 审批步骤列表（可为空数组，表示0步审批）
  displayConfig: Object,           // 字段显示配置（可选）
    - cardFields: Array           // 卡片列表显示字段
    - detailFields: Array         // 详情页显示字段
  defaultTimeout: Number,          // 默认超时时间（小时）
  notifyOnSubmit: Boolean,         // 提交时是否通知
  notifyOnComplete: Boolean,        // 完成时是否通知
  notifyOnTimeout: Boolean,        // 超时时是否通知
  status: String,                 // 状态：'active'（启用）| 'disabled'（禁用）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**displayConfig 结构说明**：
```javascript
{
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
      condition: { field: 'institution', value: '其他' }  // 当 institution === '其他' 时显示
    }
  ]
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

**steps 数组结构**（审批步骤）：
```javascript
{
  stepNo: Number,                 // 步骤编号
  stepName: String,               // 步骤名称
  stepType: String,               // 步骤类型：'serial'（串行）
  approverType: String,           // 审批人类型：'role'（角色）| 'user'（指定用户）
  approverConfig: Object,          // 审批人配置
    - roleIds: Array[String]      // 角色列表（approverType='role' 时）
    - userIds: Array[String]      // 用户 openid 列表（approverType='user' 时）
  approvalStrategy: String,        // 审批策略：'sequential'（串行）| 'parallel'（并行）
  canReject: Boolean,            // 是否可以拒绝
  canReturn: Boolean,            // 是否可以退回
  returnTo: Number,              // 退回到哪个步骤（0 表示第一步）
  timeout: Number,               // 超时时间（小时）
  timeoutAction: String,         // 超时动作：'remind'（提醒）| 'auto_approve'（自动通过）| 'auto_reject'（自动拒绝）
}
```

---

## 命名规范

### 集合命名规则

1. **使用小写字母和下划线**
   - ✅ `work_orders`
   - ❌ `workflowOrders` 或 `WorkflowOrders`

2. **使用复数形式**
   - ✅ `work_orders`, `notifications`, `users`
   - ❌ `work_order`, `notification`, `user`

3. **避免缩写**
   - ✅ `workflow_templates`
   - ❌ `wf_tmpls`

4. **保持一致性**
   - 同一模块使用相同前缀
   - ✅ `workflow_templates`, `workflow_logs`, `workflow_tasks`

### 字段命名规则

1. **使用驼峰命名法（camelCase）**
   - ✅ `createdAt`, `updatedAt`, `publisherName`
   - ❌ `created_at`, `updated_at`, `publisher_name`

2. **使用有意义的名称**
   - ✅ `currentStep`, `needSupplement`
   - ❌ `cs`, `ns`

3. **布尔值使用 is/has 前缀**
   - ✅ `isAdmin`, `hasPermission`, `needSupplement`
   - ❌ `admin`, `permission`, `supplement`

---

## 常见错误示例

### ❌ 错误1：使用不存在的集合

```javascript
// 错误：集合名称不正确
const workflowOrdersCollection = db.collection('workflow_orders')  // ❌

// 正确：使用实际存在的集合
const workOrdersCollection = db.collection('work_orders')  // ✅
```

### ❌ 错误2：使用错误的复数形式

```javascript
// 错误：使用单数
const notificationCollection = db.collection('notification')  // ❌

// 正确：使用复数
const notificationsCollection = db.collection('notifications')  // ✅
```

### ❌ 错误3：字段命名不一致

```javascript
// 错误：混用命名风格
{
  created_at: 1234567890,  // ❌ 蛇形命名
  publisherName: '张三',    // ✅ 驼峰命名
  read_count: 5           // ❌ 蛇形命名
}

// 正确：统一使用驼峰命名
{
  createdAt: 1234567890,    // ✅
  publisherName: '张三',      // ✅
  readCount: 5              // ✅
}
```

---

## 新增集合流程

当需要新增集合时，按以下步骤操作：

1. **检查本文档**
   - 确认确实需要新集合
   - 确认没有相似用途的现有集合

2. **命名设计**
   - 遵循命名规范
   - 使用复数形式
   - 使用小写字母和下划线

3. **定义结构**
   - 列出所有字段
   - 定义字段类型
   - 添加索引说明

4. **添加到本文档**
   - 在"集合列表"部分添加新集合
   - 包含用途、字段结构、索引等信息

5. **代码实现**
   - 创建集合（在控制台或通过代码）
   - 添加索引（如需要）
   - 测试集合操作

---

## 更新日志

| 日期 | 修改内容 | 修改人 |
|------|---------|--------|
| 2026-03-15 | 创建文档，列出所有现有集合 | AI |
| 2026-03-15 | 添加工作流相关集合详细信息 | AI |
| 2026-03-15 | 修正 announcementManager 中的集合名称错误 | AI |
| 2026-03-18 | 添加安全规则说明和各集合的 aclTag | AI |
| 2026-03-18 | 添加 sys_config 集合描述 | AI |
| 2026-03-18 | 添加索引管理说明，更新各集合索引信息 | AI |
| 2026-03-18 | 修正 announcements、menus、notifications 安全规则 | AI |
| 2026-03-18 | 添加 workflow_templates 的 displayConfig 字段说明 | AI |

---

## 附录：数据库链接

**云开发控制台**：
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
```

**集合列表**：
- [announcements](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/announcements)
- [menu_comments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menu_comments)
- [menus](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menus)
- [notifications](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/notifications)
- [office_registration_requests](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/office_registration_requests)
- [office_users](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/office_users)
- [permissions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/permissions)
- [sys_config](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/sys_config)
- [work_orders](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/work_orders)
- [workflow_logs](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_logs)
- [workflow_subscriptions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_subscriptions)
- [workflow_tasks](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_tasks)
- [workflow_templates](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates)
