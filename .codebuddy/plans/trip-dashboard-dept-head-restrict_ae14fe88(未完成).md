---
name: trip-dashboard-dept-head-restrict
overview: 部门负责人角色在出行管理页只能查看本部门数据，部门picker锁定为自己所在部门且不可切换。
todos:
  - id: fix-dept-picker
    content: 修改 trip-dashboard.js loadConstants() 和 WXML，限制部门负责人只能选本部门
    status: pending
---

## Product Overview

"出行管理"页面的部门筛选器权限优化，使【部门负责人】角色只能查看本部门数据。

## Core Features

- 部门负责人登录出行管理页面时，部门 picker 仅显示自己所属的部门，无"全部"选项，无法切换到其他部门
- 馆领导和管理员保持现有行为不变，仍可选择"全部部门"或任意部门
- 当只有一个可选部门时，隐藏 picker 的下拉箭头，避免误导用户

## Tech Stack

- 微信小程序原生开发（WXML + JS + WXSS）

## Implementation Approach

仅需修改 `trip-dashboard.js` 的 `loadConstants()` 方法，根据角色动态设置部门选项列表。部门负责人时只保留自身部门；馆领导/admin 时保留原有的"全部"+全部部门列表。

`checkPermission()` 中已有 `isDeptHead` 判断和 `userRole` 存入 data，`loadConstants()` 可通过 `this.data.userRole` 读取角色信息。

## Implementation Notes

- 修改 `loadConstants()`：当 `userRole === '部门负责人'` 时，`departmentOptions` 设为 `[user.department]`（仅自身部门）
- 修改 WXML：当 `departmentOptions.length <= 1` 时隐藏下拉箭头，避免用户误以为可以切换
- 无需修改云函数，后端已有 `department` 参数过滤逻辑
- `selectedDepartment` 在 `checkPermission()` 中已根据角色正确初始化（第120行），无需额外调整