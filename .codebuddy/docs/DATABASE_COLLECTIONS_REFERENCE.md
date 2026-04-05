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

**重要**：所有新增数据库集合必须在本文档的集合定义中添加 `aclTag` 字段，并通过 CloudBase 控制台或 MCP 工具配置安全规则。

---

## 索引管理说明

### 索引类型

| 索引类型 | 说明 | 适用场景 |
|----------|------|----------|
| 单字段索引 | 对单个字段建立索引 | 经常单独查询的字段 |
| 组合索引 | 对多个字段建立组合索引 | 经常同时查询多个字段 |
| 唯一索引 | 字段值必须唯一 | 工单编号、用户标识等 |

### 索引配置要求

**重要**：所有新增数据库集合必须在本文档的集合定义中添加索引说明，并通过 CloudBase 控制台或 MCP 工具创建索引。

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

- `_id` - 记录 ID（云开发自动创建）
- `idx_menuId_createdAt` - 组合索引：menuId（升序）+ createdAt（升序）- 优化菜单评论查询

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

- `_id` - 记录 ID（云开发自动创建）
- `idx_createdAt` - 创建时间索引（降序）- 优化菜单列表查询

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

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：通知记录由云函数创建（而非用户），`PRIVATE` 规则会导致用户无法查看自己的通知。使用 `READONLY` 规则，用户可读取所有通知，云函数以管理员权限写入。前端通过 `openid` 字段过滤只显示当前用户的通知。

**记录数**：4

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_openid_createdAt` - 组合索引：openid（升序）+ createdAt（降序）- 优化消息列表查询

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

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：工单由云函数创建，`PRIVATE` 规则会导致申请人无法查看自己的工单。使用 `ADMINWRITE` 规则，用户可读取所有工单，云函数以管理员权限写入。前端通过 `initiatorId` 过滤只显示当前用户的工单。

**记录数**：4

**索引**：

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

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：日志由云函数创建，`PRIVATE` 规则会导致用户无法查看工单操作历史。使用 `ADMINWRITE` 规则，用户可读取日志查看审批流程。

**记录数**：7

**索引**：

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

### 11. workflow_tasks - 工作流任务

**用途**：存储工作流任务（审批任务）

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：任务由云函数创建，`PRIVATE` 规则会导致审批人无法查看分配给自己的任务。使用 `ADMINWRITE` 规则，用户可读取所有任务，前端通过 `approverId` 过滤只显示当前用户的待办。

**记录数**：18

**索引**：

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

### 12. workflow_templates - 工作流模板

**用途**：存储工作流模板配置

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：模板用于提交工单时查询，`PRIVATE` 规则会导致用户无法提交工单。使用 `ADMINWRITE` 规则，用户可读取模板列表。

**记录数**：3

**索引**：

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

### 13. trip_reports - 外出报备记录

**用途**：存储用户外出报备记录，支持同行人代报备功能

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：使用 READONLY 规则，用户可以提交自己的报备（前端创建），所有人可读以便 Dashboard 权限过滤。前端按角色过滤显示数据。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_openid_status` - openid + status 组合索引 - 优化用户出行记录查询
- `idx_departAt` - departAt 降序索引 - 优化时间排序查询
- `idx_department` - department 索引 - 优化 Dashboard 部门筛选

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 创建者 openid（READONLY 规则检查此字段）
  userName: String,               // 用户姓名
  department: String,             // 所属部门（用于 Dashboard 过滤）
  destination: String,            // 目的地
  companions: String,             // 同行人（多个用空格分隔）
  plannedReturnAt: Number,        // 计划返回时间戳
  travelMode: String,             // 出行方式：'自驾' | '搭车' | '打车' | '步行'
  departAt: Number,               // 外出时间戳
  returnAt: Number,               // 实际返回时间戳（null 表示未返回）
  status: String,                 // 状态：'out'（外出中）| 'returned'（已返回）| 'overtime'（超时）
  overtimeNotified: Boolean,      // 是否已发送超时通知
  createdByOpenid: String,        // 代报备人 openid（为 null 表示自己报备）
  createdByName: String,          // 代报备人姓名（为 null 表示自己报备）
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**代报备说明**：
- 当用户A报备外出时，输入同行人B（为系统注册用户）
- 系统会自动为B创建一条报备记录，设置 `createdByOpenid` 和 `createdByName` 字段
- B的 `companions` 字段会包含本次出行的其他所有人（A + 其他同行人）
- 返回报备时只更新当前用户自己的记录，同行人需自行报备返回

---

### 14. holiday_configs - 节假日配置

**用途**：存储节假日日期配置，用于日历组件显示"休"角标

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_year` - 年份索引 - 优化按年份查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  year: Number,                   // 配置年份（如 2026）
  dates: Array[String],           // 节假日日期数组 ['2026-01-01', '2026-01-02', ...]
  createdBy: String,              // 创建者 openid
  createdByName: String,          // 创建者姓名
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**使用说明**：
- 每年一条记录，包含该年所有节假日日期
- 日期格式为 `YYYY-MM-DD`
- 日历组件根据此数据显示"休"角标

---

### 15. calendar_schedules - 日程记录

**用途**：存储用户日程数据

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_creatorId_startDate` - 创建者 + 开始日期组合索引
- `idx_startDate` - 开始日期索引

