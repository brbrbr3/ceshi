---
name: activity-zone-feature
overview: 在 Home 页「今日日程」和「学习园地」之间新增「群团活动」模块，包含：Home 展示卡片（3条）、活动列表页、活动详情页（含报名功能）、创建活动页（含目标用户/分组/展示/报名可见性等配置），新建 activities + activity_registrations 两个集合及 activityManager 云函数。
design:
  styleKeywords:
    - Office Clean Style, Gradient Header, Rounded Card Layout, Activity Card, Group Registration, Switch Toggle Form, Bottom Action Bar, Role Selector Checkbox, Dynamic Group Input
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 48px
      weight: 600
    subheading:
      size: 32px
      weight: 500
    body:
      size: 28px
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#7C3AED"
      - "#10B981"
    background:
      - "#FFFFFF"
      - "#F8FAFC"
      - "#EEF2FF"
    text:
      - "#1E293B"
      - "#475569"
      - "#94A3B8"
    functional:
      - "#10B981"
      - "#EF4444"
      - "#F59E0B"
      - "#DBEAFE"
todos:
  - id: setup-db
    content: 使用 [MCP:CloudBase MCP] 创建 activities 集合(ADMINWRITE)和 activity_registrations 集合(READONLY)，更新 DATABASE_COLLECTIONS_REFERENCE.md
    status: completed
  - id: create-cloud-function
    content: 新建 cloudfunctions/activityManager/index.js 云函数，实现 create/list/get/register/cancelRegistration/delete 共6个action，遵循 announcementManager 的统一返回格式和鉴权模式
    status: completed
    dependencies:
      - setup-db
  - id: modify-home-page
    content: 修改 home 页三件套(wxml/js/wxss)：在今日日程和学习园地之间插入群团活动卡片(最多3条)，新增 loadActivities/goActivities/handleActivityTap 方法
    status: completed
  - id: create-activity-list-page
    content: 新建 activity-list 页面四件套：渐变头部+创建按钮+筛选标签(全部/报名中/已结束)+分页活动列表+左划删除，复用 paginationBehavior
    status: completed
  - id: create-activity-detail-page
    content: 新建 activity-detail 页面四件套：渐变头部+详情卡片(标签/元数据/富文本内容)+分组信息区+报名情况列表+底部报名按钮(非分组直接报名/分组弹窗选择)+分组选择弹窗
    status: completed
  - id: create-activity-create-page
    content: 新建 activity-create 页面四件套：标题input+内容textarea+目标用户(switch+checkbox多选ROLE_OPTIONS)+分组活动(switch+动态input列表+添加按钮)+只对目标用户展示(switch)+报名情况对用户可见(switch)+提交按钮
    status: completed
  - id: register-routes
    content: 修改 miniprogram/app.json 的 pages 数组，新增 activity-list/activity-detail/activity-create 三个页面路径
    status: completed
---

## 产品概述

在首页「今日日程」和「学习园地」之间新增「群团活动」模块，支持用户发布活动、浏览活动列表、查看活动详情并报名参与。功能形态参照「通知公告」模块（Home卡片+列表页+详情页+创建页），但增加目标用户筛选、分组报名、可见性控制等特色能力。

## 核心功能

### Home 首页模块

- 在「今日日程」和「学习园地」之间插入「群团活动」卡片
- 最多显示 3 条活动记录，展示活动标题、时间、报名人数
- 右侧「更多」链接跳转至活动列表页
- 点击条目跳转至活动详情页

### 活动列表页 (activity-list)

- 渐变头部 + 右上角「创建活动」按钮（有权限用户可见）
- 活动列表：分页加载（paginationBehavior），每条显示标题、创建者、时间、报名人数、状态标签
- 支持按状态筛选（全部/报名中/已结束）

### 活动详情页 (activity-detail)

- 渐变头部 + 活动基本信息（标题、内容、创建者、时间）
- 目标用户标签展示（如果设置了限制）
- 分组信息展示（如果是分组活动，显示各分组及报名情况 —— 仅当报名对用户可见时）
- 底部「报名参与」按钮：
- 非分组活动：直接报名
- 分组活动：弹出分组选择器，用户选择一个分组后报名
- 已报名显示「已报名」状态
- 非目标用户不可见时（且设置了只对目标用户展示）提示无权限

