# 工作流模板导入指南

## 说明

工作流模板已经添加到 `initWorkflowDB` 云函数中。按照以下步骤导入工作流模板。

---

## 步骤1: 部署 initWorkflowDB 云函数

### 方式1: 云开发控制台部署（推荐）

1. 打开云函数详情页：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0
   ```

2. 点击"代码"标签页

3. 点击"上传并部署"按钮

4. 等待部署完成（约30秒-1分钟）

### 方式2: 微信开发者工具部署

1. 打开微信开发者工具

2. 右键点击 `cloudfunctions/initWorkflowDB` 文件夹

3. 选择"上传并部署：云端安装依赖"

4. 等待部署完成

---

## 步骤2: 运行 initWorkflowDB 云函数导入模板

### 方式1: 云开发控制台测试（推荐）

1. 打开 initWorkflowDB 云函数的"测试"标签页：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0
   ```

2. 点击"触发测试"按钮

3. 查看测试结果，确认返回成功：
   ```json
   {
     "code": 0,
     "message": "工作流数据库初始化完成",
     "data": {
       "duration": xxx,
       "templatesImported": 3,
       "subscriptionsImported": 4,
       "collectionsChecked": 5
     }
   }
   ```

4. 确认日志中显示 `✓ 导入模板: 通知公告发布 (notification_publish)`

### 方式2: 小程序中调用

1. 在任意页面的 JS 文件中添加以下代码：

   ```javascript
   Page({
     data: {},

     onLoad() {
       this.initWorkflowDB()
     },

     initWorkflowDB() {
       wx.cloud.callFunction({
         name: 'initWorkflowDB'
       }).then(res => {
         const result = res.result
         if (result && result.code === 0) {
           wx.showToast({
             title: '工作流模板导入成功',
             icon: 'success'
           })
           console.log('导入结果：', result.data)
         } else {
           wx.showToast({
             title: result.message || '导入失败',
             icon: 'none'
           })
         }
       }).catch(err => {
         console.error('导入失败：', err)
         wx.showToast({
           title: '导入失败',
           icon: 'none'
         })
       })
     }
   })
   ```

2. 刷新页面，运行代码

3. 查看控制台日志确认导入成功

---

## 步骤3: 验证工作流模板导入成功

### 验证方式1: 查询数据库

