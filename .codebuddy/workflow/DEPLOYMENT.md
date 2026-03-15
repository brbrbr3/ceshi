# 工作流框架部署指南

## 部署状态

✅ **云函数部署完成**
- `workflowEngine` - 工作流引擎核心云函数
- `initWorkflowDB` - 数据库初始化云函数

⚠️ **需要手动创建数据库集合**

初始化脚本检查发现集合不存在,需要在CloudBase控制台手动创建。

## 手动创建数据库集合

### 步骤1: 登录CloudBase控制台

访问控制台:
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlgae64d5d0
```

### 步骤2: 创建NoSQL数据库集合

在控制台导航到 **数据库 → 文档型数据库**,创建以下5个集合:

#### 1. workflow_templates (工作流模板)

```
集合名称: workflow_templates
权限: 自定义
安全规则: 暂不配置(导入后配置)
```

#### 2. work_orders (工单)

```
集合名称: work_orders
权限: 自定义
安全规则: 暂不配置(导入后配置)
```

#### 3. workflow_tasks (任务节点)

```
集合名称: workflow_tasks
权限: 自定义
安全规则: 暂不配置(导入后配置)
```

#### 4. workflow_logs (审计日志)

```
集合名称: workflow_logs
权限: 自定义
安全规则: 暂不配置(导入后配置)
```

#### 5. workflow_subscriptions (订阅消息配置)

```
集合名称: workflow_subscriptions
权限: 自定义
安全规则: 暂不配置(导入后配置)
```

### 步骤3: 导入示例数据

集合创建完成后,重新调用初始化云函数:

```javascript
// 在小程序中或云开发工具中
wx.cloud.callFunction({
  name: 'initWorkflowDB'
}).then(res => {
  console.log('初始化结果:', res.result)
})
```

或者在控制台的云函数页面直接调用`initWorkflowDB`函数。

## 配置数据库安全规则

集合创建并导入数据后,需要配置安全规则。

### 方法1: 通过MCP工具配置

使用`writeSecurityRule`工具为每个集合配置安全规则。

参考配置文件: `.codebuddy/database-rules/workflow-rules.json`

需要为5个集合分别配置:

1. `workflow_templates` - `noSqlDatabase`
2. `work_orders` - `noSqlDatabase`
3. `workflow_tasks` - `noSqlDatabase`
4. `workflow_logs` - `noSqlDatabase`
5. `workflow_subscriptions` - `noSqlDatabase`

### 方法2: 手动配置(临时)

在控制台的 **数据库 → 安全规则** 中手动配置规则。

```json
// workflow_templates - 仅管理员可读写
{
  "read": "auth != null && (get('database.office_users.' + auth.openid + '.role') == '管理员' || get('database.office_users.' + auth.openid + '.isAdmin') == true)",
  "write": "auth != null && (get('database.office_users.' + auth.openid + '.role') == '管理员' || get('database.office_users.' + auth.openid + '.isAdmin') == true)"
}

// work_orders - 申请人可读写自己的工单
{
  "read": "auth != null && (resource.businessData.applicantId == auth.openid || exists(get('database.workflow_tasks.' + auth.openid)))",
  "create": "auth != null",
  "update": "auth != null && resource.businessData.applicantId == auth.openid",
  "delete": "auth != null && resource.businessData.applicantId == auth.openid"
}

// workflow_tasks - 审批人可读写分配给自己的任务
{
  "read": "auth != null && (resource.approverId == auth.openid || resource.orderId in get('database.work_orders.' + auth.openid))",
  "create": "auth != null",
  "update": "auth != null && (resource.approverId == auth.openid || auth.openid == 'system')",
  "delete": "auth != null && auth.openid == 'system'"
}

// workflow_logs - 申请人可看自己的日志,管理员可看所有日志
{
  "read": "auth != null && (resource.orderId in get('database.work_orders.' + auth.openid) || get('database.office_users.' + auth.openid + '.isAdmin') == true)",
  "write": "auth != null"
}

// workflow_subscriptions - 管理员可配置
{
  "read": "auth != null",
  "write": "auth != null && get('database.office_users.' + auth.openid + '.isAdmin') == true)"
}
```

## 验证部署

### 1. 验证云函数

在控制台的 **云函数** 页面检查:
- ✅ `workflowEngine` - 状态应该为"部署中"或"正常"
- ✅ `initWorkflowDB` - 状态应该为"部署中"或"正常"

### 2. 验证数据库集合

在控制台的 **数据库 → 文档型数据库** 页面检查:
- ✅ 5个集合都已创建
- ✅ 集合中都有数据

### 3. 测试工作流引擎

在小程序中测试提交工单:

```javascript
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'submitOrder',
    orderType: 'user_registration',
    businessData: {
      applicantId: 'test_openid',
      applicantName: '测试用户',
      // ...其他业务数据
    }
  }
}).then(res => {
  console.log('提交结果:', res.result)
})
```

## 前端开发

数据库配置完成后,可以开始开发前端页面。参考 `specs/workflow-framework/tasks.md` 的 **Phase 9: 前端页面开发**。

需要开发的页面:
1. 工单提交页面
2. 待办任务列表页面
3. 任务详情与审批页面
4. 我的工单列表页面
5. 工单详情页面(申请人视角)
6. 补充资料页面
7. 流程监控页面(管理员)
8. 模板管理页面(管理员)

## 常见问题

### Q1: 集合已存在但初始化脚本报错?

A: 可能是安全规则限制了访问。检查安全规则配置,确保允许写入。

### Q2: 云函数调用失败?

A: 检查:
1. 云函数是否已部署
2. 云函数名称是否正确
3. 网络环境是否正常

### Q3: 如何查看云函数日志?

A: 在控制台的 **云函数 → 日志** 页面查看执行日志。

### Q4: 导入的数据在哪里?

A: 导入的示例模板在 `workflow_templates` 集合中,可以在控制台查看和修改。

## 下一步

1. ✅ 在控制台手动创建5个数据库集合
2. ✅ 集合创建后调用 `initWorkflowDB` 导入示例数据
3. ✅ 配置数据库安全规则
4. ✅ 测试工作流引擎功能
5. ✅ 开始前端页面开发

---

**文档版本**: v1.0
**创建日期**: 2025-03-14
**最后更新**: 2025-03-14