**字段结构**：
```javascript
{
  _id: String,              // 记录 ID（自动生成）
  title: String,            // 日程标题
  isAllDay: Boolean,        // 是否全天
  startDate: String,        // 开始日期 YYYY-MM-DD
  endDate: String,          // 结束日期 YYYY-MM-DD
  startTime: String,        // 开始时间 HH:mm（非全天）
  endTime: String,          // 结束时间 HH:mm（非全天）
  type: String,             // 类型：'meeting'|'training'|'visit'|'banquet'|'other'
  typeName: String,         // 类型显示名
  color: String,            // 颜色值
  repeat: String,           // 重复：'none'|'daily'|'weekly'|'monthly'|'workdayDaily'|'workdayWeekly'
  repeatEndDate: String,    // 重复截止日期 YYYY-MM-DD（仅当 repeat !== 'none' 时有效）
  location: String,         // 地点（可选）
  description: String,      // 备注（可选）
  creatorId: String,        // 创建者 openid
  creatorName: String,      // 创建者姓名
  createdAt: Number,        // 创建时间戳
  updatedAt: Number         // 更新时间戳
}
```

**类型配置**：
| type | typeName | color |
|------|----------|-------|
| meeting | 会议 | #3B82F6 |
| training | 培训 | #10B981 |
| visit | 会见 | #8B5CF6 |
| banquet | 宴请 | #F59E0B |
| other | 其他 | #6B7280 |

**重复类型说明**：
| repeat | 说明 |
|--------|------|
| none | 不重复（默认） |
| daily | 每天重复 |
| weekly | 每周同星期几重复 |
| monthly | 每月同日期重复 |
| workdayDaily | 工作日每天重复（排除节假日和周末） |
| workdayWeekly | 工作日每周重复（仅工作日） |

**重复截止日期规则**：
- 当 `repeat !== 'none'` 时，`repeatEndDate` 必填
- 有效范围：`startDate` 至当年最后一天（如 2026-12-31）
- 工作日类型依赖 `holiday_configs` 集合的节假日配置

---

### 16. feedback_posts - 意见反馈帖子

**用途**：存储用户提交的意见反馈

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_createdAt` - 创建时间索引（降序）- 优化意见列表查询

**字段结构**：
```javascript
{
  _id: String,              // 记录 ID（自动生成）
  openid: String,           // 提交者 openid
  authorName: String,       // 提交者姓名
  content: String,          // 意见内容
  createdAt: Number         // 创建时间戳
}
```

---

### 17. feedback_replies - 意见反馈回复

**用途**：存储管理员对意见反馈的回复

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_postId_createdAt` - 组合索引：postId（升序）+ createdAt（升序）- 优化回复列表查询

**字段结构**：
```javascript
{
  _id: String,              // 记录 ID（自动生成）
  postId: String,           // 关联的意见帖子 ID
  openid: String,           // 回复者 openid
  authorName: String,       // 回复者姓名
  isAdmin: Boolean,         // 是否为管理员回复
  content: String,          // 回复内容
  createdAt: Number         // 创建时间戳
}
```

---

### 18. meeting_room_reservations - 会议室预约

**用途**：存储会议室预约记录

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_roomId_date` - 组合索引：roomId + date - 优化会议室预约查询
- `idx_creatorId` - 创建者索引

**字段结构**：
```javascript
{
  _id: String,              // 记录 ID（自动生成）
  title: String,            // 预约标题/会议名称
  roomId: String,           // 会议室 ID
  roomName: String,         // 会议室名称
  date: String,             // 预约日期 YYYY-MM-DD
  startTime: String,        // 开始时间 HH:mm
  endTime: String,          // 结束时间 HH:mm
  description: String,      // 备注（可选）
  creatorId: String,        // 创建者 openid
  creatorName: String,      // 创建者姓名
  creatorRole: String,      // 创建者角色
  createdAt: Number,        // 创建时间戳
  updatedAt: Number         // 更新时间戳
}
```

---

### 19. schedule_subscriptions - 日程订阅

**用途**：存储用户对日程的订阅关系

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_userId` - 用户索引 - 查询用户订阅列表
- `idx_scheduleId` - 日程索引 - 查询日程订阅者

**字段结构**：
```javascript
{
  _id: String,              // 记录 ID（自动生成）
  scheduleId: String,       // 订阅的日程 ID
  userId: String,           // 订阅者 openid
  createdAt: Number         // 创建时间戳
}
```

---

### 20. passport_info - 护照信息

