# MCP工具自动执行规范

## 规范目的

本规范定义了AI助手在使用CloudBase开发微信小程序时，如何自动执行涉及云数据库和云函数的操作，而无需用户手动操作。

**核心理念**：凡是涉及云数据库和云函数的操作，AI助手应自行使用已绑定的CloudBase MCP工具完成，用户只需关注业务逻辑。

---

## 适用范围

本规范适用于以下操作场景：

### 1. 数据库操作
- ✅ 创建数据库集合（collections）
- ✅ 读取/写入数据库数据
- ✅ 查询数据库记录
- ✅ 更新数据库文档
- ✅ 删除数据库记录
- ✅ 配置数据库安全规则
- ✅ 创建数据模型（Data Models）
- ✅ 执行SQL查询（MySQL）

### 2. 云函数操作
- ✅ 创建云函数
- ✅ 更新云函数代码
- ✅ 更新云函数配置
- ✅ 部署云函数
- ✅ 调用云函数
- ✅ 查询云函数日志
- ✅ 管理云函数触发器
- ✅ 管理云函数层（Layers）

### 3. 云存储操作
- ✅ 上传文件
- ✅ 下载文件
- ✅ 删除文件
- ✅ 查询文件信息
- ✅ 生成临时访问链接

### 4. 静态托管操作
- ✅ 上传静态文件
- ✅ 删除静态文件
- ✅ 查询托管文件
- ✅ 配置域名

### 5. 认证相关操作
- ✅ 查询登录状态
- ✅ 查询环境信息
- ✅ 管理安全域名

---

## 执行流程

### 步骤1：识别操作类型

当用户提出需求时，AI助手应判断是否涉及以下云服务操作：

```
用户需求 → 是否涉及：
  - 数据库（NoSQL/MySQL）
  - 云函数
  - 云存储
  - 静态托管
  - 认证配置
```

### 步骤2：选择合适的MCP工具

根据操作类型，使用对应的CloudBase MCP工具：

| 操作类型 | MCP工具类别 | 主要工具 |
|---------|------------|---------|
| NoSQL数据库 | `readNoSqlDatabaseStructure`<br>`writeNoSqlDatabaseStructure`<br>`readNoSqlDatabaseContent`<br>`writeNoSqlDatabaseContent` | 数据库结构读写<br>数据库内容读写 |
| MySQL数据库 | `executeReadOnlySQL`<br>`executeWriteSQL` | SQL查询执行<br>SQL写入执行 |
| 云函数 | `getFunctionList`<br>`createFunction`<br>`updateFunctionCode`<br>`updateFunctionConfig`<br>`invokeFunction`<br>`getFunctionLogs`<br>`getFunctionLogDetail`<br>`manageFunctionTriggers`<br>`readFunctionLayers`<br>`writeFunctionLayers` | 函数列表查询<br>函数创建<br>代码更新<br>配置更新<br>函数调用<br>日志查询<br>日志详情<br>触发器管理<br>层查询<br>层管理 |
| 云存储 | `queryStorage`<br>`manageStorage` | 存储查询<br>存储管理 |
| 静态托管 | `uploadFiles`<br>`deleteFiles`<br>`findFiles` | 文件上传<br>文件删除<br>文件查询 |
| 认证/环境 | `auth`<br>`envQuery`<br>`envDomainManagement` | 登录认证<br>环境查询<br>域名管理 |

### 步骤3：执行MCP工具调用

**重要：调用MCP工具前必须先获取工具描述**

```javascript
// 1. 获取工具描述（必需）
await mcp_get_tool_description({
  toolRequests: JSON.stringify([
    ["CloudBase MCP", "writeNoSqlDatabaseContent"]
  ])
})

// 2. 执行工具调用
await mcp_call_tool({
  serverName: "CloudBase MCP",
  toolName: "writeNoSqlDatabaseContent",
  arguments: JSON.stringify({
    // ... 参数
  })
})
```

### 步骤4：验证执行结果

执行操作后，必须验证结果是否符合预期：

```javascript
// 示例：验证数据库写入
await readNoSqlDatabaseContent({
  collectionName: "office_users",
  query: { _openid: "xxx" }
})
```

---

## 操作规范详解

### 数据库集合创建

**❌ 错误做法**：让用户去控制台手动创建集合

**✅ 正确做法**：自动使用MCP工具创建

```javascript
// 1. 使用 readNoSqlDatabaseStructure 检查集合是否存在
const checkResult = await readNoSqlDatabaseStructure({
  collectionName: "new_collection"
})

// 2. 如果不存在，使用 writeNoSqlDatabaseStructure 创建
if (!checkResult.data.exists) {
  await writeNoSqlDatabaseStructure({
    collectionName: "new_collection",
    description: "新集合描述"
  })
}
```

### 数据库数据写入

**❌ 错误做法**：让用户去控制台手动插入数据

**✅ 正确做法**：自动使用MCP工具写入

