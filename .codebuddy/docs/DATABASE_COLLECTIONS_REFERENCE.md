# CloudBase 数据库集合参考

## 概述

本文档列出了项目中所有数据库集合的详细信息，包括集合名称、用途、字段结构、索引、安全规则等。

**重要**：所有新增功能涉及数据库操作时，必须先参考本文档！如果需要新的集合，请添加到本文档中。

> **环境说明**：当前有效的云环境为 `cloud1-d2gyip4xi1fcf54bd`。本文档列出的集合为 2026-08-31 从该环境实际读取的集合列表（共 17 个，含 2026-09-03 新建的 menu_comments）。
>
> 各集合的「记录数」为 2026-08-31 查询时的快照，会随业务动态变化。

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

### 1. content_form_submissions - 馆内动态提交记录

**用途**：存储用户对馆内动态表单的提交记录，一人一条（upsert 幂等）。

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：提交记录由 `contentFormManager` 云函数在用户提交时创建或更新。

**记录数**：15

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 提交者 openid 索引（云开发自动创建）
- `idx_formId_openid` - 组合索引：formId（升序）+ _openid（升序）- 查询用户对某表单的提交（防重复）
- `idx_formId_submittedAt` - 组合索引：formId（升序）+ submittedAt（降序）- 查询某表单的提交列表

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  formId: String,                 // 关联的表单 ID（content_forms._id）
  _openid: String,                // 提交者 openid
  userName: String,               // 提交者姓名
  role: String,                   // 提交者角色
  position: String|Array,         // 提交者岗位
  answers: Array[{                // 答案明细
    blockId: String,              // 关联的控件 ID
    type: String,                 // 控件类型（对应 blocks[].type）
    value: Any                    // 答案值（随 type 变化：radio/judge 为字符串、checkbox 为数组、side_dish 为数组、activity 为字符串）
  }],
  submittedAt: Number,            // 提交时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务规则**：
1. 一人一条：同一用户对同一表单只有一条记录，重复提交为 update
2. 提交时校验截止时间、必填项、副食份数上限、活动人数上限
3. 取消提交为删除记录（`cancelSubmit`）

**相关云函数**：
- `contentFormManager.submit`：提交/修改答案
- `contentFormManager.cancelSubmit`：取消提交
- `contentFormManager.listSubmissions`：提交者列表
- `contentFormManager.getStats`：统计聚合

---

### 2. content_forms - 馆内动态表单主表

**用途**：存储「馆内动态」系统的内容表单，通过 `blocks[]` 数组统一表达公告、问卷、副食、活动、答题五种形态。发布者通过问卷星式控件（单选/多选/判断/简答/副食/活动/说明文字）自由组合内容：只写标题正文即为公告，添加控件即为问卷/副食/活动/答题。

**安全规则**：`ADMINWRITE` - 所有用户可读，仅云函数可写

> **重要说明**：表单由 `contentFormManager` 云函数创建和管理。发布权限：管理员、馆员可发布；所有注册用户可查看和填写。

