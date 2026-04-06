---
name: menu-detail-dish-rating
overview: 在菜单详情页的"菜单内容"和"评论"之间新增"菜品打分"模块：自动从富文本菜单内容中提取菜品名列表，支持1-5星评分，展示各菜品的平均分数和评分分布。涉及新建集合、云函数扩展、页面UI/逻辑开发。
design:
  styleKeywords:
    - Office Clean Style
    - Rounded Card Layout
    - Star Rating Interaction
    - Bottom Popup Panel
    - Gradient Header Consistency
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 36px
      weight: 600
    subheading:
      size: 30px
      weight: 500
    body:
      size: 26px
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#F59E0B"
      - "#10B981"
    background:
      - "#FFFFFF"
      - "#F8FAFC"
      - "#F1F5F9"
    text:
      - "#1E293B"
      - "#475569"
      - "#94A3B8"
    functional:
      - "#F59E0B"
      - "#E2E8F0"
      - "#DCFCE7"
      - "#DC2626"
todos:
  - id: create-db-collection
    content: 使用 [MCP:tcb] 的 writeNoSqlDatabaseStructure 创建 menu_ratings 集合并配置 READONLY 安全规则
    status: pending
  - id: extend-cloud-function
    content: 在 menuManager/index.js 中新增 getRatings 和 addRating action，参考现有 addComment 模式的鉴权和错误处理
    status: pending
    dependencies:
      - create-db-collection
  - id: implement-extract-logic
    content: 在 menu-detail.js 中实现 extractDishesFromContent(content) 函数，含去标签、分行、停用词过滤、去重逻辑
    status: pending
  - id: build-rating-ui
    content: 在 wxml 插入打分卡片（菜品列表+分数展示）和底部弹窗UI；编写对应 wxss 样式（星星、弹窗、菜品行）
    status: pending
  - id: implement-rating-interaction
    content: 在 js 中实现完整的打分交互链路：loadRatings→openRatingPanel→selectScore→submitRatings，含防重复校验和状态更新
    status: pending
    dependencies:
      - extend-cloud-function
      - implement-extract-logic
      - build-rating-ui
---

## 产品概述

在菜单详情页（menu-detail）增加"菜品打分"互动模块，插入在"菜单内容"卡片与"评论"区域之间。用户可对系统自动从富文本中提取的菜品进行1-5星评分，提交后展示平均分数和评价人数。

## 核心功能

- **菜品智能提取**：自动从菜单富文本HTML内容中识别菜品名称（多层策略：去标签→分行→过滤清洗→停用词表→去重）
- **星级打分交互**：每个菜品支持1-5星选择，通过底部弹窗批量操作，一次性提交全部打分
- **分数可视化展示**：显示每道菜的平均分（保留1位小数）、星级渲染、参与评价人数、当前用户已评状态
- **防重复机制**：同一用户对同一道菜只能打一次分，不可修改（前端禁用+后端查询校验双层保障）
- **权限控制**：所有已登录用户均可打分（复用评论的 `app.checkUserRegistration()` 模式），未登录仅展示分数隐藏按钮

## 技术栈

- 前端：微信小程序原生框架（WXML/WXSS/JS）
- 后端：CloudBase 云函数（`menuManager` 扩展）
- 数据库：CloudBase NoSQL 文档数据库（新建 `menu_ratings` 集合）
- 富文本解析：纯正则提取（无需额外依赖）

## 实现方案

### 数据模型设计

**新建集合 `menu_ratings`**：

```javascript
{
  _id: "auto",
  menuId: String,       // 关联 menus._id
  dishName: String,     // 菜品名称（从content提取）
  openid: String,       // 打分人openid
  authorName: String,   // 打分人昵称
  score: Number,        // 评分 1-5
  createdAt: Number     // 打分时间戳
}
```

安全规则：`READONLY`（所有用户可读，写入由云函数控制）

### 菜品智能提取算法

