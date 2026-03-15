# 项目编码规范

## 概述

本文档规定了项目的编码标准和最佳实践，确保代码质量和一致性。

**重要**：所有开发人员必须严格遵循本规范！

---

## 1. 数据库相关规范

### 1.1 必须参考集合参考文档

**规则**：任何涉及数据库集合的操作，必须先参考 `DATABASE_COLLECTIONS_REFERENCE.md` 文档。

**强制流程**：
1. 查找 `.codebuddy/DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认需要操作的集合名称
3. 确认集合的字段结构
4. 确认集合的索引
5. 如果集合不存在，参考"新增集合流程"

**违规示例**：
```javascript
// ❌ 错误：未参考文档直接编写
const collection = db.collection('workflow_orders')  // 错误的集合名

// ✅ 正确：参考文档后使用正确的集合名
const collection = db.collection('work_orders')
```

### 1.2 集合命名规范

**规则**：
- 使用小写字母和下划线
- 使用复数形式
- 避免缩写
- 保持同一模块使用相同前缀

**示例**：
```javascript
// ✅ 正确
work_orders                // 工作订单
notifications             // 通知
workflow_templates         // 工作流模板
office_users              // 办公用户
announcements             // 通知公告

// ❌ 错误
workflowOrders            // 驼峰命名
workOrder                // 单数形式
wf_tmpls                 // 缩写
```

### 1.3 字段命名规范

**规则**：
- 使用驼峰命名法（camelCase）
- 使用有意义的名称
- 布尔值使用 is/has 前缀
- 时间戳字段使用 At 结尾

**示例**：
```javascript
// ✅ 正确
{
  createdAt: 1234567890,
  updatedAt: 1234567890,
  publisherName: '张三',
  isAdmin: true,
  hasPermission: false,
  needSupplement: false
}

// ❌ 错误
{
  created_at: 1234567890,        // 蛇形命名
  publisher_name: '张三',        // 蛇形命名
  admin: true,                     // 缺少 is 前缀
  supplement: false                // 缺少 has 前缀
}
```

### 1.4 新增集合流程

**步骤**：
1. 查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认确实需要新集合
3. 确认没有相似用途的现有集合
4. 遵循命名规范设计集合名称
5. 定义完整的字段结构
6. 添加到 `DATABASE_COLLECTIONS_REFERENCE.md` 文档
7. 在代码中创建并使用

**示例**：
```javascript
// 1. 先在文档中定义（DATABASE_COLLECTIONS_REFERENCE.md）
/*
 * my_new_collection - 我的新集合
 * 用途：存储新功能数据
 * 字段结构：
 * {
 *   _id: String,
 *   name: String,
 *   createdAt: Number
 * }
 */

// 2. 在代码中创建
const db = wx.cloud.database()
await db.collection('my_new_collection').add({
  data: {
    name: '测试',
    createdAt: Date.now()
  }
})
```

---

## 2. 云函数相关规范

### 2.1 必须先查阅参考文档

**规则**：编写云函数前，必须查阅以下文档：
1. `DATABASE_COLLECTIONS_REFERENCE.md` - 确认集合名称和结构
2. `CLOUD_FUNCTIONS_GUIDE.md` - 确认云函数开发规范

### 2.2 集合引用规范

**规则**：
- 在云函数开头集中定义所有集合引用
- 使用常量命名集合引用
- 使用描述性的变量名

**示例**：
```javascript
// ✅ 正确
const db = cloud.database()
const workOrdersCollection = db.collection('work_orders')
const workflowTemplatesCollection = db.collection('workflow_templates')
const announcementsCollection = db.collection('announcements')

// ❌ 错误
const db = cloud.database()
// 在函数中直接使用 db.collection('workflow_orders')  // 可能拼写错误
```

### 2.3 错误处理规范

**规则**：
- 统一的错误返回格式
- 明确的错误码和消息
- 详细的错误日志

**示例**：
```javascript
// ✅ 正确
function success(data, message) {
  return {
    code: 0,
    message: message || 'ok',
    data: data || {}
  }
}

function fail(message, code, data) {
  return {
    code: code || 500,
    message: message || '服务异常',
    data: data || null
  }
}

// 使用
try {
  // 业务逻辑
  return success(result, '操作成功')
} catch (error) {
  console.error('操作失败:', error)
  return fail(error.message || '操作失败', 500)
}
```

---

## 3. 前端代码规范

### 3.1 页面文件结构

**规则**：
- 每个页面包含 4 个文件：`.js`, `.json`, `.wxml`, `.wxss`
- 使用页面功能命名文件和目录
- 保持文件命名一致性

**示例**：
```
pages/
  office/
    announcement-list/
      announcement-list.js
      announcement-list.json
      announcement-list.wxml
      announcement-list.wxss
```

### 3.2 数据绑定规范

**规则**：
- 使用双大括号 `{{ }}` 绑定数据
- 复杂逻辑使用 computed 或 methods
- 避免在模板中写复杂逻辑

**示例**：
```javascript
// ✅ 正确
// JS 中
data: {
  userName: '张三',
  isUserAdmin: false
}

// WXML 中
<view>{{userName}}</view>
<view wx:if="{{isUserAdmin}}">管理员</view>