**记录数**：1

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_status_createdAt` - 组合索引：status（升序）+ createdAt（降序）- 优化列表查询
- `idx_tag_status_createdAt` - 组合索引：tag（升序）+ status（升序）+ createdAt（降序）- 优化 tag 筛选

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 创建者 openid
  title: String,                  // 标题（必填）
  description: String,            // 正文说明（富文本 HTML，可为空）
  tag: String,                    // 类型：'announcement'(公告) | 'questionnaire'(问卷) | 'side_dish'(副食) | 'activity'(活动) | 'quiz'(答题)
  deadline: Number|null,          // 截止时间戳（公告可为 null）
  blocks: Array[{                 // 控件列表（驱动填写内容）
    id: String,                   // 控件 ID（如 'b_xxx'）
    type: String,                 // 类型：'text'(说明文字) | 'radio'(单选) | 'checkbox'(多选) | 'judge'(判断) | 'textarea'(简答) | 'side_dish'(副食) | 'activity'(活动)
    title: String,                // 题干
    required: Boolean,            // 是否必填
    options: Array[String],       // 选项（radio/checkbox/judge）
    categories: Array[{           // 副食类别（side_dish）
      id: String,                 // 类别 ID
      name: String,               // 类别名称
      maxCount: Number            // 该类别每人最大份数
    }],
    groups: Array[String],        // 报名分组（activity，可选）
    maxRegistrations: Number|null // 人数上限（activity，可选）
  }],
  targetRoles: Array[String],     // 目标角色（限定可见时）
  isTargetOnlyVisible: Boolean,   // 是否仅对目标角色可见
  isAnonymous: Boolean,           // 是否匿名填写（tag 为 questionnaire 时有效）
  maxSubmissions: Number,         // 每人最多填写次数（tag 为 quiz 时有效，默认 1）
  status: String,                 // 状态：'draft'(草稿) | 'published'(已发布) | 'closed'(已关闭)
  readUsers: Array[String],       // 已读用户 openid 列表
  submissionCount: Number,        // 提交人数（冗余字段）
  publishedAt: Number|null,       // 发布时间戳
  createdByName: String,          // 创建者姓名
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务规则**：
1. tag 由发布者在编辑页手动选择，不做系统自动推断
2. 发布权限：管理员（`isAdmin`）或角色为「馆员」的用户
3. 提交记录存于 `content_form_submissions`：`maxSubmissions` 为 1 时一人一条（upsert），大于 1 时同一用户可多次提交（答题场景）
4. 截止时间过后，表单视为已截止（前端和云端双重判断）
5. 目标角色过滤：`isTargetOnlyVisible` 为 true 时，仅 `targetRoles` 包含用户角色的用户可见
6. 匿名填写：`isAnonymous` 为 true 时，提交记录的 `userName` 存为「匿名」，`role`/`position` 置空

**相关云函数**：
- `contentFormManager.create`：创建表单（发布或暂存 draft）
- `contentFormManager.update`：更新表单
- `contentFormManager.delete`：删除表单（级联删除提交记录）
- `contentFormManager.close`：关闭表单
- `contentFormManager.list`：分页列表（支持 tag 筛选、目标角色可见性过滤）
- `contentFormManager.get`：详情（含当前用户提交状态）
- `contentFormManager.submit`：提交/修改答案（一人一条 upsert）
- `contentFormManager.listSubmissions`：提交者列表（含答案明细）
- `contentFormManager.getStats`：统计聚合

---

### 3. haircut_appointments - 理发预约记录

**用途**：存储理发预约记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：预约记录由云函数 `haircutManager` 创建和管理，使用 `ADMINWRITE` 规则，用户可读取所有预约记录用于查看时段占用情况。

**记录数**：12

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_date_timeSlot` - 组合索引：date（升序）+ timeSlot（升序）- 时段排序与防重复
- `idx_bookerId_createdAt` - 组合索引：bookerId（升序）+ createdAt（降序）- 用户预约列表

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

### 4. holiday_configs - 节假日配置

