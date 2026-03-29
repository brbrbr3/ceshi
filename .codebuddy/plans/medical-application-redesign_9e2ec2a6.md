---
name: medical-application-redesign
overview: 将就医申请页面从纯表单模式改造为列表+弹窗模式（参照护照管理页面），包括：页面重构、新增 medical_records 数据库集合、云函数扩展、工作流引擎审批通过后自动创建记录、以及导出PDF功能。
design:
  styleKeywords:
    - 渐变蓝色头部
    - 卡片式列表
    - 按月分组
    - 底部弹窗表单
    - 彩色状态标签
    - 圆角设计
  fontSystem:
    fontFamily: PingFang SC
    heading:
      size: 48rpx
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
      - "#1D4ED8"
      - "#3B82F6"
    background:
      - "#EEF2FF"
      - "#FFFFFF"
    text:
      - "#1E293B"
      - "#64748B"
    functional:
      - "#10B981"
      - "#EF4444"
      - "#F59E0B"
todos:
  - id: create-database-collection
    content: 使用 [MCP:CloudBase MCP] 创建 medical_records 集合、配置ADMINWRITE安全规则和索引
    status: completed
  - id: modify-workflow-engine
    content: 修改 workflowEngine 云函数，就医审批通过后自动创建 medical_records 记录
    status: completed
    dependencies:
      - create-database-collection
  - id: extend-medical-cloud-function
    content: 扩展 medicalApplication 云函数，新增 getHistory 和 generatePdf action，添加 pdfkit 依赖
    status: completed
    dependencies:
      - create-database-collection
  - id: rewrite-frontend-page
    content: 重写就医申请前端页面（js/wxml/wxss/json），实现列表+弹窗+分页+PDF导出
    status: completed
    dependencies:
      - extend-medical-cloud-function
  - id: update-docs-and-fix-references
    content: 更新 DATABASE_COLLECTIONS_REFERENCE.md，修复审批中心复制跳转逻辑，部署云函数
    status: completed
    dependencies:
      - rewrite-frontend-page
---

## 产品概述

将就医申请页从纯表单页面改造为"列表+弹窗表单"模式（参照护照管理页），并新增审批通过后的记录展示与导出功能。

## 用户需求

- 页面进入后展示"就医申请记录"列表，右上角有"添加就医申请"按钮
- 点击按钮弹出底部弹窗填写就医申请表单
- 提交后进入工作流审批（保持现有审批流程不变）
- 审批通过后，记录自动出现在页面下方的列表中
- 点击列表项可查看详情
- 详情中支持导出为PDF文件
- 需要新增数据库集合存储审批通过后的就医记录
- 云函数需要增加记录查询和PDF生成等action

## 核心功能

- 就医申请记录列表（分页加载，按月分组展示）
- 底部弹窗表单（填写就医信息，提交审批）
- 记录详情弹窗（查看完整申请信息）
- PDF导出功能（云函数生成PDF，小程序端预览/转发）

## 技术栈

- 微信小程序原生开发（WXML/WXSS/JS）
- 云函数（Node.js + wx-server-sdk）
- PDF生成：`pdfkit`（纯JS库，适合云函数环境）
- 分页加载：项目已有 `paginationBehavior`

## 实现方案

### 整体策略

参照护照管理页（`passport`）的成熟模式进行改造，核心差异在于就医申请审批通过后无需后续管理操作（借出/收回），只需记录展示和导出。

### 数据架构变更

1. **新建 `medical_records` 集合**：存储审批通过后的就医记录，参照 `passport_records` 的设计模式
2. **修改 `workflowEngine` 云函数**：在就医申请审批通过时自动创建 `medical_records` 记录（参照第1390-1431行护照借用记录创建逻辑）
3. **扩展 `medicalApplication` 云函数**：新增 `getHistory`（分页查询记录）和 `generatePdf`（生成PDF）action

### 医疗记录集合设计 (`medical_records`)

```
字段：
  _id, orderId, orderNo, applicantId, applicantName, applicantRole,
  patientName, relation, medicalDate, institution, otherInstitution,
  reasonForSelection, reason, status('approved'),
  createdAt, updatedAt
```

