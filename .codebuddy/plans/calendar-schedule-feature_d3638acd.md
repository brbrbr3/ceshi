---
name: calendar-schedule-feature
overview: 为日历页面实现完整的日程功能，包括周视图时间轴日程列表、全天日程显示、添加/编辑日程弹窗，以及相关的数据库和云函数
design:
  styleKeywords:
    - 时间轴
    - 日程条
    - 半屏弹窗
    - 卡片式表单
    - 渐变色头部
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 36rpx
      weight: 700
    subheading:
      size: 30rpx
      weight: 600
    body:
      size: 28rpx
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#3B82F6"
      - "#60A5FA"
    background:
      - "#F1F5F9"
      - "#FFFFFF"
      - "#F8FAFC"
    text:
      - "#1E293B"
      - "#64748B"
      - "#94A3B8"
    functional:
      - "#EF4444"
      - "#10B981"
      - "#F59E0B"
      - "#8B5CF6"
      - "#EC4899"
todos:
  - id: explore-form-reference
    content: 使用 [subagent:code-explorer] 探索项目中表单弹窗的实现参考
    status: completed
  - id: create-database-collection
    content: 使用 [mcp:CloudBase MCP] 创建 calendar_schedules 集合及索引
    status: completed
    dependencies:
      - explore-form-reference
  - id: create-cloud-function
    content: 使用 [mcp:CloudBase MCP] 创建 scheduleManager 云函数
    status: completed
    dependencies:
      - create-database-collection
  - id: update-calendar-wxml
    content: 修改 calendar.wxml 添加时间轴列表和编辑弹窗
    status: completed
    dependencies:
      - explore-form-reference
  - id: update-calendar-wxss
    content: 修改 calendar.wxss 添加时间轴和弹窗样式
    status: completed
    dependencies:
      - update-calendar-wxml
  - id: update-calendar-js
    content: 修改 calendar.js 添加日程逻辑和弹窗交互
    status: completed
    dependencies:
      - update-calendar-wxml
  - id: deploy-cloud-function
    content: 使用 [mcp:CloudBase MCP] 部署 scheduleManager 云函数
    status: completed
    dependencies:
      - create-cloud-function
      - update-calendar-js
---

## 产品概述

为日历页面添加完整的日程管理功能，在周视图模式下显示时间轴日程列表，支持日程的增删改查操作。

## 核心功能

### 1. 时间轴日程列表

- 只在日历组件为周视图(`view="week"`)时显示
- 时间轴布局：纵向小时分隔线(8:00-22:00)、红色横线标记当前时间、日程按起止时间显示为彩色竖条
- 全天日程吸附在列表最上端显示

### 2. 日程操作

- 右下角悬浮+号按钮，点击弹出添加日程弹窗
- 点击日程条弹出相同弹窗进行编辑
- 弹窗包含：标题输入、全天开关、开始/结束时间、类型选择、重复设置

### 3. 数据管理

- 新建数据库集合存储日程数据
- 新建云函数处理日程CRUD操作
- 按日期查询和过滤日程

## 视觉参考

日程编辑弹窗样式参考用户提供图片：半屏弹窗、卡片式表单分组、开关控件、日期选择器。

## 技术栈

- 前端：微信小程序原生开发 + WXSS
- 后端：CloudBase 云函数 + NoSQL 数据库
- 日历组件：@lspriv/wx-calendar（已有）

## 技术方案

### 数据库设计

新建 `calendar_schedules` 集合：

```javascript
{
  _id: String,              // 记录ID
  title: String,            // 日程标题
  isAllDay: Boolean,        // 是否全天
  startDate: String,        // 开始日期 YYYY-MM-DD
  endDate: String,          // 结束日期 YYYY-MM-DD
  startTime: String,        // 开始时间 HH:mm（非全天）
  endTime: String,          // 结束时间 HH:mm（非全天）
  type: String,             // 类型：'meeting'|'training'|'visit'|'banquet'|'other'
  typeName: String,         // 类型显示名
  color: String,            // 颜色值
  repeat: String,           // 重复：'none'|'daily'|'weekly'|'monthly'
  location: String,         // 地点（可选）
  description: String,      // 备注（可选）
  creatorId: String,        // 创建者openid
  creatorName: String,      // 创建者姓名
  createdAt: Number,        // 创建时间戳
  updatedAt: Number         // 更新时间戳
}
```