**用途**：存储用户的护照信息（由用户自行录入）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：用户通过云函数 `passportManager` 管理护照信息（添加、更新、删除），云函数以管理员权限写入。使用 `READONLY` 规则，用户可查看自己的护照信息，便于护照过期检查。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_openid` - 用户 openid 索引 - 查询用户护照列表
- `idx_expiryDate` - 有效期索引 - 护照过期检查

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                  // 所属用户 openid
  ownerName: String,               // 持有人姓名
  gender: String,                  // 性别：'男' | '女'
  passportNo: String,              // 护照号
  issueDate: String,               // 签发日期 YYYY-MM-DD
  expiryDate: String,              // 有效期至 YYYY-MM-DD
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**业务流程说明**：
1. 用户通过小程序页面录入护照信息
2. 调用 `passportManager.addPassportInfo` 添加护照
3. 定时云函数 `passportExpiryChecker` 检查护照有效期
4. 即将过期（180天内）时发送通知提醒用户

---

### 21. passport_records - 护照借用记录

**用途**：存储护照借用记录，审批通过后自动创建

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：借用记录由云函数创建（审批通过后自动创建），使用 `ADMINWRITE` 规则，用户可读取自己的借用记录。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_applicantId` - 申请人 ID 索引
- `idx_borrowerOpenids` - 借用人 openid 索引
- `idx_status` - 状态索引
- `idx_borrowedAt` - 借用时间索引（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                // 关联的工单 ID
  orderNo: String,                // 工单编号
  // 申请人信息
  applicantId: String,            // 申请人 openid
  applicantName: String,          // 申请人姓名
  // 借用的护照信息
  borrowerNames: Array[String],   // 借用人姓名列表
  borrowerOpenids: Array[String], // 借用人 openid 列表
  borrowerInfoList: Array[Object],// 借用人详细信息列表 [{ name, openid }]
  // 借用信息
  borrowDate: String,             // 借用日期 YYYY-MM-DD
  expectedReturnDate: String,     // 预计归还日期 YYYY-MM-DD
  reason: String,                 // 借用原因
  // 状态
  status: String,                 // 状态：'borrowed'（借用中）| 'returned'（已归还）
  // 借用操作信息
  borrowedAt: Number,             // 借用审批通过时间戳
  borrowedBy: String,             // 审批人 openid
  borrowedByName: String,         // 审批人姓名
  // 归还信息（未归还时为 null）
  returnedAt: Number,             // 归还时间戳（null 表示未归还）
  returnedBy: String,             // 归还操作人 openid
  returnedByName: String,         // 归还操作人姓名
  // 时间戳
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务流程说明**：
1. 用户提交护照借用申请 → 创建 `work_orders` 工单
2. 审批通过后 → 工作流引擎自动创建 `passport_records` 记录
3. 归还护照 → 更新 `status` 为 `returned`，记录归还信息

---

### 22. medical_records - 就医申请记录

