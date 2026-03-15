# 数据库集合名称错误修复总结

## 问题描述

用户在发布通知公告时报错：
```
collection.add:fail -502005 database collection not exists. [ResourceNotFound]
Db or Table not exist: workflow_orders.
```

**根本原因**：
- 代码中使用了 `workflow_orders` 集合名称
- 但数据库中实际存在的是 `work_orders` 集合
- 说明编写代码时没有参考数据库集合参考文档

---

## 修复内容

### 1. 修复 announcementManager 云函数

**文件**：`cloudfunctions/announcementManager/index.js`

**修改位置**：

#### 修改1：集合引用定义（第9-12行）

**修改前**：
```javascript
const db = cloud.database()
const _ = db.command
const workflowTemplatesCollection = db.collection('workflow_templates')
const workflowOrdersCollection = db.collection('workflow_orders')  // ❌ 错误
const announcementsCollection = db.collection('announcements')
const usersCollection = db.collection('office_users')
```

**修改后**：
```javascript
const db = cloud.database()
const _ = db.command
const workflowTemplatesCollection = db.collection('workflow_templates')
const workOrdersCollection = db.collection('work_orders')  // ✅ 正确
const announcementsCollection = db.collection('announcements')
const usersCollection = db.collection('office_users')
```

#### 修改2：工单添加操作（第115行）

**修改前**：
```javascript
const orderResult = await workflowOrdersCollection.add({ data: orderData })  // ❌ 错误
```

**修改后**：
```javascript
const orderResult = await workOrdersCollection.add({ data: orderData })  // ✅ 正确
```

---

## 创建的文档

### 1. DATABASE_COLLECTIONS_REFERENCE.md

**路径**：`.codebuddy/DATABASE_COLLECTIONS_REFERENCE.md`

**内容**：
- 列出所有 12 个数据库集合的详细信息
- 每个集合包含：用途、记录数、索引、字段结构
- 提供集合命名规范
- 提供字段命名规范
- 包含常见错误示例
- 包含新增集合流程

**集合列表**：
1. `announcements` - 通知公告
2. `menu_comments` - 菜单评论
3. `menus` - 每周菜单
4. `notifications` - 用户通知
5. `office_registration_requests` - 用户注册请求
6. `office_users` - 办公系统用户
7. `permissions` - 权限配置
8. `work_orders` - 工作订单（重要：不是 workflow_orders）
9. `workflow_logs` - 工作流日志
10. `workflow_subscriptions` - 工作流订阅配置
11. `workflow_tasks` - 工作流任务
12. `workflow_templates` - 工作流模板

### 2. CODING_STANDARDS.md

**路径**：`.codebuddy/CODING_STANDARDS.md`

**内容**：
- 数据库相关规范
- 云函数相关规范
- 前端代码规范
- 代码审查检查清单
- 常见错误案例
- 工具和配置建议
- 违规处理流程

**核心规则**：
1. 任何涉及数据库集合的操作，必须先参考 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 集合名称必须使用复数形式、小写字母和下划线
3. 字段命名必须使用驼峰命名法（camelCase）
4. 新增集合必须先更新参考文档

---

## 规范总结

### 集合命名规范

✅ **正确示例**：
```javascript
work_orders              // ✅ 复数、小写、下划线
notifications             // ✅ 复数、小写、下划线
workflow_templates         // ✅ 复数、小写、下划线
office_users              // ✅ 复数、小写、下划线
```

❌ **错误示例**：
```javascript
workflowOrders           // ❌ 驼峰命名
workOrder                // ❌ 单数形式
wf_tmpls                 // ❌ 缩写
workflow_orders          // ❌ 不存在的集合名（实际是 work_orders）
```

### 字段命名规范

✅ **正确示例**：
```javascript
{
  createdAt: 1234567890,    // ✅ 驼峰命名
  updatedAt: 1234567890,    // ✅ 驼峰命名
  publisherName: '张三',      // ✅ 驼峰命名
  readCount: 5,              // ✅ 驼峰命名
  isAdmin: true,             // ✅ 布尔值使用 is 前缀
  needSupplement: false       // ✅ 布尔值使用 need 前缀
}
```

❌ **错误示例**：
```javascript
{
  created_at: 1234567890,     // ❌ 蛇形命名
  updated_at: 1234567890,     // ❌ 蛇形命名
  publisher_name: '张三',     // ❌ 蛇形命名
  read_count: 5,             // ❌ 蛇形命名
  admin: true,                // ❌ 缺少 is 前缀
  supplement: false            // ❌ 缺少 need 前缀
}
```

---

## 后续开发流程

### 编写涉及数据库的代码前，必须遵循以下流程：

1. **第一步：查阅参考文档**
   - 打开 `.codebuddy/DATABASE_COLLECTIONS_REFERENCE.md`
   - 查找需要的集合
   - 确认集合名称（复制粘贴，避免拼写错误）
   - 确认字段结构

