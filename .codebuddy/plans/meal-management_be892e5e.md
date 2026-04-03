---
name: meal-management
overview: 开发餐食管理功能前两个Tab：我的工作餐 + 工作餐管理，含数据库集合、云函数、前端页面及权限控制
design:
  styleKeywords:
    - Material Design 3
    - Gradient Header
    - Card Layout
    - Bottom Sheet Modal
    - Clean Minimalism
    - Status Bubble UI
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 36rpx
      weight: 700
    subheading:
      size: 28rpx
      weight: 600
    body:
      size: 28rpx
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#1D4ED8"
      - "#3B82F6"
    background:
      - "#EEF2FF"
      - "#FFFFFF"
      - "#F8FAFC"
    text:
      - "#0F172A"
      - "#475569"
      - "#94A3B8"
    functional:
      - "#16A34A"
      - "#DC2626"
      - "#F59E0B"
      - "#2563EB"
todos:
  - id: create-db-collections
    content: 使用 [mcp:tcb] 创建 meal_subscriptions 和 meal_adjustments 两个 NoSQL 集合，配置 ADMINWRITE 安全规则和索引
    status: completed
  - id: create-cloud-function
    content: 创建 mealManager 云函数（index.js/package.json/config.json），实现 getMyMealStatus/saveMealStatus/submitMealAdjustment/getAdjustmentList 四个 action
    status: completed
  - id: deploy-cloud-function
    content: 使用 [mcp:tcb] 部署 mealManager 云函数到云端
    status: completed
    dependencies:
      - create-cloud-function
  - id: create-meal-page
    content: 创建 meal-management 页面四件套（js/wxml/wxss/json），实现 Tab 切换、权限检查、首次入伙弹窗、状态气泡、调整弹窗（含 datetime-picker 日期选择和份数加减器）
    status: completed
    dependencies:
      - create-db-collections
      - deploy-cloud-function
  - id: register-page
    content: 修改 app.json 注册 meal-management 页面路径
    status: completed
  - id: update-db-reference
    content: 更新 DATABASE_COLLECTIONS_REFERENCE.md 添加两个新集合的完整定义文档
    status: completed
    dependencies:
      - create-db-collections
---

## Product Overview

餐食管理功能模块，包含4个Tab中的前2个：**我的工作餐**（用户端）和**工作餐管理**（管理端），基于微信小程序 CloudBase NoSQL 数据库开发。

## Core Features

### 1. 【我的工作餐】Tab

**权限控制**：仅 `['馆领导', '部门负责人', '馆员', '工勤']` 角色可见。

- **首次进入弹窗**：
- Switch 开关选择「已入伙」/「未入伙」
- 选择「已入伙」后显示订餐份数选择器（默认1，左右加减号调整）
- 确定后保存并关闭弹窗

- **Tab 页主体**：
- 上方居中显示状态气泡：根据用户工作餐状态显示「我已入伙」或「我未入伙」及订餐份数
- 右侧放置「工作餐调整」按钮

- **工作餐调整弹窗**（点击按钮触发）：
- **已入伙用户**：单选「临时停餐」或「退伙」
    - 临时停餐：日期范围选择（两个 datetime-picker 组件，开始日期限制为下个星期一起）+ 停餐份数（不超过已订餐份数）
    - 退伙：开始日期选择 + 退伙份数（不超过已订餐份数）
- **未入伙用户**：只能选择「我要入伙」+ 订餐份数
- 提交后更新状态并刷新页面

### 2. 【工作餐管理】Tab

**权限控制**：仅 `['会计主管', '会计', '出纳', '招待员', '厨师']` 岗位可见。

- 按提交时间倒序展示每月工作餐调整记录列表
- 每月一条条目，字段包括：姓名、调整类型（入伙/退伙/停餐）、开始日期、结束日期（如有）、份数

## Tech Stack

- **前端框架**：微信小程序原生框架（WXML/WXSS/JS）
- **数据库**：CloudBase NoSQL（文档型数据库）
- **云函数**：Node.js 云函数（mealManager）
- **组件库**：项目自研 datetime-picker 日期选择器、approval-card 列表卡片模式
- **样式规范**：参照 approval 页面渐变头部 + 卡片式布局风格

## Tech Architecture

### 系统架构