**用途**：存储审批通过后的就医申请记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：就医记录由云函数创建（审批通过后自动创建），使用 `ADMINWRITE` 规则，用户可读取自己的就医记录用于查看和导出。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_applicantId` - 申请人 ID 索引
- `idx_createdAt` - 创建时间索引（降序）
- `idx_medicalDate` - 就医日期索引（降序）

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                // 关联的工单 ID
  orderNo: String,                // 工单编号
  // 申请人信息
  applicantId: String,            // 申请人 openid
  applicantName: String,          // 申请人姓名
  applicantRole: String,          // 申请人角色
  // 就医信息
  patientName: String,            // 就医人姓名
  relation: String,               // 与申请人关系
  medicalDate: String,            // 就医日期 YYYY-MM-DD
  institution: String,            // 就医机构
  otherInstitution: String,       // 其他机构名称（institution='其他'时）
  reasonForSelection: String,     // 选择此机构的原因
  reason: String,                 // 就医原因
  // 状态
  status: String,                 // 状态：'approved'（已通过）
  // 时间戳
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务流程说明**：
1. 用户提交就医申请 → 创建 `work_orders` 工单
2. 审批通过后 → 工作流引擎自动创建 `medical_records` 记录
3. 用户可查看已通过的就医记录列表，点击查看详情
4. 支持导出PDF（通过 `medicalApplication.generatePdf` 云函数）

**相关云函数**：
- `medicalApplication`：处理就医申请提交、记录查询、详情查看、PDF生成等操作
- `workflowEngine`：审批通过后自动创建 `medical_records` 记录

---

### 23. haircut_appointments - 理发预约记录

**用途**：存储理发预约记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：预约记录由云函数 `haircutManager` 创建和管理，使用 `ADMINWRITE` 规则，用户可读取所有预约记录用于查看时段占用情况。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `date_timeSlot_unique` - 唯一索引：date + timeSlot - 防止同一时段重复预约
- `bookerId_idx` - 预约人 ID 索引 - 查询用户预约记录
- `status_idx` - 状态索引 - 筛选有效/已取消预约

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  date: String,                   // 预约日期 YYYY-MM-DD
  timeSlot: String,               // 预约时段（如 "14:30-15:00"）
  // 预约人信息
  bookerId: String,               // 预约人 openid
  bookerName: String,             // 预约人姓名
  bookerRole: String,             // 预约人角色
  bookerDepartment: String,       // 预约人部门
  // 预约对象
  forSelf: Boolean,               // 是否为自己预约
  actualUserName: String,         // 实际理发人姓名（代约时为被代约人）
  actualUserId: String,           // 实际理发人 openid（代约时）
  // 状态
  status: String,                 // 状态：'booked'（已预约）| 'cancelled'（已取消）
  // 取消信息（未取消时为 null）
  cancelledAt: Number,            // 取消时间戳
  cancelledBy: String,            // 取消操作人 openid
  cancelledByName: String,        // 取消操作人姓名
  cancelReason: String,           // 取消原因
  // 时间戳
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务规则**：
1. 服务时间：周一、三、五下午 14:30~18:00
2. 当日 14:20 后禁止预约当日时段
3. 周五 18:00 后自动切换显示下周日期
4. 节假日自动排除（依赖 `holiday_configs` 集合）
5. 代约显示格式："理发人（代约人）"

**相关云函数**：
- `haircutManager`：处理时段查询、预约创建/取消、列表查询等操作

---

### 24. learning_articles - 学习园地文章

**用途**：存储学习园地模块的文章，支持富文本编辑、图片插入、置顶等功能

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：文章由云函数 `articleManager` 创建和管理。所有用户可发布文章（通过云函数以管理员权限写入），管理员可置顶文章，管理员和文章发布者可删除文章。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_status_createdAt` - 组合索引：status（升序）+ createdAt（降序）- 优化已发布文章列表查询
- `idx_isPinned_pinnedAt` - 组合索引：isPinned（降序）+ pinnedAt（降序）- 优化置顶排序
- `idx_authorId` - 作者 ID 索引 - 查询用户发布的文章

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  title: String,                   // 文章标题（必填，最长100字符）
  content: String,                 // 富文本 HTML 内容
  plainText: String,               // 纯文本摘要（最长200字符，用于列表展示）
  // 作者信息
  authorId: String,                // 发布者 openid
  authorName: String,              // 发布者姓名
  authorAvatar: String,            // 发布者头像 URL（可选）
  // 封面图
  coverImage: String,              // 封面图 URL（可选，取编辑器第一张图）
  // 状态
  isPinned: Boolean,               // 是否置顶
  pinnedAt: Number,                // 置顶时间戳（未置顶时为 0）
  readCount: Number,               // 阅读量
  status: String,                  // 状态：'published'（已发布）| 'deleted'（已删除）
  // 时间戳
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**业务流程说明**：
1. 用户通过发布页（富文本编辑器）创建文章 → 调用 `articleManager.create`
2. 列表页展示已发布文章，按置顶 > 创建时间排序 → 调用 `articleManager.list`
3. 详情页查看文章内容，自动递增阅读量 → 调用 `articleManager.get`
4. 管理员可置顶/取消置顶文章 → 调用 `articleManager.pin`
5. 管理员或文章发布者可删除文章（软删除，更新 status 为 deleted）→ 调用 `articleManager.delete`

**排序规则**：
- 列表排序：`isPinned desc` > `pinnedAt desc` > `createdAt desc`
- 置顶文章始终排在最前面，多个置顶文章按置顶时间倒序

**相关云函数**：
- `articleManager`：处理文章的创建、列表、详情、置顶、删除等操作

---

### 25. user_signatures - 用户签字

**用途**：存储用户的手写签字图片（用于审批申请表PDF导出等场景）

**安全规则**：`PRIVATE` - 仅创建者可读写

