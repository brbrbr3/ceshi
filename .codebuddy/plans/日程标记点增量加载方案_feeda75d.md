---
name: 日程标记点增量加载方案
overview: 优化日历日程标记点加载：采用增量加载模式，记录已加载年月，避免重复加载；日程变更时仅刷新当月数据
todos:
  - id: init-loaded-months-set
    content: 在 onLoad 中初始化 loadedMonthsSet 页面实例属性
    status: completed
  - id: modify-load-schedule-marks
    content: 修改 loadScheduleMarks 实现增量加载逻辑
    status: completed
  - id: add-remove-month-cache
    content: 添加 removeMonthFromCache 辅助函数
    status: completed
  - id: modify-refresh-schedule-marks
    content: 修改 refreshScheduleMarks 实现局部刷新逻辑
    status: completed
---

## 产品概述

优化日历日程标记点的加载机制，实现增量加载模式，提升用户体验和数据一致性。

## 核心功能

1. **增量加载**：首次加载当月日程点后，切换月份时累加新月份数据，不清空已加载数据
2. **加载记录**：记录已加载日程点的年月，避免重复请求
3. **局部刷新**：添加/修改/删除日程时，仅清除并重新加载当月数据

## 技术方案

### 数据结构设计

```javascript
// 页面实例属性
this.scheduleDatesSet = new Set()           // 已加载的日程日期集合
this.loadedMonthsSet = new Set()            // 已加载的年月集合，格式 'YYYY-MM'
```

### 核心逻辑

**1. 增量加载流程**

```
用户进入页面 → 加载当月日程点 → 记录到 scheduleDatesSet 和 loadedMonthsSet
       ↓
用户切换月份 → 检查该月是否已加载
       ↓
   未加载 → 调用云函数获取数据 → 累加到 scheduleDatesSet → 记录到 loadedMonthsSet
   已加载 → 跳过
```

**2. 局部刷新流程**

```
添加/修改/删除日程 → 获取当前年月 → 从 loadedMonthsSet 移除该月
       ↓
从 scheduleDatesSet 中移除该月所有日期
       ↓
重新加载该月数据 → 更新 scheduleDatesSet 和 loadedMonthsSet
```

### 实现要点

**loadScheduleMarks(year, month)**

- 检查 `loadedMonthsSet` 是否包含 `${year}-${month}`
- 未包含：调用云函数获取数据，累加到 `scheduleDatesSet`，记录到 `loadedMonthsSet`
- 已包含：直接返回，不重复请求

**refreshScheduleMarks()**

- 获取当前年月 `${currentYear}-${currentMonth}`
- 从 `loadedMonthsSet` 中移除
- 从 `scheduleDatesSet` 中过滤掉该月日期
- 重新调用 `loadScheduleMarks`

**辅助函数**

- `removeMonthFromCache(year, month)`：从缓存中移除指定月份的所有日期

### 文件修改

```
d:/WechatPrograms/ceshi/
└── miniprogram/pages/office/calendar/
    └── calendar.js    # [MODIFY] 实现增量加载和局部刷新逻辑
```