```javascript
await writeNoSqlDatabaseContent({
  action: "create",
  collectionName: "office_users",
  data: {
    _openid: "xxx",
    name: "张三",
    role: "馆员",
    department: "政治处",
    createdAt: Date.now()
  }
})
```

### 云函数部署

**❌ 错误做法**：让用户去控制台上传代码

**✅ 正确做法**：自动使用MCP工具部署

```javascript
// 1. 如果函数不存在，创建函数
if (!functionExists) {
  await createFunction({
    functionName: "newFunction",
    runtime: "Nodejs16.13",
    functionRootPath: "d:/WechatPrograms/ceshi/cloudfunctions"
  })
}

// 2. 更新函数代码
await updateFunctionCode({
  functionName: "newFunction",
  functionRootPath: "d:/WechatPrograms/ceshi/cloudfunctions"
})
```

### 云函数调用测试

**❌ 错误做法**：让用户在小程序中手动调用测试

**✅ 正确做法**：自动使用MCP工具调用

```javascript
const result = await invokeFunction({
  functionName: "officeAuth",
  data: {
    action: "register",
    username: "testuser",
    password: "test123"
  }
})
```

---

## 常见场景示例

### 场景1：新增一个数据库字段

**用户需求**：为 `office_users` 集合添加 `phone` 字段

**执行步骤**：

1. 使用 `readNoSqlDatabaseStructure` 查看当前集合结构
2. 更新集合的安全规则（如果需要）
3. 在代码中添加对 `phone` 字段的支持
4. 使用 `writeNoSqlDatabaseContent` 更新现有数据（可选）

```javascript
// 1. 查看集合结构
const structure = await readNoSqlDatabaseStructure({
  collectionName: "office_users"
})

// 2. 数据无需修改集合结构，NoSQL数据库支持动态字段
// 直接在代码中使用即可

// 3. 更新安全规则（如果需要）
await writeSecurityRule({
  resourceName: "office_users",
  resourceType: "database",
  rule: `{
    "read": "auth != null",
    "write": "auth != null && doc._openid == auth.openid"
  }`
})
```

### 场景2：创建新的云函数

**用户需求**：创建一个 `sendNotification` 云函数发送通知

**执行步骤**：

1. 创建云函数目录和代码文件
2. 使用 `createFunction` 创建云函数
3. 使用 `updateFunctionCode` 部署代码
4. 使用 `invokeFunction` 测试函数

```javascript
// 1. 创建函数（如果不存在）
await createFunction({
  functionName: "sendNotification",
  runtime: "Nodejs16.13",
  functionRootPath: "d:/WechatPrograms/ceshi/cloudfunctions"
})

// 2. 部署代码
await updateFunctionCode({
  functionName: "sendNotification",
  functionRootPath: "d:/WechatPrograms/ceshi/cloudfunctions"
})

// 3. 测试调用
const result = await invokeFunction({
  functionName: "sendNotification",
  data: {
    action: "test",
    message: "测试通知"
  }
})
```

### 场景3：初始化工作流模板

**用户需求**：导入工作流模板到数据库

**执行步骤**：

1. 检查模板是否已存在
2. 使用 `writeNoSqlDatabaseContent` 写入模板数据
3. 验证数据是否正确写入

```javascript
// 1. 检查模板是否存在
const check = await readNoSqlDatabaseContent({
  collectionName: "workflow_templates",
  query: { code: "user_registration" }
})

// 2. 如果不存在，写入模板
if (check.data.length === 0) {
  await writeNoSqlDatabaseContent({
    action: "create",
    collectionName: "workflow_templates",
    data: {
      name: "用户注册审批",
      code: "user_registration",
      version: 1,
      steps: [...]
    }
  })
}

// 3. 验证
const verify = await readNoSqlDatabaseContent({
  collectionName: "workflow_templates",
  query: { code: "user_registration" }
})
```

---

## 工具使用最佳实践

### 1. 查询环境ID

**首次操作前必须获取环境ID**：

```javascript
const envInfo = await envQuery({ action: "info" })
const envId = envInfo.data.envId
```

### 2. 错误处理

**执行MCP工具时必须处理错误**：

```javascript
try {
  const result = await mcp_call_tool({...})
  if (!result.success) {
    console.error("操作失败:", result.message)
    // 根据错误类型进行重试或提示用户
  }
} catch (error) {
  console.error("工具调用异常:", error)
}
```

### 3. 批量操作

**对于批量操作，使用循环或批量接口**：

```javascript
// 批量创建多个集合
const collections = ["users", "orders", "products"]
for (const collection of collections) {
  await writeNoSqlDatabaseStructure({
    collectionName: collection
  })
}
```

### 4. 事务处理

**对于需要原子性的操作，使用云函数实现**：

```javascript
// 在云函数中实现事务逻辑
await invokeFunction({
  functionName: "transactionHandler",
  data: {
    operations: [
      { type: "create", collection: "users", data: {...} },
      { type: "create", collection: "logs", data: {...} }
    ]
  }
})
```