### 创建活动页 (activity-create)

- **标题**（必填，input）
- **活动内容**（必填，textarea 富文本）
- **Switch 目标用户**（默认关闭=全部角色可看；打开后多选 checkbox，角色列表来自 ROLE_OPTIONS 常量）
- **Switch 分组活动**（默认关闭；打开后出现「分组1」输入框 + 加号按钮添加新分组，至少保留1个分组）
- **Switch 只对目标用户展示活动**（默认关闭，关闭则所有登录用户可见）
- **Switch 报名情况对用户可见**（默认开启，控制详情页是否显示其他报名者信息）

## 业务规则

1. 所有已登录用户均可创建活动和报名（与通知公告一致）
2. 活动创建者和管理员可以删除活动（左划菜单）
3. 同一用户对同一活动只能报名一次
4. 分组活动中，同一用户只能选择一个分组报名
5. 非目标用户在「只对目标用户展示」开启时看不到该活动
6. 报名情况不可见时，普通用户看不到其他人的报名信息

## 技术栈

- 前端：微信小程序原生框架（WXML/WXSS/JS）
- 后端：CloudBase 云函数（新建 `activityManager`）
- 数据库：CloudBase NoSQL 文档数据库（新建 `activities` + `activity_registrations` 两个集合）
- 角色常量：`app.getConstantSync('ROLE_OPTIONS')` 获取
- 分页：`paginationBehavior` 行为复用
- 时间格式化：`utils.formatRelativeTime()` / `utils.formatDateTime()`

## 实现方案

### 数据模型设计

**新建集合 `activities`（活动主表）**：

```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  title: String,                   // 活动标题（必填）
  content: String,                 // 活动内容（富文本HTML或纯文本）
  // 创建者信息
  creatorOpenid: String,            // 创建者 openid
  creatorName: String,             // 创建者姓名
  // 目标用户配置
  isTargetRoleEnabled: Boolean,     // 是否启用目标用户限制（默认 false）
  targetRoles: Array[String],      // 目标角色列表（isTargetRoleEnabled=true 时有效）
  // 分组配置
  isGroupedActivity: Boolean,       // 是否为分组活动（默认 false）
  groups: Array[{                  // 分组列表
    name: String                   // 分组名称，如 "分组1"、"A队"
  }],
  // 可见性控制
  isTargetOnlyVisible: Boolean,     // 只对目标用户展示（默认 false）
  isRegistrationVisible: Boolean,   // 报名情况对用户可见（默认 true）
  // 状态
  status: String,                  // 'active'(报名中) | 'ended'(已结束)
  // 统计
  registrationCount: Number,        // 报名人数（冗余字段，便于列表展示）
  // 时间戳
  createdAt: Number,               // 创建时间戳
  updatedAt: Number                // 更新时间戳
}
```

**安全规则**：`ADMINWRITE` - 所有用户可读，云函数写入（与 announcements 一致）

**新建集合 `activity_registrations`（报名记录）**：

```javascript
{
  _id: String,                    // 记录 ID（自动生成）
  activityId: String,              // 关联的活动 ID（activities._id）
  openid: String,                 // 报名人 openid
  name: String,                    // 报名人姓名
  groupName: String | null,        // 所选分组名（非分组活动为 null）
  createdAt: Number               // 报名时间戳
}
```

**安全规则**：`READONLY` - 云函数写入，所有用户可读

### 云函数 `activityManager` Action 设计

| Action | 方法 | 功能 | 参数 |
| --- | --- | --- | --- |
| `create` | `createActivity()` | 创建活动 | `{ title, content, isTargetRoleEnabled, targetRoles, isGroupedActivity, groups, isTargetOnlyVisible, isRegistrationVisible }` |
| `list` | `listActivities()` | 分页查询列表 | `{ page, pageSize, status }` |
| `get` | `getActivity()` | 获取详情+当前用户报名状态 | `activityId` |
| `register` | `registerActivity()` | 报名参与 | `{ activityId, groupName? }` |
| `cancelRegistration` | `cancelRegistration()` | 取消报名 | `activityId` |
| `delete` | `deleteActivity()` | 删除活动（创建者/管理员） | `activityId` |