安全规则：`READONLY`（所有用户可读，仅创建者可写）

索引：

- `idx_creatorId_startDate` - 创建者+开始日期组合索引
- `idx_startDate` - 开始日期索引

### 云函数设计

新建 `scheduleManager` 云函数，支持以下 action：

| Action | 说明 | 参数 |
| --- | --- | --- |
| `create` | 创建日程 | title, isAllDay, startDate, endDate, startTime, endTime, type, repeat, location, description |
| `update` | 更新日程 | scheduleId + 更新字段 |
| `delete` | 删除日程 | scheduleId |
| `getByDate` | 按日期查询 | date（YYYY-MM-DD） |
| `getByDateRange` | 按范围查询 | startDate, endDate |


### 前端架构

**时间轴计算逻辑**：

- 时间范围：8:00 - 22:00（14小时）
- 每小时高度：120rpx
- 日程条位置计算：`top = (startHour - 8 + startMin/60) * 120`
- 日程条高度计算：`height = (durationHours) * 120`

**组件交互**：

- 监听日历 `bindviewchange` 事件检测视图切换
- 当前时间红线每分钟更新一次
- 弹窗使用微信小程序 `page-container` 组件实现半屏效果

### 目录结构

```
miniprogram/pages/office/calendar/
├── calendar.wxml       # [MODIFY] 添加时间轴列表、弹窗
├── calendar.wxss       # [MODIFY] 添加时间轴样式、弹窗样式
├── calendar.js         # [MODIFY] 添加视图检测、日程计算、弹窗逻辑
└── calendar.json       # [MODIFY] 添加页面容器配置

cloudfunctions/
└── scheduleManager/    # [NEW] 日程管理云函数
    ├── index.js
    ├── config.json
    └── package.json

.codebuddy/docs/
└── DATABASE_COLLECTIONS_REFERENCE.md  # [MODIFY] 添加新集合文档

cloudfunctions/initDatabase/index.js  # [MODIFY] 添加集合初始化配置
```

## 设计风格

采用与现有办公系统一致的视觉风格：

- 渐变色头部（蓝色系）
- 卡片式布局
- 圆角设计（16-24rpx）
- 清晰的视觉层次

## 时间轴日程列表设计

### 布局结构

```
┌─────────────────────────────┐
│  全天 │ [全天日程条]         │  ← 吸附在顶部
├──────┼──────────────────────┤
│  8   │ ──────────────────── │  ← 小时分隔线（灰色细线）
│  9   │ ──────────────────── │
│  10  │ ──────────────────── │
│  11  │  ███ 会议标题        │  ← 日程条（彩色竖条+标题）
│  12  │  ███                 │
│  13  │ ──────────────────── │
│ ...  │                      │
│ 20:30│────────红线──────────│  ← 当前时间（红色横线）
└──────┴──────────────────────┘
```

### 样式细节

- 时间标签：80rpx宽，24rpx字体，灰色
- 小时分隔线：1rpx solid #E2E8F0
- 日程条：圆角12rpx，白色文字，半透明背景
- 当前时间线：2rpx红色，带时间标签
- 右下角+按钮：56rpx圆形，蓝色渐变，阴影

## 日程编辑弹窗设计

参考用户提供的图片，采用半屏弹窗形式：

### 弹窗头部

- 左侧"取消"按钮（蓝色文字）
- 中间标题"编辑"/"新建日程"
- 右侧"完成"按钮（蓝色文字）

### 表单区域

- 标题输入：大圆角输入框，白色背景
- 全天开关：左侧标签，右侧switch组件
- 时间选择：开始/结束日期，带箭头图标
- 类型选择：彩色圆点标识 + 类型名 + 右箭头
- 重复设置：左侧标签 + 右侧值 + 右箭头

### 分组卡片

相关表单项放在白色圆角卡片内，卡片间有适当间距。

## Agent Extensions

### MCP - CloudBase MCP

- **Purpose**: 创建数据库集合、创建云函数、部署云函数
- **Expected outcome**: 
- 创建 `calendar_schedules` 集合并配置索引和安全规则
- 创建 `scheduleManager` 云函数
- 部署云函数代码

### SubAgent - code-explorer

- **Purpose**: 探索项目中的表单页面代码，获取弹窗和表单实现参考
- **Expected outcome**: 获取 announcement-create 或其他表单页面的实现模式