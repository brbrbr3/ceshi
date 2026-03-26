---
name: 消息通知未读badge显示功能（优化版）
overview: 复用首页现有逻辑，在个人中心页面显示未读消息数量badge
todos:
  - id: add-sync-notifications
    content: 在 profile.js 中添加 syncNotifications 方法
    status: completed
  - id: update-onshow
    content: 在 onShow 中调用 syncNotifications
    status: completed
    dependencies:
      - add-sync-notifications
  - id: update-badge-logic
    content: 动态更新 menuGroups 的 badge 字段
    status: completed
    dependencies:
      - add-sync-notifications
---

## 产品概述

为个人中心页面的"消息通知"菜单项添加未读消息数量角标（badge），显示格式为"X条未读"。

## 核心功能

- 在 profile 页面加载时自动获取并显示未读数量
- 未读数量为0时不显示 badge
- 进入消息中心后刷新 badge 状态

## 技术栈

- 前端: 微信小程序原生框架
- 数据库: CloudBase NoSQL (notifications 集合)

## 实现方案

### 复用现有逻辑

参考首页 `home.js` 第175-182行的实现：

```javascript
syncNotifications() {
  app.getNotifications({ page: 1, pageSize: 20 }, function(result) {
    const notifications = result.data || []
    const unreadCount = notifications.filter(n => !n.read).length
    this.setData({ unreadNotificationCount: unreadCount })
  }.bind(this))
}
```

### 页面逻辑实现

修改 `miniprogram/pages/office/profile/profile.js`：

1. 添加 `syncNotifications()` 方法
2. 在 `onShow()` 中调用该方法
3. 动态更新 `menuGroups[0].items[0].badge` 字段

### 数据流

```
profile.onShow() 
  → syncUserProfile() 
  → syncNotifications() 
  → app.getNotifications() 
  → 计算未读数量
  → 更新 menuGroups[0].items[0].badge
```

## 目录结构

```
d:\WechatPrograms\ceshi\
└── miniprogram/
    └── pages/office/profile/
        └── profile.js         # [MODIFY] 添加 syncNotifications 方法和 badge 更新逻辑
```

## 实现注意事项

1. **无需修改云函数** - 复用现有 `app.getNotifications()` 方法
2. **无需修改 app.js** - 直接调用现有方法
3. badge 显示逻辑已存在于 wxml（第57行），无需修改
4. 未读数量大于0时显示 "X条未读"，为0时不设置 badge 字段

## 实现优势

1. 代码量最小 - 只修改一个文件
2. 无需部署云函数 - 减少运维工作
3. 与首页逻辑一致 - 保持代码风格统一
4. 前端过滤更灵活 - 响应更快