1. 打开云开发控制台 - 文档型数据库：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates
   ```

2. 检查是否存在 `notification_publish` 工作流模板

3. 点击查看记录详情，确认以下字段：
   - `name`: "通知公告发布"
   - `code`: "notification_publish"
   - `version`: 1
   - `steps`: []（空数组）
   - `status`: "active"

### 验证方式2: 调用工作流引擎查询模板

```javascript
wx.cloud.callFunction({
  name: 'workflowEngine',
  data: {
    action: 'getTemplates',
    page: 1,
    pageSize: 10
  }
}).then(res => {
  const result = res.result
  if (result && result.code === 0) {
    const templates = result.data.list || []
    const notificationTemplate = templates.find(t => t.code === 'notification_publish')

    if (notificationTemplate) {
      console.log('通知公告发布模板导入成功：', notificationTemplate)
      wx.showToast({
        title: '工作流模板验证成功',
        icon: 'success'
      })
    } else {
      console.error('未找到通知公告发布模板')
      wx.showToast({
        title: '工作流模板不存在',
        icon: 'none'
      })
    }
  }
}).catch(err => {
  console.error('查询失败：', err)
})
```

---

## 工作流模板说明

### 通知公告发布模板

| 字段 | 值 | 说明 |
|------|-----|------|
| name | 通知公告发布 | 模板名称 |
| code | notification_publish | 模板唯一标识 |
| version | 1 | 版本号 |
| description | 发布通知公告（0步审批，直接发布） | 模板描述 |
| category | approval | 分类（审批类） |
| steps | [] | 审批步骤（空数组表示0步） |
| defaultTimeout | 72 | 默认超时时间（小时） |
| notifyOnSubmit | false | 提交时是否通知 |
| notifyOnComplete | false | 完成时是否通知 |
| notifyOnTimeout | false | 超时时是否通知 |
| status | active | 状态（激活） |

---

## 已包含的工作流模板

initWorkflowDB 云函数现在包含以下工作流模板：

1. **用户注册审批** (`user_registration`)
   - 审批步骤：管理员审批
   - 适用于：新用户注册审批流程

2. **就医申请审批** (`medical_application`)
   - 审批步骤：部门负责人 → 会计主管 → 馆领导
   - 适用于：就医申请审批流程

3. **通知公告发布** (`notification_publish`)
   - 审批步骤：无（0步审批）
   - 适用于：通知公告发布流程

---

## 后续新增工作流模板的规范

### 规范要求

1. **必须添加到 initWorkflowDB 云函数**
   - 所有新增的工作流模板都应该添加到 `initWorkflowDB` 云函数的 `EXAMPLE_TEMPLATES` 数组中
   - 不要直接在数据库控制台手动创建模板

2. **模板结构**
   - 必须符合工作流模板的数据结构
   - 必须包含所有必需字段

3. **版本管理**
   - 每个模板都应该有 `version` 字段
   - 修改模板时应该递增版本号

4. **导入机制**
   - 使用 `initWorkflowDB` 云函数导入所有模板
   - 自动检测重复，避免重复导入

### 新增模板示例

如果需要新增其他工作流模板，按照以下格式添加到 `initWorkflowDB` 云函数：

```javascript
{
  name: '模板名称',
  code: 'template_code',
  version: 1,
  description: '模板描述',
  category: 'approval',
  steps: [
    {
      stepNo: 1,
      stepName: '步骤名称',
      stepType: 'serial',  // serial（串行）或 parallel（并行）
      approverType: 'role',  // role（角色）或 user（指定用户）
      approverConfig: {
        roleIds: ['role_code']  // approverType 为 role 时使用
        // 或
        userIds: ['openid1', 'openid2']  // approverType 为 user 时使用
      },
      approvalStrategy: 'sequential',  // sequential（依次）或 consensus（会签/或签）
      canReject: true,
      canReturn: false,
      returnTo: 0,
      timeout: 72,
      timeoutAction: 'remind'  // remind（提醒）、auto_approve（自动通过）、auto_reject（自动驳回）
    }
    // 可以添加更多步骤...
  ],
  defaultTimeout: 72,
  notifyOnSubmit: true,
  notifyOnComplete: true,
  notifyOnTimeout: true,
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now()
}
```

---

## 故障排查

### 问题1: 部署云函数失败

**症状**：部署时出现错误

**解决方案**：
1. 检查云函数代码语法是否正确
2. 确认依赖包已安装（package.json）
3. 查看云开发控制台的日志和错误信息

### 问题2: 导入模板失败

**症状**：运行 initWorkflowDB 云函数时返回错误

**解决方案**：
1. 检查 `workflow_templates` 集合是否已创建
2. 确认云函数有足够的数据库操作权限
3. 查看云函数日志，定位具体错误

### 问题3: 模板重复导入

**症状**：多次运行 initWorkflowDB 后出现重复模板

**说明**：这是正常行为，代码会自动检测重复并跳过

**日志示例**：
```
- 模板 notification_publish v1 已存在，跳过
```

---

## 相关资源

### 云函数

- **initWorkflowDB**: 工作流模板初始化云函数
  - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=initWorkflowDB&NameSpace=cloud1-8gdftlggae64d5d0

- **workflowEngine**: 工作流引擎云函数
  - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=workflowEngine&NameSpace=cloud1-8gdftlggae64d5d0

- **announcementManager**: 通知公告管理云函数
  - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0

### 数据库集合

- **workflow_templates**: 工作流模板集合
  - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/workflow_templates

- **announcements**: 通知公告集合
  - 控制台：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc/collection/announcements
