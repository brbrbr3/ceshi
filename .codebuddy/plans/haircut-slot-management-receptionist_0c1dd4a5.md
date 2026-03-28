---
name: haircut-slot-management-receptionist
overview: 为理发预约的"预约理发"tab页增加招待员视角的时段管理功能：显示理发人姓名、设置不可预约、取消预约等
todos:
  - id: modify-backend
    content: 修改后端 haircutManager 云函数：修改 getReservationSlots 返回结构、新增 setSlotStatus 接口
    status: completed
  - id: deploy-function
    content: 使用 [MCP:CloudBase MCP] 部署 haircutManager 云函数
    status: completed
    dependencies:
      - modify-backend
  - id: modify-frontend-js
    content: 修改前端 haircut.js：新增 userOpenId 字段、修改 buildSlots 方法、新增操作方法
    status: completed
    dependencies:
      - deploy-function
  - id: modify-frontend-wxml
    content: 修改前端 haircut.wxml：招待员视角渲染、操作按钮
    status: completed
    dependencies:
      - modify-frontend-js
  - id: modify-frontend-wxss
    content: 修改前端 haircut.wxss：新增黄色标签、操作按钮样式
    status: completed
    dependencies:
      - modify-frontend-wxml
  - id: test-verify
    content: 验证功能：各状态显示、操作按钮交互
    status: completed
    dependencies:
      - modify-frontend-wxss
---

## 产品概述

为理发预约的"预约理发"tab页增加招待员特殊视角和用户"我已预约"状态显示功能。

## 核心功能

### 招待员视角

1. **已被预约时段**：显示理发人姓名（代约显示"理发人（代约人）"）
2. **操作按钮**：

- 已被预约：红色"x"按钮 → 取消原因弹窗 → 释放时段
- 可预约：红色"x"按钮 → 确认后设为"不可预约"
- 不可预约：绿色"+"按钮 → 确认后恢复为"可预约"

### 所有用户视角

1. **我已预约时段**：显示黄色"我已预约"标签
2. **红色"x"按钮**：点击确认后取消自己的预约

## 时段状态定义

| 状态 | 标签文字 | 标签颜色 |
| --- | --- | --- |
| 可预约 | 可预约 | 绿色 #10B981 |
| 已被预约（他人） | 已被预约 | 灰色 #6B7280 |
| 我已预约 | 我已预约 | 黄色 #F59E0B |
| 不可预约 | 不可预约 | 红色 #EF4444 |


## 技术栈

- 微信小程序原生开发
- CloudBase 云函数
- NoSQL 文档数据库

## 前后端分工

### 后端修改

| 序号 | 修改内容 | 说明 |
| --- | --- | --- |
| 1 | 修改 `getReservationSlots` 接口 | 返回完整预约信息（含 bookerId 用于判断"我已预约"） |
| 2 | 新增 `setSlotStatus` 接口 | 招待员设置时段状态（不可预约/恢复可预约） |
| 3 | 新增数据集合 `haircut_slot_status` | 存储不可预约时段记录 |


### 前端修改

| 序号 | 修改内容 | 文件 |
| --- | --- | --- |
| 1 | 新增数据字段：userOpenId | haircut.js |
| 2 | 修改 `buildSlots` 方法 | 构建完整时段状态（我已预约、不可预约、预约人信息） |
| 3 | 新增方法 | `handleSlotAction` 处理操作按钮点击 |
| 4 | 修改 WXML | 招待员视角渲染（显示姓名、操作按钮） |
| 5 | 新增样式 | 黄色标签、操作按钮样式 | haircut.wxss |


## 接口设计

### getReservationSlots 返回结构（修改）

```javascript
{
  slotsByDate: {
    '2026-03-30': [
      {
        timeSlot: '14:30',
        status: 'booked',        // booked / unavailable / available
        displayName: '张三',     // 预约人显示名
        isProxy: false,          // 是否代约
        appointmentId: 'xxx',    // 预约记录ID（用于取消）
        bookerId: 'openid_xxx'   // 预约人openid（用于判断"我已预约"）
      }
    ]
  }
}
```

### setSlotStatus 接口（新增）

```javascript
// 入参
{
  action: 'setSlotStatus',
  date: '2026-03-30',
  timeSlot: '14:30',
  status: 'unavailable'  // unavailable（不可预约） / available（恢复可预约）
}

// 返回
{
  code: 0,
  message: '设置成功'
}
```

## 数据库设计

### 新增集合：haircut_slot_status

```javascript
{
  _id: 'auto',
  date: '2026-03-30',           // 日期
  timeSlot: '14:30',            // 时段
  status: 'unavailable',        // 状态：unavailable
  setBy: 'openid_xxx',          // 设置人openid
  setByName: '招待员姓名',
  createdAt: 1711804800000,
  updatedAt: 1711804800000
}
```

## 目录结构

```
cloudfunctions/
└── haircutManager/
    └── index.js          # [修改] 新增接口、修改返回结构

miniprogram/pages/office/haircut/
├── haircut.js            # [修改] 新增逻辑
├── haircut.wxml          # [修改] 新增UI渲染
└── haircut.wxss          # [修改] 新增样式
```