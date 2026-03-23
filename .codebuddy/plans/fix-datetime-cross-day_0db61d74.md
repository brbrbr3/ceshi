---
name: fix-datetime-cross-day
overview: 修复 calendar.js 中时间计算函数的跨日处理问题
todos:
  - id: fix-getDefaultDatetime
    content: 修复 getDefaultDatetime 函数的跨日计算逻辑
    status: completed
  - id: fix-handleStartDatetimeChange
    content: 修复 handleStartDatetimeChange 函数的跨日计算逻辑
    status: completed
  - id: verify-syntax
    content: 验证修复后的语法正确性
    status: completed
    dependencies:
      - fix-getDefaultDatetime
      - fix-handleStartDatetimeChange
---

## 问题分析

`getDefaultDatetime` 和 `handleStartDatetimeChange` 函数中的时间计算使用简单的 `% 24` 取模运算，未处理跨日情况。

例如：当前时间 23:45，向上取整应为次日 00:00，但当前代码只将小时变为 0，日期仍为当天。

## 修复目标

使用 Date 对象进行时间计算，自动处理跨日、跨月、跨年情况。

## 修复方案

使用 Date 对象进行时间加减运算：

1. 将基准时间转为 Date 对象
2. 使用 `setMinutes()`/`setHours()` 或毫秒偏移进行时间计算
3. 格式化输出结果

## 修改位置

1. **getDefaultDatetime 函数**（约第614-646行）

- 开始时间向上取整：需处理跨日
- 结束时间 +30分钟：需处理跨日

2. **handleStartDatetimeChange 函数**（约第733-759行）

- 结束时间 = 开始时间 +30分钟：需处理跨日