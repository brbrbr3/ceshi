# 微信订阅消息配置指南

## 📱 配置步骤

### 1. 在微信公众平台申请订阅消息模板

登录微信公众平台：https://mp.weixin.qq.com/

#### 1.1 进入订阅消息管理

**路径**：功能 → 订阅消息 → 我的模板

#### 1.2 创建订阅消息模板

点击"选用"，选择合适的模板。如果没有合适的模板，可以点击"申请"创建新模板。

### 2. 需要配置的模板

根据工作流框架，需要配置以下4个订阅消息模板：

#### 模板1：任务分配通知

**用途**：通知审批人有新的审批任务

**模板内容示例**：
```
审批任务：{{thing1.DATA}}
任务名称：{{thing2.DATA}}
任务状态：{{phrase4.DATA}}
截止时间：{{time3.DATA}}
```

**参数说明**：
- `thing1`：审批任务（字符串，最多20字）
- `thing2`：任务名称（字符串，最多20字）
- `phrase4`：待审批（字符串，最多5字）
- `time3`：截止时间（日期时间）

**页面跳转路径**：`pages/workflow/task-detail/task-detail`

---

#### 模板2：任务完成通知

**用途**：通知申请人审批结果

**模板内容示例**：
```
审批结果：{{thing1.DATA}}
审批意见：{{thing2.DATA}}
任务状态：{{phrase4.DATA}}
完成时间：{{time3.DATA}}
```

**参数说明**：
- `thing1`：审批通过/审批驳回（字符串，最多20字）
- `thing2`：审批意见（字符串，最多20字）
- `phrase4`：已完成/已驳回（字符串，最多5字）
- `time3`：完成时间（日期时间）

**页面跳转路径**：`pages/workflow/order-detail/order-detail`

---

#### 模板3：任务超时通知

**用途**：提醒审批人任务即将超时

**模板内容示例**：
```
提醒事项：{{thing1.DATA}}
截止时间：{{time3.DATA}}
处理建议：{{phrase4.DATA}}
提醒时间：{{time3.DATA}}
```

**参数说明**：
- `thing1`：任务超时（字符串，最多20字）
- `time3`：截止时间（日期时间）
- `phrase4`：请及时处理（字符串，最多5字）

**页面跳转路径**：`pages/workflow/task-detail/task-detail`

---

#### 模板4：流程退回通知

**用途**：通知申请人流程已退回，需要补充资料

**模板内容示例**：
```
通知类型：{{thing1.DATA}}
退回原因：{{thing2.DATA}}
处理建议：{{phrase4.DATA}}
退回时间：{{time3.DATA}}
```

**参数说明**：
- `thing1`：流程退回（字符串，最多20字）
- `thing2`：退回原因（字符串，最多20字）
- `phrase4`：需补充资料（字符串，最多5字）
- `time3`：退回时间（日期时间）

**页面跳转路径**：`pages/workflow/order-detail/order-detail`

---

### 3. 获取模板ID

创建完模板后，在模板详情页面可以看到模板ID，格式类似：`ABC1234567890xyz`

### 4. 更新数据库中的模板ID

使用CloudBase控制台或云函数更新 `workflow_subscriptions` 集合中的 `templateId` 字段。

**控制台地址**：`https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlgae64d5d0#/db/doc/collection/workflow_subscriptions`

---

### 5. 小程序端请求订阅权限

在提交工单前，需要请求用户的订阅消息授权。

```javascript
wx.requestSubscribeMessage({
  tmplIds: ['模板ID_1', '模板ID_2'],
  success: (res) => {
    console.log('订阅成功', res)
    // 提交注册申请
    this.submitRegistration()
  },
  fail: (err) => {
    console.error('订阅失败', err)
    // 即使订阅失败也允许提交
    this.submitRegistration()
  }
})
```

---

## ⚠️ 注意事项

1. **模板格式必须匹配**：模板的参数名称和数据类型必须与代码中定义的完全一致。
2. **用户授权**：发送订阅消息前，必须先调用 `wx.requestSubscribeMessage` 请求用户授权。
3. **模板数量限制**：每个小程序最多可以创建25个订阅消息模板。
4. **发送频率限制**：用户可以拒收订阅消息，拒收后无法再发送。
5. **模板审核**：新创建的模板需要经过微信审核，审核时间通常为1-3个工作日。

---

## 📋 配置清单

- [ ] 在微信公众平台创建4个订阅消息模板
- [ ] 获取4个模板的ID
- [ ] 更新 `workflow_subscriptions` 集合中的 `templateId` 字段
- [ ] 在小程序端请求订阅权限
- [ ] 测试订阅消息是否能正常发送

---

**配置完成后，订阅消息功能即可正常使用。**
