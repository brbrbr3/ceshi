---
name: 创建passport_records数据库集合
overview: 为护照领用功能创建 passport_records 集合，包含索引和安全规则配置
todos:
  - id: create-collection
    content: Use [mcp:CloudBase MCP] 创建 passport_records 集合
    status: pending
  - id: create-indexes
    content: Use [mcp:CloudBase MCP] 配置索引（orderId唯一索引、status、borrowerOpenids、borrowedAt）
    status: pending
    dependencies:
      - create-collection
  - id: set-security-rule
    content: Use [mcp:CloudBase MCP] 配置 ADMINONLY 安全规则
    status: pending
    dependencies:
      - create-collection
---

## 需求概述

创建 `passport_records` 数据库集合，用于存储护照领用记录。该集合被 `passportManager` 云函数和 `workflowEngine` 云函数引用，目前不存在，需要创建。

## 核心功能

- 创建 NoSQL 集合 `passport_records`
- 配置必要的索引（orderId、status、borrowerOpenids、borrowedAt）
- 配置安全规则（仅允许云函数访问）

## 技术方案

### 集合字段结构

基于 `workflowEngine/index.js` 第1376-1403行的代码分析：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| orderId | string | 关联工单ID |
| orderNo | string | 工单编号 |
| applicantId | string | 申请人openid |
| applicantName | string | 申请人姓名 |
| borrowerNames | string[] | 领用人姓名列表 |
| borrowerOpenids | string[] | 领用人openid列表 |
| borrowerInfoList | array | 领用人详细信息 |
| borrowDate | string | 借用日期 |
| expectedReturnDate | string | 预计归还日期 |
| reason | string | 借用事由 |
| status | string | 状态：borrowed/returned |
| borrowedAt | number | 借出时间戳 |
| borrowedBy | string | 借出操作人openid |
| borrowedByName | string | 借出操作人姓名 |
| returnedAt | number/null | 归还时间戳 |
| returnedBy | string/null | 归还操作人openid |
| returnedByName | string/null | 归还操作人姓名 |
| createdAt | number | 创建时间 |
| updatedAt | number | 更新时间 |


### 索引配置

1. **orderId（唯一索引）** - 用于关联工单查询，确保一个工单只对应一条记录
2. **status** - 用于按状态筛选（在借/已归还）
3. **borrowerOpenids** - 用于查询用户的在借记录
4. **borrowedAt** - 用于按借出时间排序

### 安全规则

采用 `ADMINONLY` 模式，仅允许云函数访问，前端不可直接操作。

## MCP 工具

- **writeNoSqlDatabaseStructure**
- Purpose: 创建 passport_records 集合并配置索引
- Expected outcome: 集合创建成功，索引配置完成

- **writeSecurityRule**
- Purpose: 配置集合安全规则
- Expected outcome: 集合仅允许云函数访问