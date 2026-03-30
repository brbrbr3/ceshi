# 项目文档组织说明

## 文档结构

本项目采用分层文档结构，便于查找和维护。

---

## 文档目录树

```
d:/WechatPrograms/ceshi/
├── README.md（项目主说明文档）
├── project.config.json（微信开发者工具项目配置）
├── project.private.config.json（私有配置）
├── package.json（根目录依赖配置）
├── sitemap.json（小程序索引配置）
│
├── .codebuddy/
│   ├── README_ORGANIZATION.md（本文件：文档组织说明）
│   ├── settings.json（AI助手配置文件）
│   │
│   ├── rules/（CloudBase规则，AI助手使用，57个文件）
│   │   ├── tcb/（CloudBase规则集）
│   │   │   ├── rules/
│   │   │   │   ├── cloudbase-platform/（平台规则）
│   │   │   │   ├── ai-model-web/（Web AI模型规则）
│   │   │   │   ├── ai-model-nodejs/（Node.js AI模型规则）
│   │   │   │   ├── auth-web/（Web认证规则）
│   │   │   │   ├── cloud-functions/（云函数规则）
│   │   │   │   ├── miniprogram-development/（小程序开发规则）
│   │   │   │   ├── ...（其他规则）
│   │   │   └── rules.md（规则索引）
│   │   └── ...（其他规则文件）
│   │
│   ├── docs/（项目文档，按类型分类）
│   │   ├── CODING_STANDARDS.md（编码规范，整合所有子规范）
│   │   ├── DATABASE_COLLECTIONS_REFERENCE.md（数据库集合参考）
│   │   │
│   │   └── features/（功能文档）
│   │       └── WORKFLOW_AUTO_INIT.md（工作流自动初始化）
│   │
│   ├── workflow/（工作流相关文档）
│   │   ├── README.md（工作流框架说明）
│   │   ├── example-templates.js（示例模板）
│   │   └── test-workflow.js（工作流测试）
│   │
│   ├── database-rules/（数据库规则）
│   │   └── workflow-rules.json（工作流数据库规则）
│   │
│   └── plans/（开发计划）
│
├── cloudfunctions/（云函数目录，22个云函数）
│   ├── announcementManager/（通知公告管理）
│   ├── broadcastNotification/（广播通知）
│   ├── dbManager/（数据库管理）
│   ├── feedbackManager/（反馈管理）
│   ├── generateOrderPdf/（订单PDF生成）
│   ├── getSystemConfig/（获取系统配置）
│   ├── haircutManager/（理发管理）
│   ├── holidayManager/（假期管理）
│   ├── initSystemConfig/（初始化系统配置）
│   ├── initWorkflowDB/（初始化工作流数据库）
│   ├── medicalApplication/（医疗申请）
│   ├── meetingRoomManager/（会议室管理）
│   ├── menuManager/（菜单管理）
│   ├── notificationManager/（通知管理）
│   ├── officeAuth/（办公认证）
│   ├── openapi/（开放API）
│   ├── passportExpiryChecker/（护照过期检查）
│   ├── passportManager/（护照管理）
│   ├── permissionManager/（权限管理）
│   ├── repairManager/（报修管理）
│   ├── scheduleManager/（日程管理）
│   ├── tripReport/（出差报告）
│   └── workflowEngine/（工作流引擎）
│
├── miniprogram/（小程序前端）
│   ├── app.js（小程序入口）
│   ├── app.json（小程序配置）
│   ├── app.wxss（全局样式）
│   ├── app-darkmode.json（暗黑模式配置）
│   ├── demo.theme.json（主题配置）
│   ├── config.js（项目配置）
│   ├── sitemap.json（索引配置）
│   │
│   ├── pages/（页面目录，23个页面）
│   │   ├── auth/（认证页面）
│   │   ├── test/（测试页面）
│   │   └── office/（办公模块页面，22个子页面）
│   │       ├── home/（首页）
│   │       ├── profile/（个人中心）
│   │       ├── calendar/（日历）
│   │       ├── contacts/（通讯录）
│   │       ├── notifications/（通知中心）
│   │       ├── help/（帮助中心）
│   │       ├── approval/（审批）
│   │       ├── announcement-list/（通知公告列表）
│   │       ├── announcement-create/（创建通知公告）
│   │       ├── announcement-detail/（通知公告详情）
│   │       ├── haircut/（理发预约）
│   │       ├── menus/（菜单管理）
│   │       ├── menu-detail/（菜单详情）
│   │       ├── menu-edit/（菜单编辑）
│   │       ├── meeting-room/（会议室预约）
│   │       ├── repair/（报修管理）
│   │       ├── feedback/（反馈）
│   │       ├── medical-application/（医疗申请）
│   │       ├── passport/（护照管理）
│   │       ├── task/（任务管理）
│   │       ├── trip-report/（出差报告）
│   │       └── trip-dashboard/（出差看板）
│   │
│   ├── components/（自定义组件，5个）
│   │   ├── approval-card/（审批卡片）
│   │   ├── approval-detail/（审批详情）
│   │   ├── datetime-picker/（日期时间选择器）
│   │   ├── pagination-loading/（分页加载组件）
│   │   └── signature-pad/（签名板）
│   │
│   ├── common/（公共资源）
│   │   ├── lib/weui.wxss（WeUI样式库）
│   │   ├── utils.js（工具函数）
│   │   ├── head.wxml（公共头部模板）
│   │   ├── foot.wxml（公共底部模板）
│   │   └── index.wxss（公共样式）
│   │
│   ├── behaviors/（行为混入）
│   │   └── pagination.js（分页行为）
│   │
│   ├── image/（图片资源）
│   ├── workers/（Web Worker）
│   │   └── fib/（Fibonacci计算Worker）
│   └── miniprogram_npm/（npm构建产物）
│
└── specs/（规格文档）
    └── workflow-framework/（工作流框架规格）
        ├── requirements.md（需求文档）
        ├── design.md（设计文档）
        └── tasks.md（任务文档）
```