```
HTML字符串 → 正则去标签 → HTML实体解码 → 多分隔符分割 → 
停用词过滤(菜单/提交/作者/编辑等) → 长度过滤(2-20字) → 去重 → 菜品数组
```

### 架构设计

| 层级 | 职责 |
| --- | --- |
| **前端 JS** | `extractDishesFromContent()` 提取菜品；`loadRatings()` 加载打分数据并聚合平均分；打分状态管理 |
| **前端 WXML** | 打分模块卡片（菜品列表+分数）+ 底部弹窗式打分面板 |
| **云函数 menuManager** | 新增 `getRatings`(查询) 和 `addRating`(提交含防重校验) action |


### 防重复策略

- **前端**：加载后标记 `userRatedMap[dishName]`，已评菜品星星置灰不可点
- **后端**：addRating前 `where({menuId, dishName, openid}).count()` 检查，存在则返回已评提示

## 目录结构变更

```
miniprogram/pages/office/menu-detail/
├── menu-detail.wxml      # [MODIFY] 第23-25行间插入菜品打分卡片+弹窗
├── menu-detail.js        # [MODIFY] 新增菜品提取、loadRatings/openRatingPanel/selectScore/submitRatings方法
└── menu-detail.wxss      # [MODIFY] 新增 .rating-card / .rating-dish-item / .rating-popup 等样式

cloudfunctions/menuManager/
└── index.js              # [MODIFY] switch中新增 getRatings/addRating 两个case

# 数据库
menu_ratings             # [NEW] 新建集合，安全规则 READONLY
```

### 性能与边界考虑

- 菜品提取在前端执行（每次 loadMenu 时触发），结果缓存到 data 中避免重复计算
- 打分数据按 menuId 查询全量后在内存中聚合平均分（单菜单菜品量通常 <20，性能无压力）
- 云函数 addRating 支持批量接收 `{dishName: score}` 对象数组，一次调用完成多道菜打分

## 设计风格定位

采用与现有页面一致的办公风格设计体系——渐变头部 + 白色圆角卡片布局。打分模块作为独立卡片插入在"菜单内容"和"评论"之间，视觉上保持连贯性。

## 页面结构规划

### Block 1: 渐变头部（已有，不变）

保持现有的 office-gradient-header，包含菜单标题和作者信息。

### Block 2: 菜单内容卡片（已有，不变）

mp-html 渲染的富文本内容区域。

### Block 3: 菜品打分卡片（新增核心模块）

位于菜单内容卡片下方、评论区域上方。

- **标题行**：左侧"菜品打分"标题 + 右侧"为菜品打分"操作按钮（未登录时隐藏）
- **菜品列表区**：每道菜一行，包含菜品名 + 星级平均分（★渲染） + 分数值 + 评价人数
- **空状态**：当无法提取到菜品时显示提示文字
- **已评标记**：当前用户已评过的菜品右侧显示"已评 X星"

### Block 4: 评论区域（已有，不变）

office-section 包裹的评论区。

### Block 5: 打分弹窗（新增浮层）

点击"为菜品打分"按钮弹出：

- **弹窗头部**："为菜品打分"标题 + 关闭按钮
- **菜品打分列表**：每个菜品名称 + 5颗可选星星（点击选星，支持取消重选）
- 已评过的菜品直接显示分数且不可操作
- **底部操作栏**：取消 + 提交打分 按钮

## CloudBase MCP (tcb)

- **Purpose**: 创建 `menu_ratings` 数据库集合并配置 READONLY 安全规则
- **Expected outcome**: 成功创建新集合并设置正确的访问权限规则，使云函数可读写、小程序端可读取

## Skill - cloudbase

- **Purpose**: 参考 CloudBase 小程序开发规范确保云函数扩展和数据库操作符合最佳实践
- **Expected outcome**: 确保 menuManager 云函数的新增 action 遵循现有代码模式和编码规范