```
┌─────────────────────────────────────────┐
│           meal-management 页面            │
│  ┌──────┐ ┌──────────┐ ┌──────────┐      │
│  │Tab1   │ │  Tab2    │ │(预留)    │      │
│  │我的   │ │工作餐    │ │          │      │
│  │工作餐 │ │管理      │ │          │      │
│  └──┬───┘ └────┬─────┘ └──────────┘      │
│     │         │                           │
│  ┌──▼───┐  ┌──▼────┐                     │
│  │前端逻辑│  │前端逻辑│                     │
│  └──┬───┘  └──┬────┘                     │
└─────┼─────────┼──────────────────────────┘
      │         │
      ▼         ▼
┌──────────────────────────┐
│   mealManager 云函数     │
│  ├─ getMyMealStatus     │  获取当前用户餐食状态
│  ├─ saveMealStatus      │  保存/更新入伙状态
│  ├─ submitMealAdjustment │ 提交调整申请(停餐/退伙/入伙)
│  └─ getMealAdjustments   │ 获取调整记录列表(管理端)
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  NoSQL 集合              │
│  ├─ meal_subscriptions  │ 用户订餐状态(每用户1条)
│  └─ meal_adjustments     │ 调整记录(每次操作1条)
└──────────────────────────┘
```

### 权限控制架构

```
onLoad → app.checkUserRegistration() → 获取 user.role / user.position
  → 角色在 MEAL_TAB1_ROLES 中 → 显示 Tab1
  → 岗位在 MEAL_TAB2_POSITIONS 中 → 显示 Tab2
  → 均不在 → 显示无权限提示
```

### 数据模型设计

**集合1: meal_subscriptions（用户订餐状态）**

```javascript
{
  _id: String,                  // 记录ID
  openid: String,               // 用户openid（唯一标识）
  name: String,                 // 用户姓名
  role: String,                 // 角色
  position: String,             // 岗位
  isEnrolled: Boolean,          // 是否已入伙
  mealCount: Number,            // 订餐份数（默认1）
  status: String,               // 当前状态: 'active'(正常) | 'suspended'(停餐中) | 'withdrawn'(已退伙) | 'none'
  createdAt: Number,            // 创建时间戳
  updatedAt: Number             // 更新时间戳
}
// 安全规则: ADMINWRITE（所有用户可读，仅管理员/云函数可写）
// 索引: idx_openid (openid, 唯一), idx_status (status)
```

**集合2: meal_adjustments（调整记录）**

```javascript
{
  _id: String,                  // 记录ID
  openid: String,               // 操作人openid
  name: String,                 // 操作人姓名
  adjustmentType: String,       // 类型: 'enroll'(入伙) | 'withdraw'(退伙) | 'suspend'(临时停餐) | 'resume'(恢复)
  startDate: String,            // 开始日期 YYYY-MM-DD
  endDate: String|null,         // 结束日期 YYYY-MM-DD（停餐时有值）
  count: Number,                // 涉及份数
  monthKey: String,             // 月份键 YYYY-MM（用于按月分组）
  remark: String|null,          // 备注
  createdAt: Number,            // 提交时间戳
}
// 安全规则: ADMINWRITE（所有用户可读，仅云函数可写）
// 索引: idx_openid_createdAt (openid, createdAt 降序), idx_monthKey (monthKey), idx_createdAt (createdAt 降序)
```

## Implementation Details

### 关键业务规则

1. **停餐开始日期限制**：必须从下个周一开始。计算方式：取今天所在周的下一个周一（如果今天是周一，则从下周一开始）
2. **份数校验**：停餐/退伙份数不能超过用户当前的 mealCount；入伙时份数≥1
3. **状态联动**：提交停餐→status 变为 suspended；提交退伙→变为 withdrawn；入伙→变为 active
4. **每月一条汇总**：管理端列表按 monthKey 分组，每月只显示最新的一条调整记录

### 日期处理规范

- 所有日期使用纯字符串格式 `YYYY-MM-DD` 存储（避免时区问题）
- 使用项目已有的 `utils.parseLocalDate()` 解析日期字符串
- 使用 `utils.formatDateObj()` 格式化 Date 对象
- datetime-picker 组件的 startDate 属性动态计算为下个周一

### 云函数 action 设计

| Action | 说明 | 参数 | 返回 |
| --- | --- | --- | --- |
| getMyMealStatus | 获取当前用户订餐状态 | 无 | { isEnrolled, mealCount, status, ... } 或 null |
| saveMealStatus | 首次保存入伙状态 | { isEnrolled, mealCount } | 更新后的完整记录 |
| submitMealAdjustment | 提交调整 | { adjustmentType, startDate, endDate?, count } | 新增的调整记录 |
| getAdjustmentList | 获取调整记录列表(管理端) | { page, pageSize } | { list, hasMore, total } |


## Directory Structure Summary

本实现涉及新建页面目录、新建云函数、修改配置文件以及更新数据库参考文档：