// ❌ 错误
<view>{{user.name}}</view>  // 复杂表达式
<view wx:if="{{user.role === 'admin'}}">管理员</view>  // 复杂条件
```

### 3.3 事件处理规范

**规则**：
- 事件处理函数以 handle 开头
- 使用 data-* 传递参数
- 统一的错误处理

**示例**：
```javascript
// ✅ 正确
// WXML
<button bindtap="handleSubmit" data-id="{{item.id}}">提交</button>

// JS
handleSubmit(e) {
  const id = e.currentTarget.dataset.id
  if (!id) {
    wx.showToast({ title: '参数错误', icon: 'none' })
    return
  }

  // 处理逻辑
}

// ❌ 错误
<button bindtap="submit(id)">提交</button>  // 直接传参不规范
```

---

## 4. 代码审查检查清单

在提交代码前，必须检查以下项目：

### 4.1 数据库相关
- [ ] 是否查阅了 `DATABASE_COLLECTIONS_REFERENCE.md`
- [ ] 集合名称是否正确
- [ ] 字段命名是否符合规范
- [ ] 是否需要新增集合并已更新文档
- [ ] 是否使用了正确的集合（如 work_orders 而不是 workflow_orders）

### 4.2 云函数相关
- [ ] 是否定义了常量集合引用
- [ ] 是否有统一的错误处理
- [ ] 是否有详细的日志输出
- [ ] 是否测试了所有分支

### 4.3 前端相关
- [ ] 事件处理函数是否以 handle 开头
- [ ] 数据绑定是否使用双大括号
- [ ] 是否有适当的错误提示
- [ ] 是否处理了加载状态

---

## 5. 常见错误案例

### 案例1：集合名称错误

**错误代码**：
```javascript
// announcementManager/index.js
const workflowOrdersCollection = db.collection('workflow_orders')  // ❌ 错误
```

**问题**：数据库中实际存在的是 `work_orders` 而不是 `workflow_orders`

**正确代码**：
```javascript
const workOrdersCollection = db.collection('work_orders')  // ✅ 正确
```

**如何避免**：
1. 编写代码前查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 复制粘贴集合名称，避免拼写错误
3. 测试时检查错误信息

### 案例2：字段命名不一致

**错误代码**：
```javascript
{
  created_at: 1234567890,  // ❌ 蛇形命名
  publisher_name: '张三',    // ❌ 蛇形命名
  read_count: 5              // ❌ 蛇形命名
}
```

**问题**：混用了命名风格

**正确代码**：
```javascript
{
  createdAt: 1234567890,    // ✅ 驼峰命名
  publisherName: '张三',      // ✅ 驼峰命名
  readCount: 5               // ✅ 驼峰命名
}
```

**如何避免**：
1. 参考现有数据的字段命名
2. 使用 ESLint 或类似工具检查
3. 代码审查时关注命名一致性

### 案例3：未查阅文档直接编码

**错误行为**：
- 看到"工作流"就认为是 `workflow_orders`
- 看到"通知"就认为是 `notifications`（实际上可能是 `announcements`）

**正确行为**：
1. 先查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
2. 确认具体的集合名称和用途
3. 理解集合的字段结构
4. 然后再编写代码

---

## 6. 工具和配置

### 6.1 ESLint 配置

项目应配置 ESLint 检查：
- 集合名称拼写检查
- 命名风格检查
- 代码质量检查

### 6.2 代码审查流程

1. 编写代码前查阅参考文档
2. 编写代码
3. 自查是否符合规范
4. 使用检查清单确认
5. 提交代码审查
6. 根据反馈修改

---

## 7. 更新和维护

### 7.1 文档更新

当发生以下情况时，必须更新 `DATABASE_COLLECTIONS_REFERENCE.md`：
- 新增数据库集合
- 修改集合字段结构
- 新增或删除索引
- 发现集合命名错误

### 7.2 规范更新

当发现以下情况时，应考虑更新本规范：
- 新的最佳实践
- 频繁出现的错误
- 团队共识的改进

---

## 8. 违规处理

### 8.1 发现违规的处理

当发现代码违反本规范时：
1. 标记违规代码
2. 说明违反的具体规范
3. 提供正确的代码示例
4. 要求立即修改

### 8.2 持续违规的后果

- 代码审查不通过
- 影响团队协作效率
- 可能引入严重 bug
- 增加维护成本

---

## 附录：参考文档

1. `DATABASE_COLLECTIONS_REFERENCE.md` - 数据库集合参考
2. `CLOUD_FUNCTIONS_GUIDE.md` - 云函数开发指南
3. `PROJECT_STRUCTURE.md` - 项目结构说明

---

## 总结

**核心原则**：
1. 先查阅文档，再编写代码
2. 遵循命名规范，保持一致性
3. 参考现有代码，避免重复错误
4. 重视代码审查，及时修复问题

**强制要求**：
- ✅ 所有数据库操作必须先查阅 `DATABASE_COLLECTIONS_REFERENCE.md`
- ✅ 新增集合必须更新 `DATABASE_COLLECTIONS_REFERENCE.md`
- ✅ 代码审查前必须使用检查清单
- ✅ 发现违规必须立即修复

记住：规范的目的是提高代码质量和团队协作效率，不是为了限制创造性！
