---
name: officeAuth工单处理重构-消除硬编码
overview: 重构 officeAuth/index.js 中的工单处理逻辑，将硬编码改为基于 displayConfig 的动态映射，使新增工单类型无需修改代码。
todos:
  - id: add-mapping-function
    content: 添加通用字段映射函数 mapOrderToDisplayItem
    status: completed
  - id: refactor-minelist
    content: 重构 mineList 硬编码逻辑
    status: completed
    dependencies:
      - add-mapping-function
  - id: refactor-pendinglist
    content: 重构 pendingList 硬编码逻辑
    status: completed
    dependencies:
      - add-mapping-function
  - id: refactor-donelist
    content: 重构 doneList 硬编码逻辑
    status: completed
    dependencies:
      - add-mapping-function
  - id: deploy-and-test
    content: 部署云函数并验证四种工单类型
    status: completed
    dependencies:
      - refactor-minelist
      - refactor-pendinglist
      - refactor-donelist
---

## 需求概述

重构 `cloudfunctions/officeAuth/index.js` 中的工单类型处理逻辑，消除硬编码问题，实现基于 `displayConfig` 的动态字段映射。

## 核心问题

`getApprovalData` 函数中有三处完全相同的硬编码处理逻辑：

- mineList (719-814行) - 我的申请列表
- pendingList (873-962行) - 待审批列表  
- doneList (1075-1158行) - 已审批列表

每新增一种工单类型都需在三处同步添加代码，`passport_application` 就是被遗漏的例子。

## 解决目标

- 遵循编码规范 7.3：**卡片和详情页使用 `displayConfig` 动态配置字段，禁止硬编码**
- 新增工单类型无需修改云函数代码
- 消除代码重复，提升可维护性

## 技术方案

### 重构策略

创建通用字段映射函数，将 `businessData` 展开到顶层对象，使前端可通过 `displayConfig.detailFields` 中配置的字段路径直接获取值。

### 核心改动

**1. 新增通用映射函数** `mapOrderToDisplayItem`

```javascript
/**
 * 通用工单字段映射函数（消除硬编码）
 * 将 businessData 展开到顶层，使 displayConfig 配置的字段可直接访问
 */
function mapOrderToDisplayItem(order, options = {}) {
  const { taskInfo, approvalInfo, reviewRemark, templateMap, isCurrentApprover } = options
  
  // 状态映射
  const statusMap = {
    'completed': 'approved',
    'rejected': 'rejected', 
    'terminated': 'terminated',
    'in_progress': 'pending'
  }
  const status = statusMap[order.workflowStatus] || 'pending'
  
  // 基础字段
  const baseItem = {
    _id: taskInfo?._id || order._id,
    orderId: order._id,
    openid: order.businessData?.applicantId || '',
    name: order.businessData?.applicantName || '',
    avatarText: order.businessData?.applicantName?.slice(0, 1) || '申',
    status,
    submittedAt: order.createdAt,
    orderType: order.orderType,
    requestType: templateMap?.[order.orderType]?.name || order.orderType,
    currentStep: order.currentStep,
    workflowSnapshot: order.workflowSnapshot,
    displayConfig: order.workflowSnapshot?.displayConfig || null,
    orderNo: order.orderNo,
    // 审批相关
    reviewRemark: reviewRemark || '',
    reviewedAt: approvalInfo?.reviewedAt || order.updatedAt,
    reviewedBy: approvalInfo?.reviewedBy || '',
    // 任务相关
    taskId: taskInfo?._id || null,
    taskName: taskInfo?.stepName || null,
    isCurrentApprover: isCurrentApprover || false
  }
  
  // 关键：展开 businessData 到顶层
  return {
    ...baseItem,
    ...(order.businessData || {})
  }
}
```

**2. 替换三处硬编码逻辑**

将三处 if-else 分支统一替换为：

```javascript
return mapOrderToDisplayItem(order, {
  taskInfo,
  approvalInfo,
  reviewRemark,
  templateMap,
  isCurrentApprover
})
```

### 数据流对比

**重构前**（硬编码）：

```
order.orderType === 'medical_application' 
  → 手动映射 patientName, relation, medicalDate...
order.orderType === 'user_profile_update'
  → 手动映射 gender, birthday, role...
else
  → 默认映射（注册申请）
```

**重构后**（动态）：

```
mapOrderToDisplayItem(order)
  → 返回 baseItem + ...businessData
  → 前端通过 displayConfig.detailFields[].field 读取值
```

### 兼容性保障

- 返回对象包含原有所有基础字段（`_id`, `status`, `orderType` 等）
- `displayConfig` 已存在于返回数据中，前端无需改动
- `businessData` 展开后字段名与 `displayConfig.detailFields[].field` 一致

### 文件改动

| 文件 | 改动类型 | 说明 |
| --- | --- | --- |
| `cloudfunctions/officeAuth/index.js` | [MODIFY] | 添加通用函数，替换三处硬编码 |


### 性能影响

- 正向：减少代码分支判断，略微提升执行效率
- 内存：`Object spread` 操作开销可忽略

### 风险控制

- 前端组件通过 `displayConfig` 读取字段，重构后字段路径不变
- 测试验证四种工单类型列表渲染正确