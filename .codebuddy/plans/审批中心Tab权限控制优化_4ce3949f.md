---
name: 审批中心Tab权限控制优化
overview: 无审批权限用户只显示"我发起的"tab页，其他tab不显示；同时优化详情弹窗关闭动画
todos:
  - id: define-tab-config
    content: 在 approval.js 定义 TAB_CONFIG 常量和 generateTabs 方法
    status: completed
  - id: dynamic-tabs-render
    content: 修改 loadApprovalData 使用动态生成的 tabs
    status: completed
    dependencies:
      - define-tab-config
  - id: simplify-switch-tab
    content: 简化 switchTab 方法，移除权限检查逻辑
    status: completed
    dependencies:
      - define-tab-config
  - id: update-wxml-template
    content: 更新 approval.wxml 移除 is-disabled 条件判断
    status: completed
  - id: cleanup-wxss-styles
    content: 删除 approval.wxss 中的 .is-disabled 样式
    status: completed
---

## 用户需求

无审批权限人员进入审批中心，只显示"我发起的"tab页，其他tab不显示（隐藏而非禁用）。

## 产品概述

审批中心页面针对不同权限用户展示不同的tab列表：

- **有审批权限用户**：显示全部3个tab（待审批、我发起的、已处理）
- **无审批权限用户**：只显示1个tab（我发起的）

## 核心功能

- 根据canReview权限动态生成tabs数组
- 无权限用户无法看到其他tab，从根本上避免误操作
- 遵循编码规范，避免硬编码tab配置

## 技术栈

- 微信小程序原生开发（WXML、WXSS、JS）
- 动态数据绑定

## 实现方案

### 核心思路：动态生成tabs数组

将tabs从静态定义改为动态生成，根据canReview权限决定显示哪些tab。

### 改动点

| 文件 | 改动内容 |
| --- | --- |
| approval.js | 1. 定义TAB_CONFIG常量（避免硬编码）<br>2. 添加generateTabs方法动态生成tabs<br>3. 在loadApprovalData中调用generateTabs |
| approval.wxml | 移除is-disabled条件判断（因为无权限用户看不到其他tab） |
| approval.wxss | 可删除.is-disabled样式（可选，保留不影响功能） |


### 数据流

```
云函数返回canReview → loadApprovalData获取权限 → generateTabs(canReview) → 渲染对应tab列表
```

## 目录结构

```
miniprogram/pages/office/approval/
├── approval.js      # [MODIFY] 动态生成tabs，定义TAB_CONFIG常量
├── approval.wxml    # [MODIFY] 移除is-disabled条件判断
└── approval.wxss    # [MODIFY] 删除.is-disabled样式（可选）
```

## 实现要点

### 1. 云函数常量定义（initSystemConfig/index.js）

添加审批中心配置常量：

```javascript
// ==================== 审批中心配置 ====================
{
  type: 'approval',
  key: 'APPROVAL_REVIEWER_ROLES',
  value: ['馆领导', '部门负责人'],
  description: '具有审批权限的角色列表（管理员默认有审批权限）',
  sort: 60
},
{
  type: 'approval',
  key: 'APPROVAL_TABS',
  value: [
    { key: 'pending', label: '待审批' },
    { key: 'mine', label: '我发起的' },
    { key: 'done', label: '已处理' }
  ],
  description: '审批中心tab列表配置',
  sort: 61
},
{
  type: 'approval',
  key: 'APPROVAL_TAB_PERMISSION',
  value: {
    withReview: ['pending', 'mine', 'done'],    // 有审批权限显示的tab
    withoutReview: ['mine']                      // 无审批权限显示的tab
  },
  description: '审批中心tab权限映射（前端根据canReview选择对应tab列表）',
  sort: 62
}
```

**权限判断逻辑说明**：

- 云函数 `officeAuth/getApprovalData` 已返回 `canReview` 字段
- `canReview = 用户已审核 && (isAdmin || role在APPROVAL_REVIEWER_ROLES中)`
- 前端直接使用 `canReview` 判断，无需重复计算

### 2. 前端获取常量（approval.js）

```javascript
// 在 loadConstants 中获取
const approvalTabs = allConstants.approvalTabs || []
const approvalTabPermission = allConstants.approvalTabPermission || { withReview: ['pending', 'mine', 'done'], withoutReview: ['mine'] }
```

### 3. 动态生成tabs

```javascript
generateTabs(canReview) {
  const permissionKey = canReview ? 'withReview' : 'withoutReview'
  const allowedKeys = this.data.approvalTabPermission[permissionKey] || ['mine']
  return this.data.approvalTabs.filter(tab => allowedKeys.includes(tab.key))
}
```

### 4. 简化switchTab

移除权限检查逻辑，因为无权限用户根本看不到其他tab

### 5. 保持分页状态兼容

pagination对象结构不变，只是无权限用户不会访问pending/done的分页