**用途**：存储节假日日期配置，用于日历组件显示"休"角标

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：1

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_year` - year 单字段索引（降序）- 按年份排序

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

### 5. interest_class_reports - 兴趣班备案记录

**用途**：存储用户提交的兴趣班备案记录，支持分级查看（馆领导看全体生效中、部门负责人看本部门生效中、普通用户看自己全部含已结束）。备案不可删除，只能"结束"；编辑备案时结束原记录并新增一条（保留备查历史）。

**安全规则**：`ADMINONLY` - 仅管理员可读写

> **重要说明**：所有数据读写均通过云函数 `interestClassReport` 进行，云函数内部按角色过滤查询范围。集合设为 ADMINONLY，确保数据只能通过云函数访问。

**记录数**：47

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_openid_status` - 组合索引：_openid（升序）+ status（升序）- 优化用户查询自己的备案
- `idx_creatorDepartment_status` - 组合索引：creatorDepartment（升序）+ status（升序）- 优化部门负责人按部门筛选
- `idx_createdAt` - 创建时间索引（降序）- 优化时间排序查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  _openid: String,                // 创建者 openid（云函数自动写入）
  name: String,                   // 参与人姓名（可能与创建者不同，如子女）
  className: String,              // 兴趣班名称
  timeSlot: String,               // 兴趣班时段（文本，如"每周三11:30——12:30"）
  teachingMode: String,           // 教学模式（文本，如"集体教学"/"一对一"）
  companion: String,              // 陪同人（可选）
  remark: String,                 // 备注（可选，如"女儿"）
  creatorName: String,            // 创建者姓名（冗余，列表展示）
  creatorDepartment: String,      // 创建者部门（冗余，部门负责人筛选）
  creatorRole: String,            // 创建者角色（冗余，列表展示）
  status: String,                 // 状态：'active'（生效中）| 'ended'（已结束）
  endedAt: Number,                // 结束时间戳（null/不存在表示生效中）
  createdAt: Number,              // 创建时间戳
  updatedAt: Number               // 更新时间戳
}
```

**业务规则**：
1. 备案不可删除，只能"结束"（设置 status='ended'）
2. 编辑备案 = 结束原记录 + 新增一条记录（保留备查历史）
3. 分级查看：
   - 部门负责人 → 查看本部门人员**生效中**备案
   - 馆领导（非部门负责人）→ 查看全体人员**生效中**备案
   - 其他用户 → 查看自己的**全部**备案（含已结束）
4. 仅创建者可编辑/结束自己的生效中备案

**相关云函数**：
- `interestClassReport.list`：分页查询备案列表（按角色自动过滤范围与状态）
- `interestClassReport.create`：新增备案（status 默认 'active'）
- `interestClassReport.edit`：编辑备案（结束原记录 + 新增新记录）
- `interestClassReport.end`：结束备案（设置 status='ended'）

---

### 6. menu_ratings - 菜品打分记录

**用途**：存储用户对菜单中各菜品的评分（1-5星），每个用户对同一菜单的同一道菜只能打一次分。

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写。

> **重要说明**：打分记录由 `menuManager` 云函数在用户提交评分时创建。使用 `READONLY` 规则，云函数以管理员权限写入，用户只读。

**记录数**：861

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_menuId` - menuId 单字段索引（升序）- 加速菜品评分聚合查询（`getRatings` 按 menuId match 聚合）
- `idx_menuId_openid_dishName` - 组合索引：menuId（升序）+ openid（升序）+ dishName（升序）- 加速 `addRating` 防重复查询（`where({ menuId, openid, dishName })`）

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

---

### 7. menus - 每周菜单

**用途**：存储每周菜单信息

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：8

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `createdAt_-1` - 创建时间索引（降序）- 优化菜单列表查询（`orderBy('createdAt', 'desc')`）

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

### 8. notifications - 用户通知

**用途**：存储用户个人通知（如审批通知、系统通知等）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：通知记录由云函数创建（而非用户），`PRIVATE` 规则会导致用户无法查看自己的通知。使用 `READONLY` 规则，用户可读取所有通知，云函数以管理员权限写入。前端通过 `openid` 字段过滤只显示当前用户的通知。

**记录数**：2305

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `openid_createdAt_idx` - 组合索引：openid（升序）+ createdAt（降序）- 优化消息列表查询

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

### 9. office_users - 办公系统用户

**用途**：存储注册用户信息

**安全规则**：`ADMINONLY` - 仅管理员可读写

**记录数**：94

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 用户 openid 索引（云开发自动创建）
- `openid_unique` - openid 唯一索引（升序）- 用户唯一标识，高频查询
- `idx_reportTo` - reportTo 单字段索引（升序）- 反查谁向该用户报备
- `idx_status` - status 单字段索引（升序）- 状态筛选

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
  role: String,                   // 角色：'馆员' | '其他' | '待赴任馆员' 等
  position: String|Array,         // 岗位（会计主管/会计/出纳等）
  isAdmin: Boolean,                // 是否管理员
  isDepartmentHead: Boolean,       // 是否部门负责人
  isAreaManager: Boolean,          // 是否片长
  isRestrictedLeader: Boolean,     // 是否限制权限（馆员+部门无时有效）
  isExpandedPrivilege: Boolean,    // 是否扩大权限（非领导角色时有效）
  status: String,                 // 状态：'approved'（已通过）| 'deactivated'（已注销）等
  avatarText: String,              // 头像文字（取姓名第一个字）
  relativeName: String,            // 关系人姓名（紧急联系人）
  department: String,              // 部门：'无' | '政' | '新' | '经' | '科' | '武' | '领' | '文' | '办' | '党'
  livingArea: String,              // 居住区域
  reportTo: Array[String],         // 向谁报备（openid 列表）
  createdAt: Number,               // 创建时间戳
  updatedAt: Number,               // 更新时间戳
  approvedAt: Number               // 审批通过时间戳
}
```

---

### 10. permissions - 权限配置

**用途**：存储功能权限配置

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

**记录数**：12

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_createdAt` - createdAt 单字段索引（升序）- 按创建时间排序

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