### 架构设计

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────────┐
│   Home 页    │────▶│ activity-list    │────▶│ activity-detail      │
│ (活动卡片x3) │     │ (活动列表+创建)   │     │ (详情+报名/分组选择)   │
└──────────────┘     └────────┬────────┘     └──────────┬───────────┘
                               │                          │
                       ┌──────▼──────────────────────────▼──────┐
                       │       activityManager (云函数)         │
                       │  create / list / get / register /      │
                       │  cancelRegistration / delete           │
                       └──────────┬───────────────┬────────────┘
                                  │               │
                       ┌──────────▼────┐   ┌──────▼──────────────┐
                       │  activities   │   │ activity_registrations│
                       │  (活动主表)    │   │ (报名记录表)          │
                       └───────────────┘   └─────────────────────┘
```

### 权限与过滤逻辑

**列表查询时的过滤策略**（在云函数 list 中执行）：

1. 基础条件：`status === 'active'`
2. 如果活动设置了 `isTargetOnlyVisible = true`：

- 查询时不在前端过滤（因为 NoSQL 不支持复杂 JOIN），而是返回全部活动后在前端根据当前用户角色二次过滤
- 或者更优方案：云函数接收 `userRole` 参数，在服务端过滤

3. 报名数据：通过 `get` action 时一并返回当前用户的报名状态和报名列表（如果 `isRegistrationVisible = true`）

### 目录结构变更

```
miniprogram/
├── app.json                                    # [MODIFY] 新增3个页面路由
├── pages/office/home/
│   ├── home.wxml                                # [MODIFY] 插入群团活动卡片
│   ├── home.js                                  # [MODIFY] 新增 loadActivities + 导航方法
│   └── home.wxss                                # [MODIFY] 新增活动卡片样式
├── pages/office/activity-list/                   # [NEW] 活动列表页
│   ├── activity-list.wxml
│   ├── activity-list.js
│   ├── activity-list.wxss
│   └── activity-list.json
├── pages/office/activity-detail/                 # [NEW] 活动详情页
│   ├── activity-detail.wxml
│   ├── activity-detail.js
│   ├── activity-detail.wxss
│   └── activity-detail.json
└── pages/office/activity-create/                 # [NEW] 创建活动页
    ├── activity-create.wxml
    ├── activity-create.js
    ├── activity-create.wxss
    └── activity-create.json

cloudfunctions/
└── activityManager/                              # [NEW] 活动管理云函数
    ├── index.js
    ├── package.json
    └── config.json
