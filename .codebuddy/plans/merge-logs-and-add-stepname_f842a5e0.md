---
name: merge-logs-and-add-stepname
overview: 将分散在 officeAuth 和 medicalApplication 中的工作流日志获取逻辑统一合并到 workflowEngine 云函数，并在记录日志时自动写入 stepName 字段。
todos:
  - id: add-stepname-to-logs
    content: 修改 workflowEngine 的 logWorkflowAction 函数，根据 taskId 查询 stepName 并写入日志
    status: completed
  - id: add-getWorkflowLogs-action
    content: 在 workflowEngine/index.js 中新增 getWorkflowLogs 函数并注册 action
    status: completed
  - id: update-medicalApplication
    content: 简化 medicalApplication 的 getDetail，移除日志查询逻辑
    status: completed
    dependencies:
      - add-getWorkflowLogs-action
  - id: update-approval-frontend
    content: 修改 approval.js 的 loadWorkflowLogs 改为调用 workflowEngine
    status: completed
    dependencies:
      - add-getWorkflowLogs-action
  - id: update-medical-frontend
    content: 修改 medical-application.js 的 showRecordDetail，分离日志获取改为调用 workflowEngine
    status: completed
    dependencies:
      - add-getWorkflowLogs-action
  - id: cleanup-officeAuth
    content: 移除 officeAuth/index.js 中的 getWorkflowLogs 函数和入口分支
    status: completed
    dependencies:
      - add-getWorkflowLogs-action
---

## 用户需求

1. **统一日志获取接口**：将分散在 `officeAuth`（`getWorkflowLogs`）和 `medicalApplication`（`getDetail` 中的日志查询）中的工作流日志获取逻辑，统一合并到 `workflowEngine/index.js` 中，提供唯一的 `getWorkflowLogs` action
2. **日志记录时写入 stepName**：`logWorkflowAction` 记录日志时，根据 `taskId` 查询对应 task 的 `stepName` 并写入日志记录；如果 `taskId` 为空或查不到，`stepName` 留空

## 当前代码状态

- `workflowEngine/index.js:329-351` — `logWorkflowAction` 函数，已有 `taskId` 参数但未写入 `stepName`
- 7 处 `logWorkflowAction` 调用中，仅 `approveTask`（行762）传入 `taskId`，其余 6 处传 `null`
- `officeAuth/index.js:1074-1144` — 独立的 `getWorkflowLogs` 函数，含 action 中文映射和用户名批量查询
- `medicalApplication/index.js:124-146` — `getDetail` 函数同时返回 record 和原始日志
- `approval.js:554-576` — 通过 `app.callOfficeAuth('getWorkflowLogs')` 获取日志
- `medical-application.js:252-297` — 通过 `wx.cloud.callFunction` 调用 `medicalApplication/getDetail`
- `workflowEngine/index.js` 已有 `getActionText` 函数（行84-98）和 `ACTION_TEXT_MAP` 常量（行69-78），可直接复用

## 约束

- `medicalApplication/getDetail` 还需返回 record 数据，不能只合并日志部分
- 前端 `approval.js` 需改为调用 `workflowEngine`
- 前端 `medical-application.js` 中日志部分应改为调用 `workflowEngine` 的统一接口

## 技术方案

### 实现策略

**统一日志获取**：在 `workflowEngine/index.js` 中新增 `getWorkflowLogs(orderId)` 函数，复用已有的 `getActionText`、`logsCollection`、`usersCollection`，功能与 `officeAuth` 中的版本一致（含 action 中文映射、用户名批量查询、stepName 返回）。同时修改两个前端调用方直接调用 `workflowEngine` 云函数。

**stepName 写入日志**：修改 `logWorkflowAction` 函数，当 `taskId` 非空时查询 `workflow_tasks` 获取 `stepName`，写入日志记录。仅 `approveTask` 调用处有 `taskId`，其他场景（提交、撤回、中止等）`taskId` 为 `null`，`stepName` 自然留空。

### 实现细节

#### 1. workflowEngine/index.js — 新增 getWorkflowLogs 函数

- 复用已有的 `getActionText` 进行 action 中文映射（替代 `officeAuth` 中从 `sys_config` 读取的逻辑）
- 按 `orderId` 查询 `workflow_logs`，按 `createdAt` 升序，limit 50
- 批量查询操作人用户名
- 返回字段：`_id`, `action`, `actionText`, `operatorId`, `operatorName`, `description`, `stepName`, `createdAt`
- 在 `exports.main` 的 switch 中新增 `case 'getWorkflowLogs'`

#### 2. workflowEngine/index.js — logWorkflowAction 增加 stepName

- 函数内部：如果 `taskId` 非空，通过 `tasksCollection.doc(taskId).get()` 查询 task，取 `stepName`
- 写入日志时增加 `stepName` 字段
- 查询失败时 `stepName` 留空，不影响主流程

#### 3. medicalApplication/index.js — 简化 getDetail

- 移除 `getDetail` 中的日志查询逻辑（行133-137）
- `getDetail` 仅返回 `{ record }` 不再返回 `logs`

#### 4. officeAuth/index.js — 移除 getWorkflowLogs

- 删除 `getWorkflowLogs` 函数（行1074-1144）
- 删除入口 `if (action === 'getWorkflowLogs')` 分支（行1197-1199）

#### 5. approval.js — 改用 workflowEngine

- `loadWorkflowLogs` 方法改为调用 `workflowEngine` 云函数（使用 `wx.cloud.callFunction`）
- 传入 `action: 'getWorkflowLogs'` 和 `orderId`

#### 6. medical-application.js — 分离日志获取

- `showRecordDetail` 方法中，`getDetail` 调用仅获取 record
- 日志部分改为单独调用 `workflowEngine/getWorkflowLogs`

### 性能考量

- `logWorkflowAction` 中新增的 task 查询（仅当 `taskId` 非空时）是单次 doc 查询，开销可忽略
- 前端从 1 次调用变为 2 次调用（medical-application.js），但两次调用可并行执行，总延迟无增加