### 11. sys_config - 系统配置

**用途**：存储系统配置常量（角色选项、部门选项、医疗机构等）

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

**记录数**：36

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_type_key` - 组合唯一索引：type（升序）+ key（升序）- 配置项查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  type: String,                   // 配置类型：'role' | 'department' | 'institution' 等
  key: String,                    // 配置键名（如 'ROLE_OPTIONS', 'DEPARTMENT_OPTIONS'）
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
| role | ROLE_OPTIONS | 角色选项列表（馆员/其他/待赴任馆员） |
| department | DEPARTMENT_OPTIONS | 部门选项列表 |
| role_field_mapping | ROLE_FIELD_VISIBILITY | 角色字段显示映射 |

---

### 12. trip_reports - 外出报备记录

**用途**：存储用户外出报备记录，支持同行人代报备功能

**安全规则**：`READONLY` - 所有用户可读，仅创建者可写

> **重要说明**：使用 READONLY 规则，用户可以提交自己的报备（前端创建），所有人可读以便 Dashboard 权限过滤。前端按角色过滤显示数据。

**记录数**：647

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_departAt` - departAt 单字段索引（降序）- 时间排序
- `idx_openid_departAt` - 组合索引：_openid（升序）+ departAt（降序）- 用户记录查询
- `idx_status_departAt` - 组合索引：status（升序）+ departAt（降序）- 状态筛选+排序

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

### 13. work_orders - 工作订单（重要：不是 workflow_orders）

**用途**：存储工作流工单记录

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：工单由云函数创建，`PRIVATE` 规则会导致申请人无法查看自己的工单。使用 `ADMINWRITE` 规则，用户可读取所有工单，云函数以管理员权限写入。前端通过 `businessData.applicantId` 过滤只显示当前用户的工单。

