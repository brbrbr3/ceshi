# 工作流模板自动初始化说明

## 背景

之前 `initWorkflowDB` 云函数用于初始化工作流模板，但没有地方调用它，导致：
- ❌ 工作流模板不会自动导入
- ❌ 用户发布通知时报错：`通知公告工作流配置不存在`
- ❌ 需要手动在控制台运行云函数

## 解决方案

在小程序启动时（`app.js` 的 `onLaunch`）自动调用 `initWorkflowDB` 云函数，确保工作流模板已初始化。

---

## 修改内容

### 1. 添加存储键

```javascript
const WORKFLOW_INIT_KEY = 'office-workflow-initialized'
```

用于标记工作流模板是否已初始化，避免每次启动都调用云函数。

### 2. 在 onLaunch 中调用初始化

```javascript
onLaunch(opts, data) {
  // ... 原有代码 ...

  this.restoreAuthState()
  this.initWorkflowTemplates()  // 新增：初始化工作流模板
}
```

### 3. 新增 initWorkflowTemplates 方法

```javascript
/**
 * 初始化工作流模板（确保必需的工作流模板已导入）
 * 使用本地存储标记避免重复初始化
 */
initWorkflowTemplates() {
  const initialized = readStorage(WORKFLOW_INIT_KEY)

  // 如果已经初始化过，则跳过
  if (initialized) {
    return
  }

  // 调用云函数初始化工作流模板
  wx.cloud.callFunction({
    name: 'initWorkflowDB',
    data: {}
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      console.log('工作流模板初始化成功:', result.data)
      // 标记为已初始化
      writeStorage(WORKFLOW_INIT_KEY, {
        initialized: true,
        timestamp: Date.now(),
        data: result.data
      })
    } else {
      console.warn('工作流模板初始化失败:', result.message)
    }
  }).catch(error => {
    console.error('工作流模板初始化异常:', error)
    // 静默失败，不影响用户使用
  })
}
```

### 4. 新增 reinitWorkflowTemplates 方法（可选）

```javascript
/**
 * 重新初始化工作流模板（用于强制刷新模板）
 * @returns {Promise<Object>} 初始化结果
 */
reinitWorkflowTemplates() {
  return wx.cloud.callFunction({
    name: 'initWorkflowDB',
    data: {}
  }).then(res => {
    const result = res.result || {}
    if (result.code === 0) {
      console.log('工作流模板重新初始化成功:', result.data)
      // 更新初始化标记
      writeStorage(WORKFLOW_INIT_KEY, {
        initialized: true,
        timestamp: Date.now(),
        data: result.data
      })
      return result.data
    } else {
      throw new Error(result.message || '重新初始化失败')
    }
  })
}
```

---

## 特性说明

### 1. 首次自动初始化

- 小程序首次启动时，自动调用 `initWorkflowDB` 云函数
- 自动导入所有工作流模板，包括：
  - 用户注册审批（user_registration）
  - 就医申请审批（medical_application）
  - 通知公告发布（notification_publish）

### 2. 避免重复初始化

- 使用本地存储键 `office-workflow-initialized` 标记已初始化状态
- 已初始化的情况下，后续启动不会再调用云函数
- 减少不必要的云函数调用，节省资源

### 3. 静默失败

- 初始化失败不影响用户正常使用
- 失败信息会输出到控制台，方便排查问题
- 可以通过 `reinitWorkflowTemplates()` 手动重新初始化

### 4. 重新初始化支持

提供了 `reinitWorkflowTemplates()` 方法，可以：
- 强制刷新工作流模板
- 更新已初始化的标记
- 返回 Promise，支持链式调用

---

## 使用方法

### 自动初始化（默认）

无需任何操作，小程序启动时会自动初始化工作流模板。

### 手动重新初始化

如果需要强制刷新工作流模板，可以调用：

```javascript
// 在任意页面中调用
const app = getApp()

app.reinitWorkflowTemplates()
  .then(data => {
    console.log('重新初始化成功:', data)
    wx.showToast({
      title: '初始化成功',
      icon: 'success'
    })
  })
  .catch(error => {
    console.error('重新初始化失败:', error)
    wx.showToast({
      title: error.message,
      icon: 'none'
    })
  })
```

### 清除初始化标记

如果需要下次启动时重新初始化，可以清除本地存储：

```javascript
wx.removeStorageSync('office-workflow-initialized')
```

---

## 执行流程

### 首次启动

```
1. 小程序启动
   ↓
2. app.js 的 onLaunch 执行
   ↓
3. 调用 initWorkflowTemplates()
   ↓
4. 检查本地存储标记（未初始化）
   ↓
5. 调用 initWorkflowDB 云函数
   ↓
6. 云函数导入工作流模板
   ↓
7. 保存初始化标记到本地存储
   ↓
8. 用户正常使用小程序
```

