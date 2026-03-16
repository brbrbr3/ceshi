# 项目文档组织说明

## 文档结构

本项目采用分层文档结构，便于查找和维护。

---

## 文档目录树

```
d:/WechatPrograms/ceshi/
├── README.md（项目主说明文档，保留在根目录）
│
├── .codebuddy/
│   ├── README_ORGANIZATION.md（本文件：文档组织说明）
│   ├── DOCS_ORGANIZATION_PLAN.md（文档归置计划）
│   │
│   ├── rules/（CloudBase规则，AI助手使用）
│   │   ├── tcb/
│   │   │   ├── rules/
│   │   │   │   ├── cloudbase-platform/（平台规则）
│   │   │   │   ├── ai-model-web/（Web AI模型规则）
│   │   │   │   ├── ai-model-nodejs/（Node.js AI模型规则）
│   │   │   │   ├── auth-web/（Web认证规则）
│   │   │   │   ├── cloud-functions/（云函数规则）
│   │   │   │   ├── miniprogram-development/（小程序开发规则）
│   │   │   │   ├── ...（其他规则）
│   │   │   └── rules.md（规则索引）
│   │
│   ├── docs/（项目文档，按类型分类）
│   │   ├── CODING_STANDARDS.md（编码规范）
│   │   ├── MCP_EXECUTION_STANDARD.md（MCP工具自动执行规范）
│   │   ├── DATABASE_COLLECTIONS_REFERENCE.md（数据库集合参考）
│   │   ├── PERMISSION-MANAGEMENT.md（权限管理）
│   │   ├── pagination-framework.md（分页框架）
│   │   │
│   │   └── features/（功能文档）
│   │       ├── ANNOUNCEMENT_UI_REDESIGN.md（通知公告UI重设计）
│   │       └── WORKFLOW_AUTO_INIT.md（工作流自动初始化）
│   │
│   ├── workflow/（工作流相关文档）
│   │   ├── README.md（工作流框架说明）
│   │   ├── DEPLOYMENT.md（工作流部署指南）
│   │   ├── DEPLOYMENT_REPORT.md（部署报告）
│   │   ├── SUBSCRIBE_MESSAGE_CONFIG.md（订阅消息配置）
│   │   ├── WORKFLOW_INTEGRATION_REPORT.md（集成报告）
│   │   ├── example-templates.js（示例模板）
│   │   │
│   │   └── guides/（工作流指南）
│   │       ├── IMPORT_WORKFLOW_GUIDE.md（工作流模板导入指南）
│   │       └── WORKFLOW_IMPORT_GUIDE.md（通知公告工作流导入）
│   │
│   ├── database-rules/（数据库规则）
│   └── settings.json（配置文件）
│
├── cloudfunctions/（云函数）
├── miniprogram/（小程序前端）
└── specs/（规格文档）
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

**目标读者**：
- AI助手（主要）
- 开发者（参考）

---

### 3. `.codebuddy/docs/` - 项目文档

**用途**：项目的通用文档和规范

#### 3.1 核心文档（直接在 docs/ 目录）

**`CODING_STANDARDS.md`** - 编码规范
- 代码风格指南
- 命名规范
- 文件组织规范

**`MCP_EXECUTION_STANDARD.md`** - MCP工具自动执行规范
- 定义AI助手如何使用MCP工具
- 禁止让用户手动操作控制台
- 工具使用最佳实践

**`DATABASE_COLLECTIONS_REFERENCE.md`** - 数据库集合参考
- 所有数据库集合的说明
- 字段定义
- 使用示例

**`PERMISSION-MANAGEMENT.md`** - 权限管理
- 数据库权限配置
- 访问控制规则

**`pagination-framework.md`** - 分页框架
- 分页组件使用指南

#### 3.2 功能文档（在 docs/features/ 目录）

**`ANNOUNCEMENT_UI_REDESIGN.md`** - 通知公告UI重设计
- 设计对比
- 改进点说明
- 实施细节

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

#### 4.1 核心文档（直接在 workflow/ 目录）

**`README.md`** - 工作流框架说明
- 框架介绍
- 核心特性
- 快速开始

**`DEPLOYMENT.md`** - 工作流部署指南
- 部署步骤
- 配置说明

**`DEPLOYMENT_REPORT.md`** - 部署报告
- 部署记录
- 版本信息

**`SUBSCRIBE_MESSAGE_CONFIG.md`** - 订阅消息配置
- 订阅消息模板配置
- 使用说明

**`WORKFLOW_INTEGRATION_REPORT.md`** - 集成报告
- 集成情况
- 测试结果

**`example-templates.js`** - 示例模板
- 工作流模板示例代码

#### 4.2 指南文档（在 workflow/guides/ 目录）

**`IMPORT_WORKFLOW_GUIDE.md`** - 工作流模板导入指南
- 通用的工作流模板导入流程
- 适用于所有工作流类型

**`WORKFLOW_IMPORT_GUIDE.md`** - 通知公告工作流导入
- 专门针对通知公告的导入指南
- 问题排查

**目标读者**：
- 开发者（主要）
- 运维人员

---

## 文档命名规范

### 1. 文件名格式

- 使用英文单词，大写字母分隔
- 例如：`CODING_STANDARDS.md`, `MCP_EXECUTION_STANDARD.md`

### 2. 目录结构

- 按文档类型分层：`rules/`, `docs/`, `workflow/`
- 功能文档放在 `docs/features/`
- 指南文档放在 `workflow/guides/`

### 3. 标题格式

- 使用 `#` 作为一级标题
- 标题与文件名保持一致
- 添加日期和版本信息

---

## 文档维护规范

### 1. 新增文档时

1. 确定文档类型（规范/功能/指南）
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
→ 查看 `.codebuddy/docs/CODING_STANDARDS.md`

### 查找MCP工具使用规范
→ 查看 `.codebuddy/docs/MCP_EXECUTION_STANDARD.md`

### 查找数据库参考
→ 查看 `.codebuddy/docs/DATABASE_COLLECTIONS_REFERENCE.md`

### 查找功能说明
→ 查看 `.codebuddy/docs/features/` 目录
→ 选择对应功能的文档

### 查找工作流文档
→ 查看 `.codebuddy/workflow/` 目录
→ 框架说明在 `README.md`
→ 部署指南在 `DEPLOYMENT.md`
→ 具体导入指南在 `guides/` 子目录

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-03-16 | 1.0 | 初始版本，完成文档归置 |

---

**提示：本文档会随着项目文档的增删改自动更新，请保持最新状态。**
