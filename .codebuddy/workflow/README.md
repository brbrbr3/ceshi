# 工作流基础框架 - 使用指南

## 概述

工作流基础框架为智慧图书馆小程序提供通用的审批流程管理能力,支持从简单的单步审批到复杂的多步骤流转(包括并行审批、条件分支、回退、补充资料等)。

## 核心特性

✅ **灵活的模板配置**: 通过配置工作流模板定义审批流程,无需修改代码  
✅ **版本控制**: 模板支持版本管理,升级不影响进行中的流程  
✅ **多步审批**: 支持串行、并行、条件分支等多种流程模式  
✅ **并行审批**: 支持会签(全员通过)和或签(一人通过)  
✅ **流程回退**: 支持退回到申请人补充资料或退回到上一步骤  
✅ **条件分支**: 基于业务数据动态选择审批路径  
✅ **超时处理**: 支持自动通过、自动驳回、升级、提醒等策略  
✅ **完整审计**: 所有操作均有日志记录,支持合规审计  
✅ **权限控制**: 严格的数据访问权限控制  

## 快速开始

### 1. 创建工作流模板

首先需要在`workflow_templates`集合中创建模板,定义审批流程。

```javascript
// 示例: 用户注册审批(单步审批)
{
  "name": "用户注册审批",
  "code": "user_registration",
  "version": 1,
  "description": "新用户注册审批流程",
  "steps": [{
    "stepNo": 1,
    "stepName": "管理员审批",
    "stepType": "serial",
    "approverType": "role",
    "approverConfig": {
      "roleIds": ["admin"]
    },
    "canReject": true,
    "timeout": 72,
    "timeoutAction": "remind"
  }],
  "status": "active",
  "createdAt": 1710403200000,
  "updatedAt": 1710403200000
}
```

### 2. 提交工单

从前端调用工作流引擎提交工单:

```javascript
// 小程序端调用云函数
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'submitOrder',
    orderType: 'user_registration',
    businessData: {
      applicantId: app.globalData.openid,
      applicantName: '张三',
      // ...其他业务数据
    }
  }
}).then(res => {
  if (res.result.code === 0) {
    console.log('工单提交成功:', res.result.data.orderNo)
  }
})
```

### 3. 审批任务

审批人查询待办并执行审批:

```javascript
// 1. 查询我的待办
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'getMyTasks',
    page: 1,
    pageSize: 20
  }
}).then(res => {
  this.setData({ tasks: res.result.data.list })
})

// 2. 审批任务
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'approveTask',
    taskId: taskId,
    action: 'approve', // 或 'reject', 'return'
    comment: '审批意见',
    operatorName: '李四'
  }
}).then(res => {
  wx.showToast({ title: '审批成功', icon: 'success' })
})
```

## 数据库集合说明

### 1. workflow_templates (工作流模板)

存储工作流的模板配置,包括步骤、审批人、条件等。

**关键字段**:
- `code`: 模板唯一标识(如`user_registration`)
- `version`: 版本号(自动递增)
- `steps`: 步骤配置数组
- `status`: 模板状态(`active`/`inactive`)

### 2. work_orders (工单)

存储所有业务申请记录,是工作流的核心数据。

**关键字段**:
- `orderNo`: 工单编号(自动生成)
- `orderType`: 工单类型(对应模板code)
- `workflowSnapshot`: 流程配置快照(审批时保存)
- `workflowStatus`: 流程状态(`pending`/`completed`/`rejected`/`supplement`)

### 3. workflow_tasks (任务节点)

存储每个审批步骤的任务记录。

**关键字段**:
- `approverId`: 审批人openid
- `taskStatus`: 任务状态(`pending`/`approved`/`rejected`/`cancelled`)
- `parallelGroupId`: 并行组ID(并行任务共享)

### 4. workflow_logs (审计日志)

记录所有操作日志,用于审计和追溯。

**关键字段**:
- `action`: 操作类型(`submit`/`approve`/`reject`/`return`/`cancel`)
- `operatorId`: 操作人openid
- `beforeData`/`afterData`: 操作前后数据快照

## 云函数API

### workflowEngine (工作流引擎)

#### 提交工单
```javascript
{
  action: 'submitOrder',
  orderType: String,      // 工单类型
  businessData: Object     // 业务数据
}
```

#### 查询我的工单
```javascript
{
  action: 'getMyOrders',
  status: String,        // 可选: pending/completed/rejected/supplement
  page: Number,
  pageSize: Number
}
```

#### 查询我的待办任务
```javascript
{
  action: 'getMyTasks',
  page: Number,
  pageSize: Number
}
```

#### 审批任务
```javascript
{
  action: 'approveTask',
  taskId: String,
  action: String,        // approve/reject/return
  comment: String,
  operatorName: String,  // 可选
  attachments: Array     // 可选
}
```

#### 查询工单详情
```javascript
{
  action: 'getOrderDetail',
  orderId: String
}
```

#### 补充资料
```javascript
{
  action: 'supplementOrder',
  orderId: String,
  supplementData: Object,
  comment: String
}
```

#### 撤回工单
```javascript
{
  action: 'cancelOrder',
  orderId: String
}
```

## 常见场景示例

### 场景1: 单步审批(用户注册)

```javascript
// 模板配置
{
  "code": "user_registration",
  "steps": [{
    "stepNo": 1,
    "stepName": "管理员审批",
    "stepType": "serial",
    "approverType": "role",
    "approverConfig": { "roleIds": ["admin"] }
  }]
}

// 提交流程自动创建步骤1的任务
// 审批人通过后流程结束
```