> **重要说明**：签字是用户个人数据，使用 `PRIVATE` 规则，用户只能查看和管理自己的签字。云函数（如PDF生成）以管理员权限运行，可绕过安全规则读取任意用户的签字。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_openid` - 用户 openid 索引 - 优化按用户查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 创建者 openid（PRIVATE 规则自动填充）
  fileID: String,                 // 云存储文件 ID
  label: String,                  // 签字标签（如 '签字 1'、'签字 2'）
  index: Number,                  // 排序序号（0 或 1）
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务规则**：
1. 每个用户最多保存 2 个签字
2. 签字图片通过 `signature-pad` 组件手写生成，上传到云存储
3. 云存储路径格式：`signatures/{openid}/{timestamp}_{index}.png`
4. 签字可通过前端 SDK 进行添加、替换、删除操作
5. 审批通过后的PDF导出功能可通过云函数读取用户的签字图片

---

### 26. greenbook_posts - 小绿书帖子

**用途**：存储小绿书模块的用户帖子（图片+文字社交内容）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：帖子由用户通过云函数 `greenbookManager` 创建（云函数以管理员权限写入）。使用 `READONLY` 规则，用户可读取所有帖子，通过 `_openid` 字段过滤"我的帖子"。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引 - 优化"我的帖子"查询
- `idx_category_createdAt` - 组合索引：category（升序）+ createdAt（降序）- 优化分类筛选查询
- `idx_createdAt` - 创建时间索引（降序）- 优化时间排序查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 创建者 openid（READONLY 规则检查此字段）
  // 作者信息
  authorName: String,             // 作者姓名
  authorAvatar: String,           // 作者头像 URL
  // 帖子内容
  title: String,                  // 帖子标题（可选）
  content: String,                // 帖子正文
  images: Array[String],          // 图片 fileID 列表（1~9张）
  imageRatios: Array[Number],     // 图片宽高比列表（与 images 一一对应）
  tags: Array[String],            // 话题标签列表（最多5个）
  category: String,               // 分类：'美食'|'生活'|'出行'|'运动'|'学习'|'分享'
  // 统计
  likeCount: Number,              // 点赞数
  commentCount: Number,           // 评论数
  collectCount: Number,           // 收藏数
  // 时间戳
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务流程说明**：
1. 用户选择图片 + 编辑内容 → 调用 `greenbookManager.create` 创建帖子
2. 列表页按分类筛选、按热度或最新排序 → 调用 `greenbookManager.list`
3. 详情页展示完整内容和评论 → 调用 `greenbookManager.detail`
4. 用户点赞/收藏 → 调用 `greenbookManager.toggleLike` / `toggleCollect`
5. 删除帖子（作者或管理员）→ 同时删除相关评论和点赞/收藏记录

**排序规则**：
- 最新：`createdAt desc`
- 热门：`likeCount desc, createdAt desc`

**相关云函数**：
- `greenbookManager`：处理帖子的创建、列表、详情、删除、点赞、收藏等操作

---

### 27. greenbook_comments - 小绿书评论

**用途**：存储小绿书帖子的评论（支持一级评论和二级回复）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：评论由用户通过云函数 `greenbookManager` 创建。使用 `READONLY` 规则，用户可读取所有评论。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引
- `idx_postId_createdAt` - 组合索引：postId（升序）+ createdAt（降序）- 优化帖子评论列表查询
- `idx_replyToId` - 回复目标索引 - 优化二级回复查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 评论者 openid（READONLY 规则检查此字段）
  // 关联
  postId: String,                 // 关联的帖子 ID
  replyToId: String | null,       // 回复的目标评论 ID（一级评论为 null）
  replyToName: String | null,     // 回复的目标评论者姓名
  // 评论内容
  authorName: String,             // 评论者姓名
  authorAvatar: String,           // 评论者头像 URL
  content: String,                // 评论内容
  // 统计
  likeCount: Number,              // 点赞数
  // 时间戳
  createdAt: Number               // 创建时间戳
}
```

**评论层级说明**：
- **一级评论**：`replyToId` 为 `null`，直接评论帖子
- **二级回复**：`replyToId` 指向某条一级评论，回复该评论者
- 获取评论列表时，后端会自动加载每条一级评论的最近3条回复

**相关云函数**：
- `greenbookManager`：处理评论的添加、删除、列表查询等操作

---

### 28. greenbook_likes - 小绿书点赞与收藏

