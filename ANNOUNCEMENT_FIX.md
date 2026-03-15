# 通知公告云函数修复说明

## 问题原因

在 `announcementManager` 云函数中，集合名称定义错误：
- **错误名称**：`notificationsCollection`
- **正确名称**：`announcementsCollection`

## 修复内容

已修复的7处错误：

| 行号 | 函数 | 操作 |
|------|------|------|
| 133 | createAnnouncement | 添加通知公告记录 |
| 214 | listAnnouncements | 查询总数 |
| 222 | listAnnouncements | 查询列表 |
| 244 | getAnnouncement | 查询详情 |
| 260 | getAnnouncement | 更新已读状态 |
| 281 | revokeAnnouncement | 查询撤回权限 |
| 310 | revokeAnnouncement | 更新撤回状态 |

## 需要手动完成的工作

### 1. 重新部署 announcementManager 云函数

由于自动化部署工具遇到问题，请手动部署：

**步骤：**

1. 打开云开发控制台的云函数详情页：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0
   ```

2. 点击"代码"标签页

3. 点击"上传并部署：选择本地文件"或"上传并部署：云端安装依赖"

4. 等待部署完成（约30秒-1分钟）

5. 部署完成后，点击"运行测试"验证

**测试用例：**

```json
{
  "action": "list",
  "params": {
    "page": 1,
    "pageSize": 10
  }
}
```

**预期结果：**

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [],
    "total": 0,
    "page": 1,
    "pageSize": 10,
    "hasMore": false
  }
}
```

### 2. 创建 announcements 集合（如果还没有）

**步骤：**

1. 打开数据库控制台：
   ```
   https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
   ```

2. 查看是否有 `announcements` 集合

3. 如果没有，点击"新建集合"

4. 输入集合名称：`announcements`

5. 点击"确定"

### 3. 验证修复

修复后，在小程序中测试以下功能：

1. **打开通知公告列表页**
   - 路径：办公 → 通知公告
   - 预期：正常显示列表（即使为空）

2. **发布新通知**
   - 点击"发布"按钮
   - 填写标题和内容
   - 选择类型
   - 点击"发布"
   - 预期：发布成功，返回列表页

3. **查看通知详情**
   - 点击通知项
   - 预期：正常显示详情内容

4. **撤回通知**
   - 在详情页点击"撤回"按钮（如果是自己发布的）
   - 预期：撤回成功，状态更新为"已撤回"

## 验证清单

部署完成后，使用以下清单验证：

- [ ] announcementManager 云函数已部署
- [ ] 云函数测试通过（返回 code: 0）
- [ ] announcements 集合已创建
- [ ] 小程序通知公告列表页可以正常打开
- [ ] 可以发布新通知
- [ ] 可以查看通知详情
- [ ] 可以撤回通知

## 相关链接

- **云函数详情**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/scf/detail?id=announcementManager&NameSpace=cloud1-8gdftlggae64d5d0
- **数据库集合**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gdftlggae64d5d0#/db/doc
- **小程序路径**：`/pages/office/announcement-list/announcement-list`

## 错误信息说明

原始错误：
```
pagination.js:124 [PaginationBehavior] 加载数据失败: Error: notificationsCollection is not defined
    at announcement-list.js? [sm]:75
```

这是因为云函数中使用了未定义的变量 `notificationsCollection`，导致运行时错误。

## 注意事项

1. **集合名称规范**：
   - 通知公告集合：`announcements` ✅
   - 不要使用：`notifications` ❌

2. **代码规范**：
   - 所有新增功能都应该先在云函数中定义正确的集合名称
   - 前端调用时确保集合名称一致

3. **测试规范**：
   - 修改云函数后必须重新部署
   - 部署后必须进行测试验证
   - 测试应该覆盖所有功能点
