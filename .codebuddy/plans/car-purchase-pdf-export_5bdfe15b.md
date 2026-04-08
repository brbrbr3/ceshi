---
name: car-purchase-pdf-export
overview: 为已通过的购车申请/购车借款申请增加导出PDF功能，复用现有generateOrderPdf云函数
todos:
  - id: add-export-js
    content: car-purchase.js 新增 exporting 状态和 handleExportPdf 方法
    status: completed
  - id: add-export-wxml
    content: car-purchase.wxml 详情弹窗底部增加导出PDF按钮
    status: completed
    dependencies:
      - add-export-js
  - id: add-export-wxss
    content: car-purchase.wxss 新增 cp-export-btn 样式
    status: completed
---

## 用户需求

为【已通过】的【购车申请】和【购车借款申请】，在详情弹窗底部操作区的【关闭】按钮旁增加【导出PDF】按钮。点击后传入工单orderId，调用已有generateOrderPdf云函数，导出包含申请详情+审批历史+签字图片的PDF文件。

## 产品概述

复用就医申请的PDF导出模式，在购车详情弹窗中为已通过的审批记录提供一键导出PDF功能。

## 核心功能

- 仅在 `purchase_application` 或 `purchase_loan` 类型且 `status === 'approved'` 时显示【导出PDF】按钮
- 点击后调用 `generateOrderPdf` 云函数（传入 orderId），获取PDF下载链接
- 自动下载并打开PDF文件，支持分享/保存
- 防重复点击（exporting 状态控制）

## 技术栈

- 前端：微信小程序（已有项目架构）
- 云函数：已有 `generateOrderPdf`（pdfkit + 思源黑体，动态读取 workflow_templates.displayConfig + workflow_logs + user_signatures）
- 无需新增云函数，无需修改云函数代码

## 实现方案

完全复用已有的 `generateOrderPdf` 云函数。该函数接收 `orderId`，从 `work_orders` 获取 `businessData`，从 `workflow_templates` 获取 `displayConfig.detailFields` 动态渲染字段，查询 `workflow_logs` 审批历史并嵌入签字图片。`car_purchase_application` 和 `car_purchase_loan` 模板均已有 `displayConfig.detailFields`，无需补充。

前端参考 `medical-application.js` 的 `handleExportPdf` 模式：`callFunction → downloadFile → openDocument`。

## 目录结构

```
d:/WechatPrograms/ceshi/miniprogram/pages/office/car-purchase/
├── car-purchase.js    # [MODIFY] data加exporting:false，新增handleExportPdf方法
├── car-purchase.wxml  # [MODIFY] 详情弹窗底部操作区增加导出PDF按钮
└── car-purchase.wxss  # [MODIFY] 新增cp-export-btn样式
```

## 关键实现细节

- `detailData.orderId` 由 `carPurchase` 云函数的 `getDetail` 返回（`...record` 包含 orderId）
- 按钮显示条件：`detailData.status === 'approved' && (detailData.type === 'purchase_application' || detailData.type === 'purchase_loan')`
- 导出过程：`exporting` 状态防重复点击，按钮显示 loading 态
- `wx.openDocument` 使用 `showMenu: true` 支持用户转发/保存