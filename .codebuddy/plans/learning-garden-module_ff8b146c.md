---
name: learning-garden-module
overview: 在首页'今日日程'下方新增'学习园地'模块，并创建完整的学习园地页面（列表页、文章详情页、文章发布页）和云函数，支持富文本编辑、图片插入、置顶、删除等权限控制功能。
todos:
  - id: create-database-collection
    content: 使用 [MCP:CloudBase MCP] 创建 learning_articles 集合、安全规则和索引
    status: completed
  - id: create-cloud-function
    content: 使用 [MCP:CloudBase MCP] 部署 articleManager 云函数（create/list/get/pin/delete）
    status: completed
    dependencies:
      - create-database-collection
  - id: create-learning-pages
    content: 创建学习园地列表页、详情页、发布页三个新页面（4x4=16个文件）
    status: completed
    dependencies:
      - create-cloud-function
  - id: modify-home-page
    content: 在首页"今日日程"下方添加"学习园地"模块，注册新页面路由到 app.json
    status: completed
    dependencies:
      - create-learning-pages
---

## 产品概述

在首页"今日日程"模块下方新增"学习园地"模块，用于展示用户发布的文章。包含首页入口、列表页、发布页、详情页四个部分。

## 核心功能

- **首页模块**：在"今日日程"下方添加"学习园地"卡片，类似"通知公告"的布局风格，显示最新3条文章，右侧提供"更多"链接跳转至列表页
- **学习园地列表页**：展示全部文章，包含"发布文章"按钮；支持左划手势操作（置顶/删除）；分页加载
- **文章发布页**：基于微信原生 `<editor>` 富文本编辑器，支持粗体/斜体/下划线/列表/标题/对齐/分割线/插入图片
- **文章详情页**：使用 `<rich-text>` 渲染富文本内容，文字可选中复制
- **权限控制**：全体用户可查看列表和发布文章；管理员可置顶文章；管理员和文章发布者可删除文章

## 技术栈

- 微信小程序原生框架（WXML/WXSS/JS）
- 云函数（Node.js + wx-server-sdk）
- NoSQL 文档数据库（`learning_articles` 集合）
- 富文本编辑器：微信原生 `<editor>` 组件（复用 announcement-create 的编辑器实现）

## 实现方案

### 整体策略

完全参照现有"通知公告"模块的架构模式（announcement-list / announcement-detail / announcement-create / announcementManager），创建对应的"学习园地"四件套页面和一个云函数，最大化代码复用。

### 数据模型

`learning_articles` 集合文档结构：

```
{
  _id: String,
  title: String,           // 文章标题，必填，最长100字符
  content: String,         // 富文本 HTML 内容
  plainText: String,       // 纯文本摘要（用于列表展示和搜索）
  authorId: String,        // 发布者 openid
  authorName: String,      // 发布者姓名
  authorAvatar: String,    // 发布者头像（可选）
  coverImage: String,      // 封面图 URL（可选，取编辑器第一张图）
  isPinned: Boolean,       // 是否置顶
  pinnedAt: Number,        // 置顶时间戳
  readCount: Number,       // 阅读量
  status: String,          // 'published' | 'deleted'
  createdAt: Number,       // 创建时间戳
  updatedAt: Number        // 更新时间戳
}
```

### 云函数设计

新建 `articleManager` 云函数，action 路由：

| action | 说明 | 参数 |
| --- | --- | --- |
| `create` | 创建文章 | `data: { title, content, plainText, coverImage }` |
| `list` | 文章列表 | `params: { page, pageSize }` |
| `get` | 文章详情 | `articleId` |
| `pin` | 置顶/取消置顶 | `articleId`（仅管理员） |
| `delete` | 删除文章 | `articleId`（管理员或发布者） |


- `list` 排序：`isPinned desc` > `pinnedAt desc` > `createdAt desc`
- `get` 返回时自动递增 `readCount`
- 权限校验通过 `office_users` 集合查询 `isAdmin` 字段
- 统一返回 `{ code, message, data }` 格式

### 前端页面架构

4 个页面 + 1 个云函数，完全复用现有模式：

- **列表页**：使用 `paginationBehavior`，左划菜单复用 announcement-list 的触摸手势逻辑
- **发布页**：复用 announcement-create 的 `<editor>` 富文本编辑器（含工具栏、图片插入、内容获取）
- **详情页**：使用 `<rich-text>` 渲染，默认支持文字选中复制
- **首页**：在 home.wxml 中添加"学习园地"section，加载前3条数据

## 实现细节

### 首页模块

- 在 `home.wxml` 的"今日日程"section 后添加"学习园地"section
- 结构复用 `office-section` > `office-section-header` + `office-card`
- 列表项使用 `home-news-item` 样式（标题+时间），左侧图标用书籍 emoji
- home.js 中添加 `loadArticles()` 方法，调用 `articleManager` 云函数获取前3条

### 富文本编辑器图片支持

微信 `<editor>` 组件已原生支持插入图片（通过 `show-img-toolbar` 和 `show-img-size` 属性），在 announcement-create 中已有完整实现，直接复用。

### 文字选中复制

微信小程序的 `<rich-text>` 组件和 `<text>` 组件默认支持长按选中文字，详情页无需额外配置。

### 性能考虑

- 列表页只存 `plainText` 摘要，不传完整 HTML
- 首页只加载 3 条，使用 `pageSize: 3`
- 分页加载使用 `paginationBehavior`，每页 10 条
- 详情页按需加载，不在列表中预取内容

## 目录结构

```
miniprogram/
├── pages/office/
│   ├── home/
│   │   ├── home.wxml              # [MODIFY] 添加"学习园地"模块
│   │   ├── home.wxss              # [MODIFY] 添加学习园地列表项样式
│   │   └── home.js                # [MODIFY] 添加 loadArticles 方法
│   ├── learning-list/
│   │   ├── learning-list.json     # [NEW] 页面配置（下拉刷新、分页）
│   │   ├── learning-list.wxml     # [NEW] 文章列表页
│   │   ├── learning-list.wxss     # [NEW] 列表页样式
│   │   └── learning-list.js       # [NEW] 列表逻辑（分页、左划、删除）
│   ├── learning-detail/
│   │   ├── learning-detail.json   # [NEW] 页面配置
│   │   ├── learning-detail.wxml   # [NEW] 文章详情页
│   │   ├── learning-detail.wxss   # [NEW] 详情页样式
│   │   └── learning-detail.js     # [NEW] 详情加载逻辑
│   └── learning-create/
│       ├── learning-create.json   # [NEW] 页面配置
│       ├── learning-create.wxml   # [NEW] 文章发布页
│       ├── learning-create.wxss   # [NEW] 发布页样式（含编辑器）
│       └── learning-create.js     # [NEW] 编辑器逻辑
├── app.json                       # [MODIFY] 注册4个新页面路由

cloudfunctions/
└── articleManager/
    ├── index.js                    # [NEW] 云函数主文件
    └── package.json                # [NEW] 依赖配置
```

## Agent Extensions

### MCP

- **CloudBase MCP**: `writeSecurityRule` - 用于创建 `learning_articles` 集合的安全规则配置
- **CloudBase MCP**: `writeNoSqlDatabaseStructure` - 用于创建 `learning_articles` 集合和索引
- **CloudBase MCP**: `manageFunctions` - 用于部署 `articleManager` 云函数（action=createFunction 和 action=updateFunctionCode）