---

## 文档分类说明

### 1. 根目录文档

**`README.md`** - 项目主说明文档
- 项目介绍
- 快速开始
- 功能概览
- 其他文档的索引

**保留原因**：
- 项目的门面文档
- 便于外部访问
- 符合开源项目规范

---

### 2. `.codebuddy/rules/` - 规则文档

**用途**：AI助手使用的开发规则和最佳实践

**包含**：
- CloudBase平台规则
- AI模型使用规则
- 认证规则
- 云函数规则
- 数据库规则
- 前端开发规则
- 工作流规则
- UI设计规则

**目标读者**：
- AI助手（主要）
- 开发者（参考）

---

### 3. `.codebuddy/docs/` - 项目文档

**用途**：项目的通用文档和规范

#### 3.1 核心文档（直接在 docs/ 目录）

**`CODING_STANDARDS.md`** - 编码规范（整合文档）
- 数据库相关规范
- 云函数相关规范
- 前端代码规范
- UI设计规范
- 权限控制规范
- 工作流相关规范
- 云函数部署规范
- 错误处理规范
- 数据验证规范
- MCP工具自动执行规范
- 分页加载框架API
- 小程序页面开发规范
- 命令执行规范

**`DATABASE_COLLECTIONS_REFERENCE.md`** - 数据库集合参考
- 所有数据库集合的说明
- 字段定义
- 使用示例

#### 3.2 功能文档（在 docs/features/ 目录）

**`WORKFLOW_AUTO_INIT.md`** - 工作流自动初始化
- 自动初始化机制
- 使用方法
- 常见问题

**目标读者**：
- 开发者（主要）
- AI助手（参考）

---

### 4. `.codebuddy/workflow/` - 工作流文档

**用途**：工作流框架相关文档

#### 4.1 核心文档

**`README.md`** - 工作流框架说明
- 框架介绍
- 核心特性
- 快速开始

**`example-templates.js`** - 示例模板
- 工作流模板示例代码

**`test-workflow.js`** - 工作流测试
- 工作流引擎测试用例

**目标读者**：
- 开发者（主要）
- 运维人员

---

### 5. `.codebuddy/database-rules/` - 数据库规则

**`workflow-rules.json`** - 工作流数据库规则
- 工作流相关数据库的安全规则配置

---

### 6. `.codebuddy/plans/` - 开发计划

**用途**：存储AI助手的开发计划和任务规划文档

---

## 云函数说明

项目包含 22 个云函数，按功能分类：

| 分类 | 云函数 | 说明 |
|------|--------|------|
| 通知公告 | announcementManager, broadcastNotification, notificationManager | 通知的创建、广播与管理 |
| 数据管理 | dbManager, getSystemConfig, initSystemConfig | 数据库操作与系统配置 |
| 工作流 | workflowEngine, initWorkflowDB | 工作流引擎与初始化 |
| 办公服务 | meetingRoomManager, menuManager, haircutManager, repairManager, scheduleManager | 会议室、菜单、理发、报修、日程管理 |
| 审批相关 | medicalApplication, tripReport, feedbackManager | 医疗申请、出差报告、反馈 |
| 证件管理 | passportManager, passportExpiryChecker | 护照管理与过期检查 |
| 权限认证 | officeAuth, permissionManager | 办公认证与权限管理 |
| 其他 | openapi, generateOrderPdf | 开放API与PDF生成 |