**用途**：统一存储小绿书模块的点赞和收藏记录（帖子和评论共用）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：点赞/收藏由用户通过云函数 `greenbookManager` 创建。使用 `READONLY` 规则。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引 - 高频访问索引（点赞查询最频繁）
- `idx_targetId_targetType` - 组合索引：targetId（升序）+ targetType（升序）- 优化点赞状态查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 操作者 openid（READONLY 规则检查此字段）
  targetId: String,               // 目标对象 ID（帖子 ID 或评论 ID）
  targetType: String,             // 目标类型：'post'（点赞帖子）| 'comment'（点赞评论）| 'collect'（收藏帖子）
  createdAt: Number               // 创建时间戳
}
```

**targetType 说明**：
| targetType | 含义 | 关联集合 | 影响 |
|------------|------|---------|------|
| `post` | 点赞帖子 | `greenbook_posts` | 帖子 `likeCount` ±1 |
| `comment` | 点赞评论 | `greenbook_comments` | 评论 `likeCount` ±1 |
| `collect` | 收藏帖子 | `greenbook_posts` | 帖子 `collectCount` ±1 |

**业务规则**：
- 切换机制：点赞/收藏为 toggle 操作，已存在则删除（取消），不存在则新增
- 删除帖子时级联删除：同时删除该帖子下所有评论的点赞、帖子的点赞和收藏

**相关云函数**：
- `greenbookManager`：处理点赞切换（`toggleLike`）和收藏切换（`toggleCollect`）

---

### 29. repair_orders - 物业报修记录

**用途**：存储用户提交的物业报修申请

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：报修记录由云函数 `repairManager` 创建和管理。用户可读取所有报修记录（列表页），物业角色可查看全部记录并标记完成。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引 - 优化"我的报修"查询
- `idx_status` - 状态索引 - 优化状态筛选
- `idx_createdAt` - 创建时间索引（降序）- 优化时间排序查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  // 报修人信息
  openid: String,                 // 报修人 openid
  reporterName: String,           // 报修人姓名
  reporterDepartment: String,     // 报修人部门
  // 报修内容
  livingArea: String,             // 居住区
  address: String,                // 报修地址
  content: String,                // 报修内容描述
  images: Array[String],          // 报修图片 fileID 列表（最多3张）
  // 状态
  status: String,                 // 状态：'pending'（待处理）| 'completed'（已完成）
  // 完成信息（未完成时为 null）
  completedAt: Number,            // 完成时间戳（null 表示未完成）
  completedByName: String,        // 完成操作人姓名（物业角色）
  // 时间戳
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务流程说明**：
1. 用户提交报修 → 调用 `repairManager.submit`，状态为 `pending`
2. 物业角色查看全部报修记录 → 调用 `repairManager.getAllList`
3. 用户查看自己的报修记录 → 调用 `repairManager.getMyList`
4. 物业角色标记维修完成 → 调用 `repairManager.complete`，状态更新为 `completed`

**权限规则**：
- 所有注册用户可提交报修
- 用户可查看自己的报修记录
- 仅物业角色（`user.role === '物业'`）可查看全部记录和标记完成

**相关云函数**：
- `repairManager`：处理报修的提交、列表查询、标记完成、历史地址查询等操作

---

### 30. news_articles - 新闻文章

**用途**：存储从巴西主流媒体网站爬取的新闻文章（标题、正文、来源等）

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：新闻由云函数 `newsFetcher` 爬取并写入数据库，所有用户可阅读。使用 `ADMINWRITE` 规则，云函数以管理员权限写入，用户只读。

**记录数**：动态（由定时爬取刷新）

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_source_scrapedAt` - 组合索引：source（升序）+ scrapedAt（降序）- 优化按来源筛选和时间排序查询
- `idx_url` - 原文 URL 唯一索引 - 防止重复抓取同一篇文章

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  title: String,                  // 新闻标题
  summary: String,               // 新闻摘要（截取正文前 150 字符）
  content: String,               // 新闻正文 HTML（经 cheerio 清理后）
  coverImage: String,            // 封面图 URL（可选）
  source: String,                // 新闻来源标识：'g1'（G1 Globo）| 'folha'（Folha de S.Paulo）| 'estadao'（Estadão）
  sourceName: String,            // 来源显示名称：'G1' | 'Folha' | 'Estadão'
  author: String,                // 作者姓名（可选）
  originalUrl: String,           // 原文链接
  publishedAt: String,           // 原文发布日期（ISO 8601 格式，如 '2026-04-02T10:30:00-03:00'）
  category: String,              // 新闻分类（可选，从原文提取）
  scrapedAt: Number,             // 爬取时间戳（毫秒）
  updatedAt: Number              // 更新时间戳
}
```

**业务流程说明**：
1. 定时云函数触发器每 15 分钟调用 `newsFetcher.refresh`
2. `newsFetcher.refresh` 从各新闻源爬取最新文章列表
3. 通过 `originalUrl` 唯一索引去重，已存在的文章不重复写入
4. 前端新闻列表页调用 `newsFetcher.list` 获取新闻（支持按来源筛选、分页）
5. 前端新闻详情页调用 `newsFetcher.detail` 获取完整内容
6. 前端本地缓存 5 分钟，减少云函数调用

**新闻源扩展**：
- 新增新闻源只需在 `cloudfunctions/newsFetcher/index.js` 的 `SOURCES` 注册表中添加配置
- 配置项包括：`id`、`name`、`listUrl`（文章列表页）、`articleSelector`、`itemSelectors`（标题/摘要/链接/日期等选择器）
- 添加后无需修改前端代码，新闻列表页会自动显示新的来源 Tab

**相关云函数**：
- `newsFetcher`：处理新闻的爬取（refresh）、列表查询（list）、详情获取（detail）

**控制台链接**：
- [news_articles](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/news_articles)

---

### 35. menu_ratings - 菜品打分记录

**用途**：存储用户对菜单中各菜品的评分（1-5星），每个用户对同一菜单的同一道菜只能打一次分。

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写。

> **重要说明**：打分记录由 `menuManager` 云函数在用户提交评分时创建。使用 `READONLY` 规则，云函数以管理员权限写入，用户只读。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_menuId_openid_dishName` - 组合索引：menuId（升序）+ openid（升序）+ dishName（升序）- 用于查询某用户对某菜单某菜品的打分及防重复校验
- `idx_menuId_createdAt` - 组合索引：menuId（升序）+ createdAt（降序）- 用于获取某菜单的所有打分记录

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  menuId: String,                 // 关联的菜单 ID（menus._id）
  openid: String,                 // 评分人 openid
  authorOpenid: String,           // 评分人 openid（冗余，与 openid 一致）
  authorName: String,             // 评分人姓名
  dishName: String,               // 菜品名称（从菜单富文本内容中提取）
  score: Number,                  // 评分：1~5 星（整数）
  createdAt: Number               // 提交时间戳（毫秒）
}
```

**业务规则**：
1. 同一 openid + menuId + dishName 组合只能有一条打分记录（唯一约束，云函数层校验）
2. score 取值范围：1 ~ 5 的整数，提交时由云函数校验
3. 菜品名称由前端从菜单富文本 HTML 中智能提取（去标签→按行分割→过滤停用词→去重）
4. 已评过的菜品不可修改分数

**相关云函数**：
- `menuManager.addRating`：提交菜品评分（含防重复校验）
- `menuManager.getRatings`：获取某菜单所有菜品的平均分、评分人数、评分分布、当前用户已评状态

**控制台链接**：
- [menu_ratings](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menu_ratings)

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
| 2026-03-19 | 移除 workflow_subscriptions 集合（订阅消息功能已删除） | AI |
| 2026-03-19 | 修正工作流相关集合安全规则：PRIVATE → ADMINWRITE | AI |
| 2026-03-19 | 添加安全规则重要说明（云函数创建数据的权限问题） | AI |
| 2026-03-21 | 添加 holiday_configs 节假日配置集合 | AI |
| 2026-03-25 | 添加 feedback_posts、feedback_replies、meeting_room_reservations、schedule_subscriptions 集合 | AI |
| 2026-03-27 | 添加 passport_records 护照借用记录集合 | AI |
| 2026-03-27 | 添加 passport_info 护照信息集合 | AI |
| 2026-03-29 | 添加 medical_records 就医申请记录集合 | AI |
| 2026-03-27 | 添加 haircut_appointments 理发预约记录集合 | AI |
| 2026-03-30 | 添加 user_signatures 用户签字集合 | AI |
| 2026-04-01 | 添加 learning_articles 学习园地文章集合 | AI |
| 2026-04-01 | 添加 greenbook_posts、greenbook_comments、greenbook_likes 小绿书集合 | AI |
| 2026-04-01 | 添加 repair_orders 物业报修记录集合 | AI |
| 2026-04-02 | 添加 news_articles 新闻文章集合 | AI |
| 2026-04-03 | 添加 meal_subscriptions 用户订餐状态、meal_adjustments 调整记录集合（餐食管理功能） | AI |
| 2026-04-04 | 添加 side_dish_orders 副食征订单、side_dish_bookings 副食预订记录集合（副食预订/管理功能） | AI |
| 2026-04-05 | 添加 menu_ratings 菜品打分记录集合（菜单详情页菜品评分功能） | AI |

---

### 31. meal_subscriptions - 用户工作餐订阅状态

**用途**：存储用户的工作餐入伙/退伙/停餐状态，每用户一条记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：订阅记录由 `mealManager` 云函数创建和管理。用户通过小程序页面设置入伙状态和调整操作。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_openid` - 唯一索引：openid（每用户仅一条记录）- 用于快速查询当前用户状态
- `idx_status` - 状态索引：status - 筛选特定状态的订阅

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                 // 用户 openid（唯一标识）
  name: String,                   // 用户姓名
  role: String,                   // 角色（馆领导/部门负责人/馆员/工勤等）
  position: String,               // 岗位（会计主管/会计/出纳等）
  isEnrolled: Boolean,            // 是否已入伙
  mealCount: Number,              // 订餐份数（默认1，最大值由业务决定）
  status: String,                 // 当前状态: 'active'(正常) | 'suspended'(停餐中) | 'withdrawn'(已退伙) | 'none'（未入伙）
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**状态流转**：
```
none ──(入伙)──→ active ──(停餐)──→ suspended ──(恢复)──→ active
                    │
                    └─(退伙)──→ withdrawn
                    (withdrawn 可重新 enroll → active)
```