### 后续启动

```
1. 小程序启动
   ↓
2. app.js 的 onLaunch 执行
   ↓
3. 调用 initWorkflowTemplates()
   ↓
4. 检查本地存储标记（已初始化）
   ↓
5. 跳过云函数调用
   ↓
6. 用户正常使用小程序
```

---

## 控制台日志

### 成功初始化

```
工作流模板初始化成功: {
  duration: 1234,
  templatesImported: 4,
  subscriptionsImported: 3,
  collectionsChecked: 6
}
```

### 已初始化（跳过）

控制台不会输出任何日志（静默跳过）。

### 初始化失败

```
工作流模板初始化失败: 错误信息
```

或

```
工作流模板初始化异常: {错误详情}
```

---

## 云函数日志

在云开发控制台可以看到 `initWorkflowDB` 的详细日志：

```
=== 开始初始化工作流数据库 ===
步骤1: 检查/创建数据库集合
  ✓ 集合 workflow_templates 已存在
  ✓ 集合 workflow_orders 已存在
步骤2: 导入示例工作流模板
  - 模板 user_registration 已存在，跳过
  - 模板 medical_application 已存在，跳过
  ✓ 导入模板: 通知公告发布 (notification_publish)
步骤3: 导入示例订阅消息配置
  - 订阅配置 template_submitted_template 已存在，跳过

=== 初始化完成，耗时: 1234ms ===
```

---

## 注意事项

1. **初始化时机**
   - 在 `onLaunch` 中调用，确保小程序启动时即初始化
   - 在 `restoreAuthState()` 之后调用，确保云能力已就绪

2. **本地存储**
   - 使用 `office-workflow-initialized` 键标记
   - 包含初始化时间戳和结果数据
   - 可以在开发者工具的 Storage 面板查看

3. **错误处理**
   - 初始化失败不会抛出异常
   - 失败会在控制台输出警告
   - 不影响用户使用小程序的其他功能

4. **云函数部署**
   - 确保 `initWorkflowDB` 云函数已部署
   - 如果修改了模板数据，需要重新部署云函数

5. **集合依赖**
   - `initWorkflowDB` 会自动检查集合是否存在
   - 如果集合不存在，会在日志中提示手动创建
   - 建议先手动创建必需的集合

---

## 验证方法

### 1. 查看本地存储

在开发者工具中：
1. 切换到 "Storage" 面板
2. 查找 `office-workflow-initialized` 键
3. 确认包含以下数据：
   ```json
   {
     "initialized": true,
     "timestamp": 1234567890123,
     "data": {
       "duration": 1234,
       "templatesImported": 4,
       "subscriptionsImported": 3,
       "collectionsChecked": 6
     }
   }
   ```

### 2. 查看数据库

在云开发控制台：
1. 打开 `workflow_templates` 集合
2. 确认存在 `notification_publish` 模板
3. 确认 `status` 为 `active`

### 3. 测试发布通知

在小程序中：
1. 进入"通知公告"页面
2. 点击"发布"
3. 填写标题和内容
4. 点击"立即发布"
5. 确认发布成功

---

## 常见问题

### Q: 为什么发布通知还是报错？

A: 请检查以下事项：
1. `initWorkflowDB` 云函数是否已部署
2. 小程序是否已重新编译（刷新页面）
3. 是否清除了本地存储标记
4. `workflow_templates` 集合中是否存在 `notification_publish` 模板

### Q: 如何强制重新初始化？

A: 调用 `app.reinitWorkflowTemplates()` 方法，或清除本地存储后重启小程序。

### Q: 初始化失败会影响使用吗？

A: 不会。初始化失败是静默的，用户可以正常使用小程序的其他功能。但在使用工作流相关功能（如发布通知）时会报错。

### Q: 修改了工作流模板后如何生效？

A:
1. 重新部署 `initWorkflowDB` 云函数
2. 清除本地存储：`wx.removeStorageSync('office-workflow-initialized')`
3. 重新编译小程序

---

## 总结

### ✅ 改进效果

- ✅ 工作流模板自动初始化，无需手动操作
- ✅ 首次启动即可使用所有工作流功能
- ✅ 避免重复初始化，节省资源
- ✅ 提供手动重新初始化的方法
- ✅ 静默失败，不影响用户体验

### 📋 相关文件

- `miniprogram/app.js` - 主应用文件，包含初始化逻辑
- `cloudfunctions/initWorkflowDB/index.js` - 初始化云函数
- `cloudfunctions/announcementManager/index.js` - 通知公告管理云函数

### 🔗 相关链接

- **initWorkflowDB 云函数**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0
- **workflow_templates 集合**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates
