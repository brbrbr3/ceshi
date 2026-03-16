# 通知公告工作流模板导入指南

## 问题说明

错误信息：`通知公告工作流配置不存在`

**原因**：`workflow_templates` 集合中还没有 `notification_publish`（通知公告发布）的工作流模板。

## 解决方案

需要部署并运行 `initWorkflowDB` 云函数来导入工作流模板。

---

## 步骤1：创建必要的数据库集合

### 1.1 打开数据库控制台
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
```

### 1.2 创建以下集合（如果还没有）

**必需集合**：
- `workflow_templates` - 工作流模板集合
- `workflow_orders` - 工作流工单集合
- `announcements` - 通知公告集合

**可选集合**（如果需要完整的工作流功能）：
- `workflow_tasks` - 工作流任务集合
- `workflow_logs` - 工作流日志集合
- `workflow_subscriptions` - 工作流订阅配置集合

**创建步骤**：
1. 点击"新建集合"按钮
2. 输入集合名称（如：`workflow_templates`）
3. 点击"确定"
4. 重复上述步骤，创建所有必需集合

---

## 步骤2：部署 initWorkflowDB 云函数

### 2.1 打开云函数详情页
```
https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0
```

### 2.2 部署云函数
1. 点击"代码"标签页
2. 点击"上传并部署"按钮
3. 选择"上传并部署：云端安装依赖"
4. 等待部署完成（约30秒-1分钟）

---

## 步骤3：运行 initWorkflowDB 导入工作流模板

### 3.1 方式一：云开发控制台测试（推荐）

1. 在 `initWorkflowDB` 云函数页面，点击"测试"标签页
2. 点击"触发测试"按钮
3. 查看测试结果

**预期成功输出**：
```json
{
  "code": 0,
  "message": "工作流数据库初始化完成",
  "data": {
    "duration": 1234,
    "templatesImported": 4,
    "subscriptionsImported": 3,
    "collectionsChecked": 6
  }
}
```

### 3.2 方式二：查看日志

1. 在云函数页面，点击"日志"标签页
2. 查看最新的日志记录
3. 确认看到以下日志：

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

### 3.3 方式三：小程序中调用（临时测试）

在小程序任意页面添加临时测试代码：

```javascript
// 临时测试代码 - 运行一次后删除
wx.cloud.callFunction({
  name: 'initWorkflowDB'
}).then(res => {
  console.log('初始化结果：', res.result)
  wx.showToast({
    title: '导入成功',
    icon: 'success'
  })
}).catch(error => {
  console.error('初始化失败：', error)
  wx.showToast({
    title: '导入失败',
    icon: 'none'
  })
})
```

---

## 步骤4：验证工作流模板

### 4.1 在数据库控制台查看

1. 打开 `workflow_templates` 集合：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates
   ```

2. 查看记录列表，确认存在以下模板：
   - ✅ `user_registration` - 用户注册审批
   - ✅ `medical_application` - 就医申请审批
   - ✅ `notification_publish` - 通知公告发布（必需）

### 4.2 点击查看通知公告发布模板

点击 `notification_publish` 记录，确认数据结构：

```json
{
  "_id": "自动生成的ID",
  "name": "通知公告发布",
  "code": "notification_publish",
  "version": 1,
  "description": "发布通知公告（0步审批，直接发布）",
  "category": "approval",
  "steps": [],
  "defaultTimeout": 72,
  "notifyOnSubmit": false,
  "notifyOnComplete": false,
  "notifyOnTimeout": false,
  "status": "active",
  "createdAt": 1757917052000,
  "updatedAt": 1757917052000
}
```

**关键字段检查**：
- `code`: `notification_publish` ✅
- `steps`: `[]`（空数组，表示0步审批）✅
- `status`: `active` ✅

---

## 步骤5：测试发布通知

### 5.1 在小程序中发布测试通知

1. 进入"通知公告"页面
2. 点击"发布"按钮
3. 填写以下信息：
   - 标题：测试通知
   - 类型：普通
   - 内容：这是一个测试通知公告
4. 点击"立即发布"

### 5.2 预期结果

✅ 发布成功，显示提示"发布成功"
✅ 自动返回通知列表页
✅ 新发布的通知显示在列表中

---

## 常见问题排查

### 问题1：集合不存在

**错误信息**：`DATABASE_COLLECTION_NOT_EXIST`

**解决方案**：
1. 在控制台手动创建缺失的集合
2. 重新运行 initWorkflowDB

### 问题2：导入失败

**错误信息**：日志中显示 `✗ 导入模板失败`

**解决方案**：
1. 检查网络连接
2. 检查云函数是否正确部署
3. 重新运行 initWorkflowDB

### 问题3：模板已存在但仍然报错

**可能原因**：云函数代码未更新

**解决方案**：
1. 重新部署 initWorkflowDB 云函数
2. 重新运行导入
3. 在数据库中删除旧模板后重新导入

### 问题4：发布时仍然报错

**错误信息**：`通知公告工作流配置不存在`

**解决方案**：
1. 确认 `workflow_templates` 集合中存在 `code: 'notification_publish'` 的记录
2. 确认 announcementManager 云函数已重新部署（使用正确的集合名称）
3. 重新运行 initWorkflowDB

---

## 验证清单

完成以下步骤后，逐一勾选：

- [ ] 已创建 workflow_templates 集合
- [ ] 已创建 workflow_orders 集合
- [ ] 已创建 announcements 集合
- [ ] initWorkflowDB 云函数已部署
- [ ] initWorkflowDB 运行成功（code: 0）
- [ ] 日志中显示 `✓ 导入模板: 通知公告发布 (notification_publish)`
- [ ] workflow_templates 集合中存在 notification_publish 模板
- [ ] 可以在小程序中发布通知公告
- [ ] 发布的通知显示在列表中

---

## 相关链接

- **云开发控制台**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0
- **initWorkflowDB 云函数**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0
- **workflow_templates 集合**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates
- **announcementManager 云函数**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0

---

## 工作流模板说明

### 通知公告发布模板

- **名称**：通知公告发布
- **代码**：notification_publish
- **类型**：0步审批，直接发布
- **审批流程**：无需审批，发布后自动通过
- **超时时间**：72小时
- **通知设置**：不发送通知（因为0步审批）

**工作流数据**：
```json
{
  "name": "通知公告发布",
  "code": "notification_publish",
  "version": 1,
  "description": "发布通知公告（0步审批，直接发布）",
  "category": "approval",
  "steps": [],  // 空数组表示0步审批
  "defaultTimeout": 72,
  "notifyOnSubmit": false,
  "notifyOnComplete": false,
  "notifyOnTimeout": false,
  "status": "active"
}
```

---

## 后续操作

完成上述步骤后，通知公告功能即可正常使用：

1. ✅ 用户可以发布通知公告
2. ✅ 通知自动发布到列表
3. ✅ 用户可以查看通知详情
4. ✅ 发布者可以撤回自己的通知
5. ✅ 支持按类型筛选（紧急/重要/普通）