---

## 小程序页面说明

### 页面结构（23个页面）

| 模块 | 页面 | 说明 |
|------|------|------|
| 认证 | auth | 登录/注册 |
| 测试 | test | 测试页面 |
| 首页 | office/home | 办公首页 |
| 个人中心 | office/profile | 个人信息管理 |
| 日历 | office/calendar | 日程日历 |
| 通讯录 | office/contacts | 人员通讯录 |
| 通知 | office/notifications | 通知中心 |
| 帮助 | office/help | 帮助中心 |
| 审批 | office/approval | 审批处理 |
| 通知公告 | office/announcement-list, announcement-create, announcement-detail | 公告的列表、创建、详情 |
| 理发 | office/haircut | 理发预约 |
| 菜单 | office/menus, menu-detail, menu-edit | 菜单的列表、详情、编辑 |
| 会议室 | office/meeting-room | 会议室预约 |
| 报修 | office/repair | 报修管理 |
| 反馈 | office/feedback | 意见反馈 |
| 医疗 | office/medical-application | 医疗申请 |
| 护照 | office/passport | 护照管理 |
| 任务 | office/task | 任务管理 |
| 出差 | office/trip-report, trip-dashboard | 出差报告与看板 |

### 自定义组件（5个）

| 组件 | 说明 |
|------|------|
| approval-card | 审批卡片展示 |
| approval-detail | 审批详情展示 |
| datetime-picker | 日期时间选择器 |
| pagination-loading | 分页加载组件 |
| signature-pad | 手写签名板 |

---

## 文档命名规范

### 1. 文件名格式

- 使用英文单词，大写字母分隔
- 例如：`CODING_STANDARDS.md`, `DATABASE_COLLECTIONS_REFERENCE.md`

### 2. 目录结构

- 按文档类型分层：`rules/`, `docs/`, `workflow/`
- 功能文档放在 `docs/features/`
- 开发计划放在 `plans/`

### 3. 标题格式

- 使用 `#` 作为一级标题
- 标题与文件名保持一致
- 添加日期和版本信息

---

## 文档维护规范

### 1. 新增文档时

1. 确定文档类型（规范/功能/指南/计划）
2. 选择合适的目录位置
3. 使用规范的命名格式
4. 更新本文档的目录树
5. 更新 README.md 的文档索引（如需要）

### 2. 移动文档时

1. 使用 `git mv` 命令（保留历史）
2. 更新所有引用链接
3. 更新本文档
4. 提交变更

### 3. 删除文档时

1. 确认无其他文档引用
2. 使用 `git rm` 命令
3. 更新本文档
4. 提交变更

---

## 文档查找指南

### 查找开发规则
→ 查看 `.codebuddy/rules/` 目录
→ 根据功能选择对应的规则文件

### 查找编码规范
→ 查看 `.codebuddy/docs/CODING_STANDARDS.md`（已整合所有子规范）

### 查找数据库参考
→ 查看 `.codebuddy/docs/DATABASE_COLLECTIONS_REFERENCE.md`

### 查找数据库规则
→ 查看 `.codebuddy/database-rules/workflow-rules.json`

### 查找功能说明
→ 查看 `.codebuddy/docs/features/` 目录
→ 选择对应功能的文档

### 查找工作流文档
→ 查看 `.codebuddy/workflow/` 目录
→ 框架说明在 `README.md`
→ 示例模板在 `example-templates.js`

### 查找开发计划
→ 查看 `.codebuddy/plans/` 目录

### 查找规格文档
→ 查看 `specs/` 目录
→ 工作流框架规格在 `specs/workflow-framework/`

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-03-30 | 2.0 | 全面更新：同步实际项目结构，补充云函数、小程序页面、组件的详细目录树；移除已删除的文档引用（DOCS_ORGANIZATION_PLAN、MCP_EXECUTION_STANDARD、PERMISSION-MANAGEMENT、pagination-framework、ANNOUNCEMENT_UI_REDESIGN、workflow部署/集成文档、guides目录）；新增 plans/ 目录、database-rules 详细内容、云函数分类说明、页面与组件说明 |
| 2026-03-16 | 1.0 | 初始版本，完成文档归置 |

---

**提示：本文档会随着项目文档的增删改自动更新，请保持最新状态。**
