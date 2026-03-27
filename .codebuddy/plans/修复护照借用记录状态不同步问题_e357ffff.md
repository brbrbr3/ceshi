---
name: 修复护照借用记录状态不同步问题
overview: 修正数据流向：用户借用记录应从 passport_records 查询，而非 work_orders；管理员借出/归还操作只更新 passport_records，不再更新已结束的工作流。
todos:
  - id: fix-getHistory
    content: 修改 getHistory 从 passport_records 查询用户借用记录
    status: completed
  - id: fix-borrowPassport
    content: 简化 borrowPassport 删除对 work_orders 的更新
    status: completed
  - id: fix-returnPassport
    content: 简化 returnPassport 删除对 work_orders 的更新
    status: completed
  - id: fix-markNotReturned
    content: 简化 markNotReturned 删除对 work_orders 的更新
    status: completed
  - id: fix-frontend-format
    content: 修改前端 formatRecordItem 直接使用 status 字段
    status: completed
---

## 问题分析

用户反馈：管理员点击"确认借出"后，用户"护照借用记录"条目状态未更新。

**根本原因**：数据来源错误。

### 当前错误实现

1. `getHistory` 从 `work_orders` 表查询记录（应从 `passport_records` 查询）
2. 前端 `formatRecordItem` 从 `businessData.recordStatus` 读取状态（应直接读取 `status` 字段）
3. `borrowPassport/returnPassport/markNotReturned` 多余地更新 `work_orders`（工作流已结束，不应再操作）

### 正确的业务逻辑

- 工作流只负责审批流程，审批通过后工作流结束
- `passport_records` 记录在审批通过时创建，之后所有状态变更只操作此表
- 用户查看借用记录应直接查询 `passport_records`

## 修复目标

1. 修改 `getHistory` 从 `passport_records` 查询用户借用记录
2. 简化 `borrowPassport/returnPassport/markNotReturned`，删除对 `work_orders` 的多余更新
3. 调整前端显示逻辑，直接使用 `passport_records.status` 字段

## 修改方案

### 1. passportManager 云函数修改

**getHistory 函数**：从 `passport_records` 查询

- 查询条件：`applicantId` = 当前用户 openid
- 返回 `passport_records` 的完整记录
- 分页参数保持不变

**borrowPassport 函数**：删除更新 work_orders 的代码（第 443-450 行）

**returnPassport 函数**：删除更新 work_orders 的代码（第 489-497 行）

**markNotReturned 函数**：删除更新 work_orders 的代码（第 536-545 行）

### 2. 前端 passport.js 修改

**formatRecordItem 函数**：

- 直接使用 `item.status` 字段判断状态
- 删除从 `businessData.recordStatus` 读取的逻辑
- 状态映射：`approved` → "已批准，待借出"，`borrowed` → "在借中"，`returned` → "已归还"，`not_returned` → "不再收回"

### 3. 数据库字段说明

`passport_records` 状态字段：

- `approved`: 已批准，待借出
- `borrowed`: 在借中
- `returned`: 已归还
- `not_returned`: 不再收回