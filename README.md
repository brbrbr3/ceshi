# 微信小程序示例
微信小程序示例源码，欢迎扫描以下小程序码体验。

> 提示：请使用微信开发者工具或微信客户端 6.7.2 及以上版本运行。

<img width="200" src="https://res.wx.qq.com/op_res/QqOF7ydl0dkpq-orpebXL-gBspr08VjoFOFGrWvKF9IULLhfT9XhnsSKlvc0gI8d">

## 使用

```
cd demo
npm i
cd miniprogram
npm i
```
完成上述步骤后，使用微信开发者工具，点击【工具-构建npm】

使用[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)打开该示例代码，云开发环境搭建请参考[云开发示例说明](https://github.com/wechat-miniprogram/miniprogram-demo/blob/master/miniprogram/page/cloud/README.md)。

## 工作流基础框架

本项目包含一个通用、可扩展的工作流基础框架，支持从简单的单步审批到复杂的多步骤流转。

### 核心特性

✅ **灵活的模板配置** - 通过配置工作流模板定义审批流程，无需修改代码
✅ **版本控制** - 模板支持版本管理，升级不影响进行中的流程
✅ **多步审批** - 支持串行、并行、条件分支等多种流程模式
✅ **并行审批** - 支持会签（全员通过）和或签（一人通过）
✅ **流程回退** - 支持退回到申请人补充资料或退回到上一步骤
✅ **条件分支** - 基于业务数据动态选择审批路径
✅ **超时处理** - 支持自动通过、自动驳回、升级、提醒等策略
✅ **完整审计** - 所有操作均有日志记录，支持合规审计
✅ **权限控制** - 严格的数据访问权限控制

### 快速开始

#### 1. 部署工作流引擎

```bash
# 部署工作流引擎云函数
cd cloudfunctions/workflowEngine
npm install
# 使用微信开发者工具上传并部署
```

#### 2. 创建数据库集合

在 CloudBase 控制台创建以下集合：
- `workflow_templates` - 工作流模板
- `work_orders` - 工单
- `workflow_tasks` - 任务节点
- `workflow_logs` - 审计日志
- `workflow_subscriptions` - 订阅消息配置

#### 3. 导入示例模板

参考 `.codebuddy/workflow/example-templates.js` 文件，导入示例模板到 `workflow_templates` 集合。

#### 4. 使用工作流

```javascript
// 提交工单
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
})

// 查询我的待办
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'getMyTasks',
    page: 1,
    pageSize: 20
  }
})

// 审批任务
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'approveTask',
    taskId: taskId,
    action: 'approve',
    comment: '审批通过'
  }
})
```

#### 5. 配置首个管理员引导密钥

当系统首次上线时，`user_registration` 注册申请仍然走工作流审批，但这时数据库里还没有已审批管理员，无法完成第一位管理员的审批。  
为了解决这个启动阶段问题，项目新增了 `bootstrapAdmin` 云函数，并要求在云函数环境变量中配置 `BOOTSTRAP_ADMIN_KEY`。

推荐配置方式：

1. 打开微信开发者工具或 CloudBase 控制台。
2. 进入云函数 `bootstrapAdmin` 的环境变量配置。
3. 新增环境变量：

```bash
BOOTSTRAP_ADMIN_KEY=请替换为一段高强度随机字符串
```

建议：
- 密钥长度至少 16 位
- 使用大小写字母、数字和符号混合
- 不要把密钥写死在前端代码、`config.js`、`README` 示例值或 Git 仓库中
- 初始化完成后，如无继续使用需要，可立即更换或删除该密钥

#### 6. 首个管理员初始化流程

完成 `BOOTSTRAP_ADMIN_KEY` 配置后，首次上线请按下面流程操作：

1. 第一个用户先正常进入小程序并提交注册申请。
2. 返回登录页。
3. 如果系统中还没有已审批管理员，登录页会显示“首个管理员初始化”入口。
4. 输入 `BOOTSTRAP_ADMIN_KEY` 对应的密钥。
5. 系统会将当前用户提升为首个已审批管理员，并补齐该用户注册申请对应的审批结果。
6. 后续所有用户注册审批恢复走正常工作流，不再依赖初始化入口。

注意事项：
- 该入口只会在“系统中不存在已审批管理员”时开放。
- 当前微信用户必须已经提交过注册申请，否则初始化会失败。
- 一旦系统中已有管理员，`bootstrapAdmin` 初始化入口会自动关闭。
- `dbManager`、`initSystemConfig`、`initWorkflowDB` 等敏感云函数现在都要求已审批管理员身份，不能再通过前端隐藏密码调用。

### 文档说明

详细的使用文档请参考：
- **需求文档**: `specs/workflow-framework/requirements.md`
- **技术方案**: `specs/workflow-framework/design.md`
- **实施计划**: `specs/workflow-framework/tasks.md`
- **使用指南**: `.codebuddy/workflow/README.md`
- **示例模板**: `.codebuddy/workflow/example-templates.js`
- **安全规则**: `.codebuddy/database-rules/workflow-rules.json`

---

## 项目文档索引

### 开发规范

- **[编码规范](.codebuddy/docs/CODING_STANDARDS.md)** - 项目编码标准和最佳实践
- **[MCP工具执行规范](.codebuddy/docs/MCP_EXECUTION_STANDARD.md)** - AI助手如何自动使用MCP工具
- **[数据库集合参考](.codebuddy/docs/DATABASE_COLLECTIONS_REFERENCE.md)** - 所有数据库集合的详细说明
- **[权限管理](.codebuddy/docs/PERMISSION-MANAGEMENT.md)** - 数据库权限配置指南
- **[分页框架](.codebuddy/docs/pagination-framework.md)** - 分页组件使用指南
- **[文档组织说明](.codebuddy/README_ORGANIZATION.md)** - 项目文档结构和查找指南

### 功能文档

- **[通知公告UI重设计](.codebuddy/docs/features/ANNOUNCEMENT_UI_REDESIGN.md)** - 通知公告页面设计改进总结
- **[工作流自动初始化](.codebuddy/docs/features/WORKFLOW_AUTO_INIT.md)** - 工作流模板自动初始化机制

### 工作流文档

- **[工作流框架说明](.codebuddy/workflow/README.md)** - 工作流框架介绍和快速开始
- **[工作流部署指南](.codebuddy/workflow/DEPLOYMENT.md)** - 工作流云函数部署步骤
- **[工作流模板导入](.codebuddy/workflow/guides/IMPORT_WORKFLOW_GUIDE.md)** - 通用工作流模板导入流程
- **[通知公告工作流导入](.codebuddy/workflow/guides/WORKFLOW_IMPORT_GUIDE.md)** - 通知公告工作流详细导入指南
- **[订阅消息配置](.codebuddy/workflow/SUBSCRIBE_MESSAGE_CONFIG.md)** - 订阅消息模板配置说明

### CloudBase规则

完整规则文档位于 `.codebuddy/rules/` 目录，包括：
- CloudBase平台规则
- AI模型使用规则（Node.js/Web/小程序）
- 认证规则（Web/小程序/HTTP API）
- 云函数开发规则
- 数据库操作规则
- 前端开发规则

### 常见场景

#### 场景 1: 单步审批（用户注册）

提交 → 管理员审批 → 通过/驳回

#### 场景 2: 多步串行审批（请假流程）

提交 → 直属领导审批 → HR审批 → 馆领导审批

#### 场景 3: 并行审批（购车流程）

提交 → 【部门审批 + 财务审批】（会签）→ 领导审批

#### 场景 4: 条件分支（请假流程）

提交 → 直属领导审批 → 【天数>3 ? HR审批】→ 【天数>7 ? 馆领导审批】

#### 场景 5: 流程回退（补充资料）

提交 → 审批人退回 → 申请人补充资料 → 重新提交 → 审批


## 贡献

如果你有 bug 反馈或其他任何建议，欢迎提 issue 给我们。

如果你愿意一起来完善小程序示例，欢迎通过 PR 的方式贡献代码。为了保证代码风格的统一，在编写代码之前，请在项目根目录运行以下命令安装依赖：

```
npm install
```
同时，确保你的代码可以通过 Lint 检查：
```
npm run lint
```

## 截图

<img width="375" src="https://res.wx.qq.com/op_res/0_vsSii5DaG-1hoXcqmBCT_tPShgSPKi3_FBVuVj1tu1ZdZD8lwYNrSQm3mdswI2">