**记录数**：97

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_createdAt` - createdAt 单字段索引（降序）- 时间排序
- `idx_workflowStatus` - workflowStatus 单字段索引（升序）- 状态筛选
- `idx_orderType` - orderType 单字段索引（升序）- 类型筛选
- `idx_businessData_applicantId` - businessData.applicantId 嵌套字段索引（升序）- 申请人查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderNo: String,                 // 工单编号（唯一）
  orderType: String,               // 工单类型（如 'medical_application', 'notification_publish', 'leave_application'）
  templateId: String,              // 关联的模板 ID
  templateName: String,            // 模板名称
  templateVersion: Number,         // 模板版本
  businessData: Object,            // 业务数据（随工单类型变化；申请人信息存于 businessData.applicantId / applicantName）
  workflowSnapshot: Object,        // 工作流模板快照（{ templateId, version, steps, displayConfig }）
  workflowStatus: String,          // 工作流状态：'pending'（待处理）| 'approved'（已通过）| 'rejected'（已拒绝）| 'supplement'（待补充）等
  currentStep: Number,             // 当前步骤编号
  supplementCount: Number,         // 补充次数
  needSupplement: Boolean,         // 是否需要补充材料
  submittedAt: Number,             // 提交时间戳
  startedAt: Number,               // 开始时间戳
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

---

### 14. workflow_logs - 工作流日志

**用途**：记录工作流操作日志

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：日志由云函数创建，`PRIVATE` 规则会导致用户无法查看工单操作历史。使用 `ADMINWRITE` 规则，用户可读取日志查看审批流程。

**记录数**：303

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_orderId_createdAt` - 组合索引：orderId（升序）+ createdAt（降序）- 工单日志查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的工单 ID
  taskId: String,                  // 关联的任务 ID（可为空）
  stepName: String,                // 步骤名称
  action: String,                  // 操作类型（如 'submit'、'approve'、'reject'、'return' 等）
  operatorType: String,            // 操作人类型：'user' | 'system'
  operatorId: String,              // 操作人 openid（系统操作为 'system'）
  operatorName: String,            // 操作人姓名
  description: String,             // 操作描述
  detail: String,                  // 详情（冗余，与 description 一致）
  beforeData: Object,              // 变更前数据（可选）
  afterData: Object,               // 变更后数据（可选）
  changes: Object,                 // 变更内容（可选）
  createdAt: Number                // 创建时间戳
}
```

---

### 15. workflow_tasks - 工作流任务

**用途**：存储工作流任务（审批任务）

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：任务由云函数创建，`PRIVATE` 规则会导致审批人无法查看分配给自己的任务。使用 `ADMINWRITE` 规则，用户可读取所有任务，前端通过 `actualApproverId` 过滤只显示当前用户的待办。

**记录数**：103

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_orderId_stepNo` - 组合索引：orderId（升序）+ stepNo（升序）- 工单任务列表
- `idx_taskStatus_assignedAt` - 组合索引：taskStatus（升序）+ assignedAt（降序）- 待办查询
- `idx_actualApproverId_updatedAt` - 组合索引：actualApproverId（升序）+ updatedAt（降序）- 审批人记录查询

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  orderId: String,                 // 关联的工单 ID
  stepNo: Number,                  // 步骤编号
  stepName: String,                // 步骤名称
  stepType: String,                // 步骤类型：'serial'（串行）| 'parallel'（并行）
  approverType: String,            // 审批人类型：'role' | 'dept_head' | 'user'
  approverId: String,              // 审批人 ID（角色 ID 或 openid）
  approverName: String,            // 审批人名称
  approverList: Array,             // 所有有权限的审批人列表
  actualApproverId: String,        // 实际审批人 openid（审批后填充，初始为 null）
  actualApproverName: String,      // 实际审批人姓名（审批后填充）
  taskStatus: String,              // 任务状态：'pending'（待审批）| 'approved'（已同意）| 'rejected'（已拒绝）| 'returned'（已退回）等
  createdAt: Number,               // 创建时间戳
  assignedAt: Number,              // 分配时间戳
  timeoutAt: Number,               // 超时时间戳
  timeoutAction: String,           // 超时动作：'remind' | 'auto_approve' | 'auto_reject'
  isTimeout: Boolean,              // 是否已超时
  parallelGroupId: String,         // 并行分组 ID（并行步骤使用）
  comment: String,                 // 审批意见
  attachments: Array               // 附件列表
}
```

---

### 16. workflow_templates - 工作流模板

**用途**：存储工作流模板配置

**安全规则**：`ADMINWRITE` - 所有用户可读，仅管理员可写

> **重要说明**：模板用于提交工单时查询，`PRIVATE` 规则会导致用户无法提交工单。使用 `ADMINWRITE` 规则，用户可读取模板列表。

**记录数**：8

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_code_status` - 组合索引：code（升序）+ status（升序）- 模板查询

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

### 17. menu_comments - 菜单评论

**用途**：存储用户对菜单的评论。仅通过云函数访问，按权限返回（领导/后勤管理/管理员看全部，其他人只看自己的）。

**安全规则**：`ADMINONLY` - 仅管理员可读写

> **重要说明**：评论的查询/新增/删除均通过云函数 `menuManager` 进行。`listComments` 按调用者身份决定返回范围（领导/后勤管理/管理员返回全部，其他人只返回自己的），普通用户无法获取他人评论数据。

**记录数**：0（新建）

**索引**：

- `_id` - 记录 ID（云开发自动创建）
- `_openid_1` - 创建者 openid 索引（云开发自动创建）
- `idx_menuId_createdAt` - 组合索引：menuId（升序）+ createdAt（升序）- 按菜单查询评论并按时间排序
- `idx_menuId_openid` - 组合索引：menuId（升序）+ authorOpenid（升序）- 查询某用户对某菜单的评论

**字段结构**：
```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  menuId: String,                 // 关联的菜单 ID（menus._id）
  openid: String,                 // 评论者 openid（兼容字段，与 authorOpenid 一致）
  authorOpenid: String,           // 评论者 openid
  authorName: String,             // 评论者姓名
  content: String,                // 评论内容
  createdAt: Number               // 创建时间戳
}
```

**业务规则**：
1. 所有已批准用户可发布评论（云函数 addComment 校验 status='approved'）
2. 删除评论：仅作者本人或管理员（云函数 deleteComment 校验 openid）
3. 查询评论：领导/后勤管理/管理员看全部，其他人只看自己的（云函数 listComments 按权限过滤）
4. 审核人员（isReviewer）不显示评论区