**相关云函数**：
- `mealManager.getMyMealStatus`：获取当前用户订阅状态
- `mealManager.saveMealStatus`：首次保存或更新入伙信息
- `mealManager.submitMealAdjustment`：提交调整申请（同时更新本表 status 字段）

---

### 32. meal_adjustments - 工作餐调整记录

**用途**：存储每次工作餐调整操作的详细记录（入伙、退伙、停餐），管理端用于查看历史

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：调整记录由 `mealManager` 云函数在用户提交调整时自动创建。每条操作生成一条记录。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_createdAt` - 创建时间降序索引 - 管理端列表排序
- `idx_monthKey_createdAt` - 组合索引：monthKey（升序）+ createdAt（降序）- 按月分组查询
- `idx_openid_createdAt` - 组合索引：openid（升序）+ createdAt（降序）- 查询某用户的调整历史

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  openid: String,                 // 操作人 openid
  name: String,                   // 操作人姓名
  adjustmentType: String,         // 类型: 'enroll'(入伙) | 'withdraw'(退伙) | 'suspend'(临时停餐)
  startDate: String,              // 开始日期 YYYY-MM-DD（纯字符串，避免时区问题）
  endDate: String|null,           // 结束日期 YYYY-MM-DD（仅停餐时有值）
  count: Number,                  // 涉及份数
  monthKey: String,                // 月份键 YYYY-MM（用于按月聚合显示）
  remark: String|null,            // 备注（预留字段）
  createdAt: Number               // 提交时间戳
}
```

**adjustmentType 说明**：
| adjustmentType | 含义 | startDate | endDate | count |
|----------------|------|-----------|---------|-------|
| `enroll` | 入伙 | 空 | null | 订餐份数 |
| `withdraw` | 退伙日期 | 退伙开始日期 | null | 退伙份数 |
| `suspend` | 临时停餐 | 停餐开始日期 | 停餐结束日期 | 停餐份数 |

