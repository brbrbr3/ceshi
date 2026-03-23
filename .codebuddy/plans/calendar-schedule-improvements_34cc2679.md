---
name: calendar-schedule-improvements
overview: 优化日历日程功能：1) 使用 datetime-picker 组件替换原生 picker；2) 实现重叠日程并排显示算法
todos:
  - id: update-calendar-wxml-picker
    content: 修改 calendar.wxml 替换时间选择器为 datetime-picker 组件
    status: completed
  - id: update-calendar-js-datetime
    content: 修改 calendar.js 添加 datetime-picker 事件处理
    status: completed
    dependencies:
      - update-calendar-wxml-picker
  - id: update-calendar-js-overlap
    content: 修改 calendar.js 实现日程重叠并排算法
    status: completed
  - id: update-calendar-wxss-width
    content: 修改 calendar.wxss 调整日程条宽度样式
    status: completed
---

## 用户需求

### 1. 替换时间选择器组件

将日程弹窗中的开始时间、结束时间 picker 改用项目中已有的 `datetime-picker` 组件。

### 2. 日程重叠并排显示

参考 Apple Calendar 和 Google Calendar 的设计，当多个日程时间段重叠时，自动左右分开显示，避免覆盖。

## 核心功能

- 开始/结束日期：使用 `fields="['year', 'month', 'day']"` 的 datetime-picker
- 开始/结束时间：使用 `fields="['hour', 'minute']"` 的 datetime-picker
- 日程重叠检测与列分配算法
- 动态计算日程条宽度和左边距

## 技术方案

### 1. datetime-picker 组件集成

组件已在 `calendar.json` 中注册，直接使用即可。

**WXML 改造**：

```
<!-- 开始日期时间 -->
<datetime-picker 
  value="{{scheduleForm.startDatetime}}"
  fields="{{['year', 'month', 'day', 'hour', 'minute']}}"
  start-date="2020-01-01"
  end-date="2030-12-31"
  bind:change="handleStartDatetimeChange"
/>

<!-- 结束日期时间 -->
<datetime-picker 
  value="{{scheduleForm.endDatetime}}"
  fields="{{['year', 'month', 'day', 'hour', 'minute']}}"
  bind:change="handleEndDatetimeChange"
/>
```

### 2. 日程重叠并排算法

**算法步骤**：

1. **排序**：按开始时间升序排列
2. **分组**：检测重叠关系，构建分组
3. **列分配**：使用贪心算法为组内日程分配列索引
4. **样式计算**：根据列数计算宽度和左边距

```javascript
// 核心算法
function calculateOverlapLayout(schedules) {
  if (!schedules.length) return []
  
  // 1. 排序
  const sorted = [...schedules].sort((a, b) => {
    const aStart = timeToMinutes(a.startTime)
    const bStart = timeToMinutes(b.startTime)
    return aStart - bStart
  })
  
  // 2. 分组并分配列
  const columns = [] // 每列的结束时间
  
  sorted.forEach(schedule => {
    const scheduleEnd = timeToMinutes(schedule.endTime)
    
    // 找到第一个可以放入的列（该列结束时间 <= 当前日程开始时间）
    let colIndex = columns.findIndex(colEnd => colEnd <= timeToMinutes(schedule.startTime))
    
    if (colIndex === -1) {
      // 没有可用列，新增一列
      columns.push(scheduleEnd)
      colIndex = columns.length - 1
    } else {
      // 放入该列，更新列的结束时间
      columns[colIndex] = scheduleEnd
    }
    
    schedule.columnIndex = colIndex
    schedule.totalColumns = columns.length
  })
  
  // 3. 回填 totalColumns（同一组的日程需要相同的总列数）
  updateTotalColumns(sorted)
  
  return sorted
}
```

### 3. 样式计算

```javascript
// 日程条样式
style="
  top: {{item.top}}rpx; 
  height: {{item.height}}rpx;
  width: {{item.width}}%;
  left: {{item.left}}%;
"
```

**宽度计算公式**：

- `width = (100 / totalColumns) - gap`
- `left = columnIndex * (100 / totalColumns)`
- `gap = 4rpx` 转换为百分比约 `1%`

## 目录结构

```
miniprogram/pages/office/calendar/
├── calendar.wxml       # [MODIFY] 替换 picker 为 datetime-picker
├── calendar.wxss       # [MODIFY] 调整日程条宽度样式
└── calendar.js         # [MODIFY] 添加重叠算法和事件处理
```

## Agent Extensions

### MCP - CloudBase MCP

- **Purpose**: 无需使用（代码修改任务）
- **Expected outcome**: N/A