安全规则：`ADMINWRITE`（云函数写入，所有用户可读）

### PDF生成方案

- 使用 `pdfkit` 库在云函数端生成PDF
- 生成后上传至云存储，返回临时下载链接
- 小程序端通过 `wx.openDocument` 预览PDF
- PDF内容：就医申请表（包含申请信息和审批流程信息）

### 前端页面改造

- 完全重写 `medical-application` 页面，参照 `passport` 页面结构
- 引入 `paginationBehavior` 实现分页加载
- 新增弹窗组件：申请表单弹窗 + 详情弹窗
- 列表按月分组展示，每条记录显示就医人、就医时间、机构、状态
- 页面json配置 `enablePullDownRefresh: true`

### 向后兼容

- 保留现有 `submit` action 不变，前端调用方式不变
- 审批中心（approval页面）的复制功能需要适配新页面结构（移除 `mode=copy` 跳转逻辑，因为新页面不再有直接表单）

## 实现注意事项

- `workflowEngine` 修改需谨慎，仅在 `orderType === 'medical_application' && decision === 'approved'` 时创建记录，与护照逻辑并列
- PDF生成依赖 `pdfkit`，需在 `medicalApplication` 的 `package.json` 中添加依赖并重新部署
- 中文字体支持：`pdfkit` 需要内嵌字体文件才能正确显示中文，使用云存储托管字体文件或使用内置的思源黑体
- 分页查询从 `medical_records` 集合获取（非 `work_orders`），确保只展示审批通过的记录

## 目录结构

```
项目根目录/
├── cloudfunctions/
│   └── medicalApplication/
│       ├── index.js          # [MODIFY] 新增 getHistory、generatePdf action
│       └── package.json      # [MODIFY] 添加 pdfkit 依赖
├── cloudfunctions/
│   └── workflowEngine/
│       └── index.js          # [MODIFY] 就医审批通过后创建 medical_records 记录
├── miniprogram/
│   └── pages/office/medical-application/
│       ├── medical-application.js     # [MODIFY] 重写为列表+弹窗模式
│       ├── medical-application.wxml   # [MODIFY] 重写页面结构
│       ├── medical-application.wxss   # [MODIFY] 重写样式（参照passport风格）
│       └── medical-application.json   # [MODIFY] 添加分页配置
├── miniprogram/
│   └── pages/office/approval/
│       └── approval.js               # [MODIFY] 移除就医申请的复制跳转逻辑
├── .codebuddy/
│   └── docs/
│       └── DATABASE_COLLECTIONS_REFERENCE.md  # [MODIFY] 添加 medical_records 集合定义
```

## 设计风格

参照护照管理页面（passport）的成熟UI模式，保持与办公模块的整体一致性。

### 页面结构

- 渐变色头部（蓝色系，与医疗主题匹配），标题"就医申请"，副标题说明
- section区域：左侧"就医申请记录"标题 + 右侧"添加就医申请"按钮（渐变圆角按钮）
- 按月分组的记录列表，每条记录为白色圆角卡片
- 卡片内容：就医时间（大字）、状态标签（彩色）、就医人、就医机构、就医原因
- 底部弹窗表单：半屏弹窗，包含原有全部表单字段，保留审批流程说明
- 详情弹窗：展示完整申请信息和审批状态
- 空状态提示和加载状态

## Agent Extensions

### MCP

- **CloudBase MCP**
- Purpose: 创建 `medical_records` 数据库集合、配置安全规则和索引
- Expected outcome: 新集合创建完成，安全规则设为 ADMINWRITE，索引创建成功

### Skill

- **pdf**
- Purpose: 参考 PDF 生成最佳实践，确保 pdfkit 在云函数中正确生成含中文的 PDF 文件
- Expected outcome: PDF 生成方案确定，中文字体支持方案明确

- **cloudbase**
- Purpose: 参考云函数部署规范和数据库操作规范
- Expected outcome: 确保云函数修改符合项目规范，部署流程正确