**相关云函数**：
- `mealManager.submitMealAdjustment`：提交时自动创建调整记录
- `mealManager.getAdjustmentList`：管理端获取调整记录列表（分页、倒序）

**控制台链接**：
- [meal_subscriptions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/meal_subscriptions)
- [meal_adjustments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/meal_adjustments)
- [side_dish_orders](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/side_dish_orders)
- [side_dish_bookings](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/side_dish_bookings)

---

### 33. side_dish_orders - 副食征订单

**用途**：存储副食征订信息，由管理岗位人员创建，供普通用户预订

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：征订单由 `mealManager` 云函数创建和管理。用户可读取所有征订单进行预订。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_status_createdAt` - 组合索引：status（升序）+ createdAt（降序）- 优化有效征订单列表查询
- `idx_creatorOpenid` - 创建者 openid 索引

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  title: String,                   // 征订标题
  description: String,             // 副食详情描述
  maxCount: Number,                // 最大预订份数（每人最多可订份数，实际上限为 maxCount*2）
  deadline: String,                // 截止日期 YYYY-MM-DD（纯字符串，避免时区问题）
  creatorOpenid: String,           // 创建者 openid
  creatorName: String,             // 创建者姓名
  status: String,                  // 状态: 'active'(有效) | 'expired'(已截止)
  totalBookedCount: Number,        // 已被预订总份数（冗余字段，便于列表展示）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**业务规则**：
1. 截止日期过后，status 自动变为 expired（前端和云端双重判断）
2. 每人预订上限为 maxCount * 2（允许超额预订以应对需求波动）
3. totalBookedCount 在每次 book/cancel 操作时重新统计更新

**相关云函数**：
- `mealManager.createSideDishOrder`：创建新征订单
- `mealManager.getSideDishOrders`：获取有效征订单列表
- `mealManager.getSideDishBookings`：获取某征订单的预订明细

---

### 34. side_dish_bookings - 副食预订记录

**用途**：存储用户的副食预订记录，每人对每份征订单仅一条有效记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：预订记录由 `mealManager` 云函数在用户提交/取消预订时创建或更新。

**记录数**：动态

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `idx_orderId_openid` - 组合索引：orderId（升序）+ openid（升序）- 快速查询用户对某征订单的预订
- `idx_orderId_status` - 组合索引：orderId（升序）+ status（升序）- 查询某征订单的有效预订
- `idx_openid` - 用户 openid 索引 - 查询用户的所有预订

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的征订单 ID（side_dish_orders._id）
  openid: String,                  // 预订人 openid
  name: String,                    // 预订人姓名
  count: Number,                   // 预订份数（1 ~ maxCount*2）
  status: String,                  // 状态: 'booked'(已预订) | 'cancelled'(已取消)
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**业务规则**：
1. 幂等性：同一用户对同一征订单只有一条有效 booking（status='booked'），重复提交为 update
2. 取消预订时将 status 改为 cancelled，而非删除记录
3. count 范围：1 ≤ count ≤ maxCount*2（maxCount 来自关联的征订单）

**相关云函数**：
- `mealManager.bookSideDish`：提交/修改/取消预订（支持幂等更新）
- `mealManager.getMySideDishBookings`：获取当前用户的预订汇总
- `mealManager.getSideDishBookings`：获取某征订单的所有预订记录（管理端用）

---

## 附录：数据库链接

**云开发控制台**：
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
```

**集合列表**：
- [announcements](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/announcements)
- [calendar_schedules](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/calendar_schedules)
- [feedback_posts](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/feedback_posts)
- [feedback_replies](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/feedback_replies)
- [greenbook_comments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/greenbook_comments)
- [greenbook_likes](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/greenbook_likes)
- [greenbook_posts](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/greenbook_posts)
- [haircut_appointments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/haircut_appointments)
- [holiday_configs](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/holiday_configs)
- [learning_articles](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/learning_articles)
- [medical_records](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/medical_records)
- [meeting_room_reservations](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/meeting_room_reservations)
- [menu_comments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menu_comments)
- [menus](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menus)
- [news_articles](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/news_articles)
- [notifications](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/notifications)
- [office_registration_requests](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/office_registration_requests)
- [office_users](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/office_users)
- [passport_info](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/passport_info)
- [passport_records](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/passport_records)
- [permissions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/permissions)
- [repair_orders](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/repair_orders)
- [schedule_subscriptions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/schedule_subscriptions)
- [sys_config](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/sys_config)
- [trip_reports](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/trip_reports)
- [user_signatures](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/user_signatures)
- [work_orders](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/work_orders)
- [workflow_logs](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_logs)
- [workflow_tasks](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_tasks)
- [workflow_templates](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates)
- [meal_subscriptions](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/meal_subscriptions)
- [meal_adjustments](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/meal_adjustments)
- [menu_ratings](https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/menu_ratings)