```
d:\WechatPrograms\ceshi\
├── cloudfunctions/
│   └── mealManager/                    # [NEW] 餐食管理云函数
│       ├── index.js                    # [NEW] 主入口：action路由 + 各action处理
│       ├── package.json                # [NEW] 依赖配置
│       └── config.json                 # [NEW] 云函数配置
├── miniprogram/
│   ├── pages/
│   │   └── office/
│   │       └── meal-management/        # [NEW] 餐食管理页面（4个文件）
│   │           ├── meal-management.js  # [NEW] 页面逻辑：Tab切换、权限检查、弹窗控制、数据加载
│   │           ├── meal-management.wxml# [NEW] 页面结构：头部+Tab栏+内容区+弹窗
│   │           ├── meal-management.wxss# [NEW] 页面样式：参照approval渐变头+卡片风格
│   │           └── meal-management.json# [NEW] 页面配置：自定义导航栏+组件引用
│   ├── app.json                        # [MODIFY] 注册新页面路径
│   └── components/
│       └── datetime-picker/            # [EXISTING] 复用自研日期选择器
├── .codebuddy/docs/
│   └── DATABASE_COLLECTIONS_REFERENCE.md  # [MODIFY] 添加2个新集合定义
```

### 关键设计决策

1. **新建独立云函数 mealManager**（而非复用 officeAuth）：餐饮是独立业务域，职责清晰，便于后续扩展副食预订/管理功能
2. **两集合分离**：subscription 存当前状态（1对1），adjustments 存历史记录（1对多），符合读写分离原则
3. **管理端列表按月聚合**：getAdjustmentList 返回去重后的每月最新记录，避免前端做复杂分组
4. **datetime-picker 复用**：直接使用项目中已有的自研组件，通过 props 控制日期范围
5. **权限前端控制为主**：Tab 可见性由前端角色/岗位判断决定，云函数侧做二次校验防止越权

## 设计概述

餐食管理页面的视觉风格与项目现有 approval 页面保持一致——采用**渐变色蓝色头部 + 白色卡片内容区**的经典布局，确保整体体验统一。页面分为上下两大区域：顶部固定渐变头部（含标题、Tab切换），下方滚动内容区（含状态气泡、调整按钮或管理列表）。

## 页面规划

### 页面1：餐食管理主页面 (meal-management)

#### Block 1: 渐变导航头部

- 渐变蓝色背景 (#2563EB → #1D4ED8)，圆角底部
- 左侧返回箭头，中间大标题「餐食管理」，右侧留空占位
- 标题下方一行副标题说明文字（根据当前Tab动态变化）

#### Block 2: Tab 切换栏

- 半透明白底胶囊容器，内嵌 Tab 按钮
- 根据 Tab 数量自动均分宽度：「我的工作餐」「工作餐管理」
- 选中态白底蓝字 + 未选中透明文字
- 仅渲染有权限的 Tab（动态过滤）

#### Block 3-A：【我的工作餐】内容区

- **状态气泡卡片**：白色圆角卡片，居中展示大号状态标签
- 已入伙：绿色系 (#16A34A) 背景，「我已入伙 · X份」文字
- 未入伙：灰色系 (#94A3B8) 背景，「我未入伙」文字
- **工作餐调整按钮**：位于状态气泡右侧（或下方移动端适配）
- 圆角胶囊按钮，主色调渐变边框，内部图标+文字
- **首次入伙弹窗**（modal）：
- 底部弹出式面板，带半透明遮罩
- Switch 开关（微信原生 switch 组件改造样式）
- 条件显示：份数选择器行（减号按钮 + 数字输入框 + 加号按钮）
- 底部双按钮：取消 + 确定保存
- **调整操作弹窗**（modal）：
- 底部弹出式面板，更大空间
- 顶部标题「工作餐调整」
- 单选组（radio-group）：临时停餐 / 退伙（已入伙）；我要入伙（未入伙）
- 条件渲染表单区：
    - 临时停餐：两个 datetime-picker（开始~结束）+ 份数选择
    - 退伙：一个 datetime-picker + 份数选择
    - 入伙：份数选择
- 底部提交按钮（满宽，渐变蓝底白字）

#### Block 3-B：【工作餐管理】内容区

- **月份列表**：垂直排列的卡片列表，每张卡片代表一个月
- **卡片结构**：
- 左侧：彩色类型标签（入伙=绿、退伙=红、停餐=橙）
- 主体信息区：姓名、类型文字、日期范围、份数
- 右侧：时间戳（相对时间格式）
- 卡片间间距 20rpx，圆角 16rpx，浅灰阴影
- **空状态**：无数据时显示居中空状态图标 + 提示文字

#### Block 4: 加载状态 & 空状态

- Loading 时显示骨架屏或 spinner 动画
- 无权限时显示提示卡片 + 说明文字

## MCP 扩展

- **CloudBase MCP (tcb)**:
- **用途**：创建新的 NoSQL 数据库集合（meal_subscriptions、meal_adjustments）并配置安全规则（ADMINWRITE）；部署 mealManager 云函数到云端
- **预期结果**：数据库就绪且安全规则正确配置，云函数可被小程序端调用