---

## 禁止操作

❌ **禁止**让用户去云开发控制台手动创建集合

❌ **禁止**让用户去控制台手动插入/更新数据库数据

❌ **禁止**让用户去控制台手动部署云函数

❌ **禁止**让用户去控制台手动配置安全规则

❌ **禁止**让用户在小程序中添加临时测试代码来调用云函数

❌ **禁止**让用户手动执行SQL语句

❌ **禁止**让用户手动上传/删除云存储文件

---

## 操作检查清单

每次执行涉及云服务的操作后，应确认：

- [ ] 已使用MCP工具完成操作
- [ ] 未要求用户手动操作控制台
- [ ] 已验证操作结果
- [ ] 已记录操作日志（如需要）
- [ ] 已更新相关文档（如需要）

---

## 示例对话

### ❌ 错误的执行方式

**用户**：请创建一个 `announcements` 集合

**AI助手**：
1. 打开数据库控制台：https://tcb.cloud.tencent.com/dev?envId=xxx#/db/doc
2. 点击"新建集合"
3. 输入 `announcements`
4. 点击确定

**问题**：要求用户手动操作控制台

---

### ✅ 正确的执行方式

**用户**：请创建一个 `announcements` 集合

**AI助手**：
好的，我来自动创建集合。

[自动执行]
1. 使用 `writeNoSqlDatabaseStructure` 创建集合
2. 配置安全规则
3. 验证集合创建成功

集合 `announcements` 已创建完成！

---

## 相关文档

- **CloudBase平台规则**: `.codebuddy/rules/tcb/rules/cloudbase-platform/rule.md`
- **云函数开发规范**: `.codebuddy/rules/tcb/rules/cloud-functions/rule.md`
- **Web前端开发规则**: `.codebuddy/rules/tcb/rules/web-development/rule.md`
- **小程序开发规则**: `.codebuddy/rules/tcb/rules/miniprogram-development/rule.md`
- **工作流导入指南**: `.codebuddy/workflow/guides/IMPORT_WORKFLOW_GUIDE.md`

---

## 小程序页面开发注意事项

### 相对路径引用规范

创建新页面时，必须正确计算相对于项目根目录的路径：

#### 路径计算公式

```
../ 的数量 = (当前页面深度 - 1) + (目标文件深度)
```

#### 目录深度参考

| 文件路径 | 深度 |
|---------|------|
| `util/util.js` | 1 |
| `pages/auth/login/login.js` | 3 |
| `pages/office/home/home.js` | 4 |
| `pages/office/profile/profile.js` | 5 |
| `pages/office/profile/edit-profile/edit-profile.js` | 6 |

#### 常用引用路径示例

| 当前文件 | 引用文件 | 正确路径 |
|---------|---------|---------|
| `pages/auth/register/register.js` | `util/util.js` | `../../../../util/util.js` (4个../) |
| `pages/office/home/home.js` | `util/util.js` | `../../../util/util.js` (3个../) |
| `pages/office/profile/profile.js` | `util/util.js` | `../../../util/util.js` (3个../) |
| `pages/office/profile/edit-profile/edit-profile.js` | `util/util.js` | `../../../../util/util.js` (5个../) |
| `pages/office/profile/edit-profile/edit-profile.js` | `app.js` | `../../../../app.js` (5个../) |

#### 常见错误示例

❌ **错误**：`pages/office/profile/edit-profile/edit-profile.js` 引用 `util/util.js`
```javascript
const util = require('../../../util/util.js')  // ❌ 路径错误，只有3个../
```

✅ **正确**：
```javascript
const util = require('../../../../util/util.js')  // ✅ 正确，5个../
```

#### 验证方法

1. **创建页面后立即编译**：确保没有 "module not defined" 错误
2. **检查路径层级**：
   - 从当前文件位置开始，每向上一级目录添加一个 `../`
   - 直到到达项目根目录
   - 然后加上目标文件的相对路径
3. **使用微信开发者工具验证**：点击文件跳转功能，确认路径正确

#### app.json 页面注册规范

创建新页面时，必须在 `app.json` 的 `pages` 数组中注册页面路径：

```json
{
  "pages": [
    "pages/office/profile/edit-profile/edit-profile"  // 必须添加完整路径
  ]
}
```

**验证方法**：
1. 在 `app.json` 中添加页面路径
2. 保存文件
3. 在其他页面使用 `wx.navigateTo` 测试跳转
4. 如果点击无反应，检查页面路径是否正确

---

## 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|---------|
| 2026-03-17 | 1.1 | 新增"小程序页面开发注意事项"章节，包含相对路径引用规范和页面注册规范 |
| 2026-03-16 | 1.0 | 初始版本，定义MCP工具自动执行规范 |

---

**记住：AI助手的目标是自动化一切可以自动化的操作，让用户专注于业务逻辑！**