```

### 性能与边界考虑

1. **Home 页查询**：pageSize=3，仅查 active 状态活动，按 createdAt 降序
2. **报名人数**：registrationCount 冗余字段，每次报名/取消时 +1/-1
3. **目标用户过滤**：list 接口接收 userRole 参数，服务端用 `_.in` 或逻辑或处理（不设限制时不过滤）
4. **分组活动报名**：前端选择分组后传 groupName 给 register action
5. **防重复报名**：register 时先查 `activity_registrations` 是否已存在该用户的记录
6. **云函数部署**：需要手动在微信开发者工具中上传并部署

## 设计风格定位

采用项目统一的「办公风格」设计体系——蓝紫渐变头部(#2563EB → #7C3AED) + 白色圆角卡片布局。群团活动作为独立模块插入首页，视觉上与通知公告、学习园地保持一致的语言体系。

## 页面结构规划

### Page 1: Home 首页 — 群团活动卡片（插入模块）

**位置**：今日日程区块(第82-104行) 与 学习园地区块(第106-127行) 之间

#### Block 1-A: 群团活动 section header

- 左侧：「群团活动」标题（可点击跳转列表）
- 右侧：「更多」链接文字

#### Block 1-B: 活动 card（office-card 容器）

- 最多3条活动条目，每条包含：
- 左侧：活动图标（🎉 紫色圆底）+ 标题（单行省略）
- 右侧：报名时间范围/截止提示 + 报名人数角标
- 空状态：「暂无活动」提示
- 加载态：「加载中...」

---

### Page 2: 活动列表页 (activity-list)

#### Block 2-1: 渐变头部

- 标题：「群团活动」，副标题：「发现精彩活动，立即报名参与」
- 右上角：「＋ 创建活动」按钮（半透明白色边框，权限控制显示）

#### Block 2-2: 筛选标签栏

- 透明胶囊容器内3个标签：全部 / 报名中 / 已结束
- 选中态白底蓝字，未选中透明白字

#### Block 2-3: 活动列表（office-card）

- 每项左图标（🎉）、标题（最多2行）、元数据行（发布者·时间）、右侧箭头 ›
- 报名中：绿色「报名中」tag + 报名人数
- 已结束：灰色「已结束」tag
- 左划操作：删除按钮（红色）

#### Block 2-4: 分页状态

- 加载中 / 没有更多 / 空状态（🎉 图标 + 「暂无活动」）

---

### Page 3: 活动详情页 (activity-detail)

#### Block 3-1: 渐变头部

- 返回导航 + 标题「活动详情」

#### Block 3-2: 详情主卡片

- **标签行**：状态 tag（报名中=绿/已结束=灰）+ 目标用户 tag（如有限制）
- **元数据区**：创建者 / 发布时间 / 报名人数
- **分隔线**
- **活动内容区**：rich-text 渲染富文本内容

#### Block 3-3: 分组信息卡片（仅分组活动 && 报名可见时显示）

- 标题：「分组报名」
- 各分组一行：分组名称 + 已报名人数
- 当前用户所在分组高亮标记

#### Block 3-4: 报名情况列表（仅报名可见时显示）

- 标题：「参与者」（非分组）或「各分组参与情况」（分组）
- 用户昵称列表 / 分组统计

#### Block 3-5: 底部操作栏（固定底部）

- 非分组活动：大按钮「报名参与」（渐变蓝紫）或「已报名 ✓」（灰色）或「已结束」（禁用灰）
- 分组活动：「选择分组报名」（点击弹出分组选择器）
- 创建者/管理员额外显示「编辑」「删除」操作

#### Block 3-6: 分组选择弹窗（分组活动报名时弹出）

- 固定遮罩层 + 底部面板
- 各分组选项，显示名称和已报人数
- 点击即报名该分组

---

### Page 4: 创建活动页 (activity-create)

#### Block 4-1: 渐变头部

- 返回导航 + 标题「创建活动」

#### Block 4-2: 表单卡片

- **标题输入**：单行 input，placeholder「请输入活动标题」，最大50字
- **活动内容**：多行 textarea，placeholder「请输入活动详细内容...」，最大2000字
- **分隔线**

- **Switch 行：目标用户**（switch + 说明文字）
- 开启后展开：角色多选 checkbox 列表（ROLE_OPTIONS 动态渲染）
- 关闭说明：「所有已登录用户可查看此活动」

- **Switch 行：分组活动**（switch + 说明文字）
- 开启后展开：动态分组列表
    - 默认显示「分组1」input
    - 每行：input + 删除按钮(×)
    - 底部「+ 添加分组」按钮（小样式）
- 关闭说明：「用户直接报名活动」

- **Switch 行：只对目标用户展示**（switch + 说明文字）
- 说明：「开启后，只有目标角色的用户能在列表中看到此活动」

- **Switch 行：报名情况对用户可见**（switch + 说明文字，默认开启）
- 说明：「关闭后，普通用户无法查看其他报名者的信息」

#### Block 4-3: 提交按钮

- 全宽渐变按钮「发布活动」

## MCP

- **CloudBase MCP**
- Purpose: 创建 `activities` 和 `activity_registrations` 两个数据库集合并配置 ADMINWRITE 和 READONLY 安全规则
- Expected outcome: 成功创建两个集合并设置正确的访问权限

## Skill

- **cloudbase**
- Purpose: 参考 CloudBase 小程序开发规范确保云函数、数据库操作符合最佳实践，以及 UI 设计规范指导页面视觉设计
- Expected outcome: 确保 activityManager 云函数遵循现有代码模式和编码规范