2. **第二步：定义集合引用**
   ```javascript
   // ✅ 在云函数开头集中定义
   const workOrdersCollection = db.collection('work_orders')
   const workflowTemplatesCollection = db.collection('workflow_templates')
   ```

3. **第三步：编写代码**
   - 使用定义的集合变量
   - 使用正确的字段名称
   - 遵循命名规范

4. **第四步：代码审查**
   - 检查集合名称是否正确
   - 检查字段命名是否符合规范
   - 使用检查清单确认

5. **第五步：更新文档（如需要）**
   - 如果新增了集合
   - 必须更新 `DATABASE_COLLECTIONS_REFERENCE.md`

---

## 需要手动完成的工作

### 1. 重新部署 announcementManager 云函数

**步骤**：
1. 打开云函数详情页：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0
   ```

2. 点击"代码"标签页

3. 点击"上传并部署"按钮

4. 等待部署完成（约30秒-1分钟）

5. 部署完成后，点击"运行测试"验证

**测试用例**：
```json
{
  "action": "create",
  "data": {
    "title": "测试通知",
    "content": "这是一个测试通知",
    "type": "normal"
  }
}
```

**预期结果**：
```json
{
  "code": 0,
  "message": "通知公告发布成功",
  "data": {
    "orderId": "自动生成的ID",
    "announcementId": "自动生成的ID",
    "announcement": { ... }
  }
}
```

### 2. 重新编译小程序

**步骤**：
1. 在微信开发者工具中，点击"编译"按钮
2. 或使用快捷键 `Ctrl + B`（Windows）/ `Cmd + B`（Mac）

---

## 验证清单

完成上述步骤后，逐一验证：

- [ ] announcementManager 云函数已重新部署
- [ ] 云函数测试通过（返回 code: 0）
- [ ] `work_orders` 集合中有新的工单记录
- [ ] `announcements` 集合中有新的通知记录
- [ ] `workflow_logs` 集合中有操作日志
- [ ] 小程序可以正常发布通知公告
- [ ] 发布的通知显示在通知列表中
- [ ] 可以查看通知详情
- [ ] 可以撤回通知

---

## 相关文档

### 新创建的文档

1. **`.codebuddy/DATABASE_COLLECTIONS_REFERENCE.md`**
   - 数据库集合参考文档
   - 包含所有集合的详细信息
   - 编码时必须参考

2. **`.codebuddy/CODING_STANDARDS.md`**
   - 项目编码规范
   - 包含数据库、云函数、前端等规范
   - 包含代码审查检查清单

### 参考链接

- **数据库集合列表**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
- **announcementManager 云函数**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0
- **work_orders 集合**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/work_orders
- **announcements 集合**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/announcements

---

## 总结

### 问题根源

编写代码时没有参考数据库集合参考文档，导致：
1. 使用了错误的集合名称 `workflow_orders`
2. 实际应该是 `work_orders`
3. 运行时才报错：集合不存在

### 解决方案

1. ✅ 创建了 `DATABASE_COLLECTIONS_REFERENCE.md` 参考文档
2. ✅ 创建了 `CODING_STANDARDS.md` 编码规范
3. ✅ 修复了 `announcementManager` 中的集合名称错误
4. ✅ 定义了严格的编码流程和检查清单

### 后续开发

**强制要求**：
- ⚠️ 任何涉及数据库的代码，必须先查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
- ⚠️ 新增集合必须更新参考文档
- ⚠️ 代码审查前必须使用检查清单
- ⚠️ 发现违规必须立即修复

**目标**：
- ✅ 避免类似的集合名称错误
- ✅ 保持代码风格一致性
- ✅ 提高团队协作效率
- ✅ 减少因名称错误导致的 bug

---

## 附录：快速参考

### 常用集合名称

| 用途 | 集合名称 | 注意事项 |
|------|---------|---------|
| 工作订单 | `work_orders` | 不是 `workflow_orders` |
| 工作流模板 | `workflow_templates` | 复数形式 |
| 工作流任务 | `workflow_tasks` | 复数形式 |
| 工作流日志 | `workflow_logs` | 复数形式 |
| 通知公告 | `announcements` | 复数形式 |
| 用户通知 | `notifications` | 复数形式 |
| 办公用户 | `office_users` | 复数形式 |

### 集合名称对照

| 错误名称 | 正确名称 | 说明 |
|---------|---------|------|
| `workflow_orders` | `work_orders` | 最常见的错误 |
| `notification` | `notifications` | 缺少复数 |
| `workOrder` | `work_orders` | 单数形式 |
| `workflowTemplate` | `workflow_templates` | 单数形式 |

记住：**先查文档，再写代码！**