**相关云函数**：
- `menuManager.listComments`：按权限返回评论列表（返回 comments + canViewAll）
- `menuManager.addComment`：新增评论
- `menuManager.deleteComment`：删除评论（仅作者/管理员）

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
| 2026-04-03 | 添加 meal_subscriptions 用户订餐状态、meal_adjustments 调整记录集合（工作餐与副食功能） | AI |
| 2026-04-04 | 添加 side_dish_orders 副食征订单、side_dish_bookings 副食预订记录集合（副食预订/管理功能） | AI |
| 2026-04-05 | 添加 menu_ratings 菜品打分记录集合（菜单详情页菜品评分功能） | AI |
| 2026-04-06 | 添加 activities 活动主表、activity_registrations 报名记录集合（活动管理模块） | AI |
| 2026-04-07 | 添加 car_purchase_records 购车记录集合（购车管理Checklist功能） | AI |
| 2026-04-28 | 更新 side_dish_orders/side_dish_bookings 支持多类别征订（categories/items） | AI |
| 2026-07-21 | 添加 interest_class_reports 兴趣班备案记录集合（兴趣班备案功能） | AI |
| 2026-07-26 | 创建 notifications 集合组合索引 `openid_createdAt_idx`（openid升序 + createdAt降序） | AI |
| 2026-08-13 | 添加 content_forms、content_form_submissions 集合（馆内动态系统） | AI |
| 2026-08-14 | 创建 menus 集合 `createdAt_-1` 降序索引，消除菜单列表全表扫描告警 | AI |
| 2026-08-16 | 重写 `menuManager.getRatings` 为聚合查询；创建 menu_ratings 集合 `idx_menuId`、`idx_menuId_openid_dishName` 索引，移除无效的 `idx_menuId_createdAt` 说明 | AI |
| 2026-08-31 | 按当前云环境（cloud1-d2gyip4xi1fcf54bd）实际集合列表校准，移除已删除集合，同步更新记录数与 `dbManager` 云函数 | AI |
| 2026-08-31 | 按云环境实际索引核对：移除不存在的自定义索引声明（haircut/holiday/trip_reports/work_orders/workflow_* 等），补充各集合 `_openid_1` 自动索引 | AI |
| 2026-08-31 | 按代码查询模式为 10 个集合补建 20 个索引（office_users 的 openid/reportTo/status、trip_reports 的 departAt 系列、work_orders/workflow_* 的查询索引、haircut/sys_config/holiday/permissions 等） | AI |
| 2026-08-31 | 校正过时字段名：work_orders（移除 initiatorId/initiatorName/initiatorRole/completedAt，补充 templateName，申请人改用 businessData.applicantId）、workflow_tasks（stepId→stepNo、status→taskStatus、assignTime→assignedAt、approvalComment→comment 等）、workflow_logs（operateTime/eventType/templateId→taskId/stepName/operatorType/detail/beforeData/afterData/changes） | AI |
| 2026-09-03 | 创建 menu_comments 集合（菜单评论），含索引 idx_menuId_createdAt、idx_menuId_openid，安全规则 ADMINONLY，同步更新 dbManager 云函数 | AI |

---

## 附录：数据库链接

**云开发控制台**：
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc
```

**集合列表**（当前 17 个）：
- [content_form_submissions](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/content_form_submissions)
- [content_forms](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/content_forms)
- [haircut_appointments](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/haircut_appointments)
- [holiday_configs](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/holiday_configs)
- [interest_class_reports](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/interest_class_reports)
- [menu_comments](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/menu_comments)
- [menu_ratings](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/menu_ratings)
- [menus](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/menus)
- [notifications](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/notifications)
- [office_users](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/office_users)
- [permissions](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/permissions)
- [sys_config](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/sys_config)
- [trip_reports](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/trip_reports)
- [work_orders](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/work_orders)
- [workflow_logs](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/workflow_logs)
- [workflow_tasks](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/workflow_tasks)
- [workflow_templates](https://tcb.cloud.tencent.com/dev?envId=cloud1-d2gyip4xi1fcf54bd#/db/doc/collection/workflow_templates)