### 场景2: 多步串行审批(请假流程)

```javascript
{
  "code": "leave_request",
  "steps": [
    {
      "stepNo": 1,
      "stepName": "直属领导审批",
      "approverType": "expression",
      "approverConfig": { "expression": "applicant.leader" }
    },
    {
      "stepNo": 2,
      "stepName": "HR审批",
      "approverType": "role",
      "approverConfig": { "roleIds": ["hr"] }
    }
  ]
}

// 步骤1通过后自动创建步骤2的任务
```

### 场景3: 并行审批(购车流程)

```javascript
{
  "code": "car_purchase",
  "steps": [
    {
      "stepNo": 1,
      "stepName": "资料审核",
      "stepType": "parallel",
      "parallelConfig": { "parallelType": "and" }, // 会签
      "approverType": "role",
      "approverConfig": { "roleIds": ["manager", "finance"] }
    },
    {
      "stepNo": 2,
      "stepName": "领导审批",
      "stepType": "serial",
      "approverType": "user",
      "approverConfig": { "userIds": ["leader_openid"] }
    }
  ]
}

// 步骤1会创建2个并行任务(manager和finance)
// 2个任务都通过后才会进入步骤2
```

### 场景4: 条件分支(请假流程)

```javascript
{
  "code": "leave_request",
  "steps": [
    {
      "stepNo": 1,
      "stepName": "直属领导审批",
      "approverType": "expression",
      "approverConfig": { "expression": "applicant.leader" }
    },
    {
      "stepNo": 2,
      "stepName": "HR审批",
      "condition": {
        "field": "days",
        "operator": "gt",
        "value": 3
      },
      "approverType": "role",
      "approverConfig": { "roleIds": ["hr"] }
    },
    {
      "stepNo": 3,
      "stepName": "馆领导审批",
      "condition": {
        "field": "days",
        "operator": "gt",
        "value": 7
      },
      "approverType": "role",
      "approverConfig": { "roleIds": ["director"] }
    }
  ]
}

// 如果days>3,会创建步骤2的任务
// 如果days>7,会同时创建步骤2和步骤3的任务
```

### 场景5: 流程回退(补充资料)

```javascript
// 审批人操作
{
  action: 'approveTask',
  taskId: 'task_id',
  action: 'return',
  comment: '请补充身份证复印件'
}

// 系统会:
// 1. 将工单状态改为supplement
// 2. 取消所有待处理任务
// 3. 发送通知给申请人

// 申请人补充资料
{
  action: 'supplementOrder',
  orderId: 'order_id',
  supplementData: { idCardFile: 'file_url' },
  comment: '已补充资料'
}

// 系统会:
// 1. 合并补充数据到businessData
// 2. 恢复工单状态为pending
// 3. 重新创建被退回步骤的任务
```

## 安全配置

数据库安全规则位于`.codebuddy/database-rules/workflow-rules.json`,需要通过`writeSecurityRule`工具应用到数据库。

**权限规则**:
- 工作流模板: 仅管理员可读写
- 工单: 申请人可读写自己的工单
- 任务: 审批人可读写分配给自己的任务
- 日志: 申请人可看自己的日志,管理员可看所有日志

## 部署步骤

### 1. 部署云函数

```bash
# 在项目根目录执行
tcb fn deploy workflowEngine
tcb fn deploy workflowTemplate
tcb fn deploy workflowMonitor
tcb fn deploy workflowNotify
```

### 2. 创建数据库集合

通过CloudBase控制台手动创建5个集合:
- `workflow_templates`
- `work_orders`
- `workflow_tasks`
- `workflow_logs`
- `workflow_subscriptions`

### 3. 配置数据库安全规则

```javascript
// 调用writeSecurityRule MCP工具
writeSecurityRule({
  resourceType: 'noSQL',
  resourceId: 'workflow_templates',
  rule: '...'
})
// 对其他4个集合重复此操作
```

### 4. 创建初始模板

在`workflow_templates`集合中插入模板数据,参考上面的场景示例。

## 扩展开发

### 添加新的审批人类型

在`resolveApprovers()`函数中添加新的case分支。

### 添加新的条件运算符

在`evaluateCondition()`函数中添加新的operator case。

### 添加新的超时处理策略

在`handleTimeoutTasks()`函数中添加新的action case。

## 注意事项

⚠️ **模板版本**: 修改模板时建议创建新版本,不要直接修改现有版本,避免影响进行中的流程  
⚠️ **快照机制**: 工单创建时会保存模板快照,后续模板修改不影响进行中的流程  
⚠️ **权限验证**: 所有审批操作前都要验证权限,防止未授权访问  
⚠️ **日志记录**: 关键操作必须记录日志,便于审计和问题追溯  
⚠️ **超时配置**: 合理设置超时时间,避免任务长期悬而未决  

## 相关文档

- 需求文档: `specs/workflow-framework/requirements.md`
- 技术方案: `specs/workflow-framework/design.md`
- 任务清单: `specs/workflow-framework/tasks.md`
- 数据库规则: `.codebuddy/database-rules/workflow-rules.json`

## 技术支持

如有问题,请参考:
- CloudBase文档: https://docs.cloudbase.net/
- 项目issue: 提交到项目仓库

---

**文档版本**: v1.0
**创建日期**: 2025-03-14
**最后更新**: 2025-03-14
