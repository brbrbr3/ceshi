# 项目文档归置计划

## 目标
将散落在项目根目录的规范文档按照类型和用途重新组织到合适的位置。

## 当前文档分布

### 根目录（需要整理）
- `ANNOUNCEMENT_UI_REDESIGN.md` - 通知公告UI重设计总结
- `IMPORT_WORKFLOW_GUIDE.md` - 工作流模板导入指南
- `WORKFLOW_AUTO_INIT.md` - 工作流自动初始化说明
- `WORKFLOW_IMPORT_GUIDE.md` - 通知公告工作流模板导入指南
- `WORKFLOW_MCP_EXECUTION_STANDARD.md` - MCP工具自动执行规范

### .codebuddy/（规范文档）
- `CODING_STANDARDS.md` - 编码规范
- `DATABASE_COLLECTIONS_REFERENCE.md` - 数据库集合参考
- `PERMISSION-MANAGEMENT.md` - 权限管理

### .codebuddy/docs/（技术文档）
- `pagination-framework.md` - 分页框架

### .codebuddy/workflow/（工作流相关）
- `README.md` - 工作流框架说明
- `DEPLOYMENT.md` - 工作流部署指南
- `DEPLOYMENT_REPORT.md` - 部署报告
- `SUBSCRIBE_MESSAGE_CONFIG.md` - 订阅消息配置
- `WORKFLOW_INTEGRATION_REPORT.md` - 集成报告
- `example-templates.js` - 示例模板

## 归置方案

### 方案A：按文档类型分类（推荐）

```
项目根目录/
├── README.md（保留：项目主说明）
│
.codebuddy/
├── docs/
│   ├── CODING_STANDARDS.md（规范）
│   ├── MCP_EXECUTION_STANDARD.md（规范，从根目录移入）
│   ├── DATABASE_COLLECTIONS_REFERENCE.md（参考）
│   ├── PERMISSION-MANAGEMENT.md（参考）
│   ├── pagination-framework.md（技术文档）
│   │
│   └── features/（功能文档）
│       ├── ANNOUNCEMENT_UI_REDESIGN.md（通知公告UI）
│       └── WORKFLOW_AUTO_INIT.md（工作流自动初始化）
│
└── workflow/
    ├── README.md
    ├── DEPLOYMENT.md
    ├── DEPLOYMENT_REPORT.md
    ├── SUBSCRIBE_MESSAGE_CONFIG.md
    ├── WORKFLOW_INTEGRATION_REPORT.md
    ├── example-templates.js
    │
    └── guides/（工作流指南）
        ├── IMPORT_WORKFLOW_GUIDE.md（工作流导入）
        └── WORKFLOW_IMPORT_GUIDE.md（通知公告导入，可能需要合并）
```

### 方案B：按功能模块分类

```
项目根目录/
├── README.md（保留）
│
.codebuddy/
├── docs/
│   ├── standards/（规范）
│   │   ├── CODING_STANDARDS.md
│   │   └── MCP_EXECUTION_STANDARD.md
│   │
│   ├── database/（数据库）
│   │   └── DATABASE_COLLECTIONS_REFERENCE.md
│   │
│   ├── features/（功能文档）
│   │   ├── ANNOUNCEMENT_UI_REDESIGN.md
│   │   └── WORKFLOW_AUTO_INIT.md
│   │
│   └── technical/（技术文档）
│       ├── PERMISSION-MANAGEMENT.md
│       └── pagination-framework.md
│
└── workflow/
    └── guides/
        ├── IMPORT_WORKFLOW_GUIDE.md
        └── WORKFLOW_IMPORT_GUIDE.md
```

## 推荐方案：方案A

**理由**：
1. **简洁明了**：目录结构较浅，容易导航
2. **分类清晰**：按文档类型（规范/功能/技术）分类
3. **现有结构**：保持 `.codebuddy/workflow/` 的现有结构
4. **易于维护**：新增文档容易找到合适的位置

## 执行步骤

### 步骤1：移动规范类文档
- `WORKFLOW_MCP_EXECUTION_STANDARD.md` → `.codebuddy/docs/MCP_EXECUTION_STANDARD.md`

### 步骤2：移动功能类文档
- `ANNOUNCEMENT_UI_REDESIGN.md` → `.codebuddy/docs/features/ANNOUNCEMENT_UI_REDESIGN.md`
- `WORKFLOW_AUTO_INIT.md` → `.codebuddy/docs/features/WORKFLOW_AUTO_INIT.md`

### 步骤3：整理工作流文档
- `IMPORT_WORKFLOW_GUIDE.md` → `.codebuddy/workflow/guides/IMPORT_WORKFLOW_GUIDE.md`
- `WORKFLOW_IMPORT_GUIDE.md` → `.codebuddy/workflow/guides/WORKFLOW_IMPORT_GUIDE.md`

### 步骤4：更新README.md中的文档链接
- 更新所有指向这些文档的链接

### 步骤5：删除根目录中已移动的文档

## 注意事项

1. **重复文档检查**：
   - `IMPORT_WORKFLOW_GUIDE.md` 和 `WORKFLOW_IMPORT_GUIDE.md` 可能内容重复
   - 需要检查后决定是合并还是保留两个

2. **文档链接更新**：
   - 移动文档后需要更新代码中的注释链接
   - 更新其他文档中的交叉引用

3. **Git操作**：
   - 使用 `git mv` 而不是直接删除+创建，保留历史记录
   - 或者使用 `git add` 和 `git rm` 保留历史

## 最终结构预览

```
d:/WechatPrograms/ceshi/
├── README.md
├── LICENSE
├── package.json
├── project.config.json
│
├── .codebuddy/
│   ├── rules/（规则文件，不动）
│   ├── docs/
│   │   ├── CODING_STANDARDS.md
│   │   ├── MCP_EXECUTION_STANDARD.md
│   │   ├── DATABASE_COLLECTIONS_REFERENCE.md
│   │   ├── PERMISSION-MANAGEMENT.md
│   │   ├── pagination-framework.md
│   │   │
│   │   └── features/
│   │       ├── ANNOUNCEMENT_UI_REDESIGN.md
│   │       └── WORKFLOW_AUTO_INIT.md
│   │
│   ├── workflow/
│   │   ├── README.md
│   │   ├── DEPLOYMENT.md
│   │   ├── DEPLOYMENT_REPORT.md
│   │   ├── SUBSCRIBE_MESSAGE_CONFIG.md
│   │   ├── WORKFLOW_INTEGRATION_REPORT.md
│   │   ├── example-templates.js
│   │   │
│   │   └── guides/
│   │       ├── IMPORT_WORKFLOW_GUIDE.md
│   │       └── WORKFLOW_IMPORT_GUIDE.md
│   │
│   ├── database-rules/
│   └── settings.json
│
├── cloudfunctions/
├── miniprogram/
└── specs/
```

## 执行建议

建议按以下顺序执行：
1. 先检查两个工作流导入文档是否重复
2. 创建必要的子目录（如果需要）
3. 使用 git mv 移动文档（保留历史）
4. 更新所有引用链接
5. 提交更改

这样可以保证：
- Git历史记录完整
- 文档引用不会失效
- 项目结构清晰规范
