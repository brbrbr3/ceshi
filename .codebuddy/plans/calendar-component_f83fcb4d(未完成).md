---
name: calendar-component
overview: 创建可复用的日历组件，支持月/周/年视图切换、农历节气显示、日期标注、区间选择等功能
design:
  styleKeywords:
    - Modern
    - Clean
    - Minimal
  fontSystem:
    fontFamily: PingFang-SC
    heading:
      size: 32rpx
      weight: 600
    subheading:
      size: 26rpx
      weight: 500
    body:
      size: 28rpx
      weight: 400
  colorSystem:
    primary:
      - "#2563EB"
      - "#1D4ED8"
    background:
      - "#FFFFFF"
      - "#F8FAFC"
    text:
      - "#1E293B"
      - "#64748B"
      - "#EF4444"
    functional:
      - "#EF4444"
      - "#16A34A"
      - "#F59E0B"
todos:
  - id: create-lunar-module
    content: 创建农历计算工具模块 lunar.js
    status: pending
  - id: create-brazil-holidays
    content: 创建巴西节假日数据模块 brazil-holidays.js
    status: pending
  - id: create-calendar-component
    content: 创建日历组件基础结构（JS/JSON/WXML/WXSS）
    status: pending
    dependencies:
      - create-lunar-module
      - create-brazil-holidays
  - id: implement-month-view
    content: 实现月视图核心逻辑和渲染
    status: pending
    dependencies:
      - create-calendar-component
  - id: implement-week-view
    content: 实现周视图和日程显示
    status: pending
    dependencies:
      - implement-month-view
  - id: implement-year-view
    content: 实现年视图
    status: pending
    dependencies:
      - implement-month-view
  - id: implement-range-select
    content: 实现区间选择功能
    status: pending
    dependencies:
      - implement-month-view
  - id: implement-markings
    content: 实现日期标注功能
    status: pending
    dependencies:
      - implement-month-view
  - id: test-integration
    content: 测试组件并集成到 home 页面
    status: pending
    dependencies:
      - implement-year-view
      - implement-range-select
      - implement-markings
---

## 产品概述

创建一个可复用的日历组件，支持多视图模式，具备农历显示、日期标注、区间选择等功能，供系统中请假、日程管理等场景复用。

## 核心功能

1. **月视图**

- 按月显示日期网格
- **周起始日为周日**：日 一 二 三 四 五 六
- 日期下方显示农历日期或节气
- 农历下方显示巴西节假日（如有）
- 周六周日显示为红色，工作日为黑色
- 左右滑动切换月份
- 显示年份月份标题，可点击快速选择

2. **周视图**

- 按周显示7天
- **周起始日为周日**：日 一 二 三 四 五 六
- 下方显示选中日期的日程列表
- 左右滑动切换周
- 点击日期可选中查看日程

3. **年视图**

- 12个月份卡片式布局
- 占据全屏显示
- 点击月份跳转到月视图

4. **日期标注**

- 右上角显示"休"（红色）或"班"（绿色）
- 标注数据由外部传入
- 支持调休工作日/休息日标识

5. **巴西节假日显示**

- 显示在农历信息下方
- 巴西联邦法定节假日：元旦、狂欢节、受难日、蒂拉登特斯日、劳动节、独立日、阿帕雷西达圣母日、亡灵节、共和国宣言日、圣诞节等
- 节假日数据内置在组件中，支持多语言显示（葡萄牙语）
- 通过属性 `showBrazilHolidays` 控制是否显示

6. **区间选择**

- 支持选择开始日期和结束日期
- 区间内日期高亮显示
- 触发选择事件供父组件使用

## 组件接口设计

```javascript
// 属性
properties: {
  mode: String,              // 'month' | 'week' | 'year'，默认 'month'
  selectedDate: Number,      // 选中的日期时间戳
  startDate: Number,         // 区间选择-开始日期
  endDate: Number,           // 区间选择-结束日期
  markings: Array,           // 日期标注数据 [{date, type: 'rest'|'work', label}]
  schedules: Array,          // 日程数据 [{date, title, time, type}]
  showLunar: Boolean,        // 是否显示农历，默认 true
  showBrazilHolidays: Boolean, // 是否显示巴西节假日，默认 true
  minDate: Number,           // 最小可选日期
  maxDate: Number,           // 最大可选日期
  enableRange: Boolean       // 是否启用区间选择
}

// 事件
events: {
  dateSelect: { date, lunar, holiday },  // 日期选中（含节假日信息）
  rangeSelect: { start, end },           // 区间选择完成
  monthChange: { year, month },          // 月份切换
  modeChange: { mode }                   // 视图模式切换
}
```

## 技术方案

### 1. 技术栈

- **组件框架**：微信小程序自定义组件
- **样式隔离**：`styleIsolation: 'apply-shared'`
- **滑动实现**：`swiper` 组件 + 动态计算页面
- **农历算法**：纯 JS 实现，无需外部依赖

### 2. 农历计算方案

采用查表法实现农历转换，包含：

- 1900-2100 年农历数据表
- 节气计算（基于太阳黄经）
- 天干地支计算
- 节假日判断

```javascript
// 农历数据结构
{
  year: 2026,
  month: 2,
  day: 15,
  isLeap: false,      // 是否闰月
  monthName: '二月',
  dayName: '十五',
  yearGanZhi: '丙午', // 干支年
  animal: '马',       // 生肖
  term: '惊蛰'        // 节气（当天有节气时）
}
```

### 3. 滑动切换实现

使用 `swiper` 组件实现无限滑动：

```
月视图：[上月, 当前月, 下月] 三页轮播
周视图：[上周, 当前周, 下周] 三页轮播
滑动到边界时动态更新页面内容
```

### 4. 组件文件结构

```
miniprogram/components/calendar/
├── calendar.js           # 组件逻辑
├── calendar.json         # 组件配置
├── calendar.wxml         # 组件模板
├── calendar.wxss         # 组件样式
├── lunar.js              # 农历计算工具
└── brazil-holidays.js    # 巴西节假日数据
```

### 5. 核心数据结构

```javascript
// 月视图数据
{
  year: 2026,
  month: 3,
  days: [
    {
      date: 1,              // 日期数字
      weekday: 6,           // 星期几 (0-6，0=周日)
      isCurrentMonth: true, // 是否当月
      isToday: false,       // 是否今天
      isWeekend: true,      // 是否周末
      lunar: { ... },       // 农历信息
      holiday: null,        // 巴西节假日信息
      marking: null,        // 标注信息
      inRange: false,       // 是否在选中区间内
      isRangeStart: false,  // 是否区间起点
      isRangeEnd: false     // 是否区间终点
    }
    // ...
  ]
}

// 巴西节假日数据
{
  date: '2026-03-04',       // 日期 YYYY-MM-DD
  name: 'Carnaval',         // 节假日名称（葡萄牙语）
  nameCN: '狂欢节',         // 中文名称
  type: 'national'          // national(联邦) | state(州) | municipal(市)
}

// 日程数据
{
  date: '2026-03-21',
  items: [
    { id: 1, title: '团队会议', time: '10:00', type: 'meeting' },
    { id: 2, title: '项目评审', time: '14:00', type: 'review' }
  ]
}
```

### 6. 性能优化

- 使用虚拟列表处理年视图的月份渲染
- 农历数据按需计算，缓存结果
- swiper 预加载相邻页面数据
- 节流处理滑动事件

### 7. 样式设计

遵循项目 UI 规范：

- 渐变色头部
- 圆角卡片设计
- 日期格子使用 flex 布局
- 动画过渡平滑自然

## 设计风格

采用现代简洁的日历设计风格，与小程序整体设计语言保持一致。

## 页面布局

### 月视图布局

```
┌─────────────────────────────────┐
│  ◀  2026年3月  ▶         [周][年] │  ← 标题栏 + 模式切换
├─────────────────────────────────┤
│  日  一  二  三  四  五  六      │  ← 星期标题（周日起始）
├─────────────────────────────────┤
│  1   2   3   4   5   6   7      │
│ 初三 初四 初五 初六 初七 初八 初九 │  ← 日期 + 农历
│     狂欢节                       │  ← 巴西节假日（如有）
│  8   9  10  11  12  13  14      │
│ 初十 十一 十二 十三 休 休 十四   │  ← 标注（休/班）
│ ...                             │
└─────────────────────────────────┘
```

### 日期格子结构

```
┌─────────────┐
│  4     休   │  ← 日期数字 + 右上角调休标注（小字）
│   初六      │  ← 农历/节气
│  狂欢节     │  ← 巴西节假日（橙色）
└─────────────┘
```

**布局说明**：

- **日期行**：左侧日期数字（红=周末，蓝=今天或选中），右侧调休标注（小字，红/绿）
- **农历行**：农历日期或节气名称
- **节假日行**：巴西节假日名称（如有）

**选中状态**：

- 单个选中日期：日期数字使用 **#2563EB（深蓝）** 高亮
- 区间选择：区间内日期背景色 #EFF6FF，边界日期深蓝高亮

### 周视图布局

```
┌─────────────────────────────────┐
│  ◀  3月15日 - 3月21日  ▶        │
├─────────────────────────────────┤
│  日   一   二   三   四   五   六 │  ← 周日起始
│  15   16   17   18   19   20   21 │
│ 廿六  廿七 廿八 廿九 三月初一 初二│
├─────────────────────────────────┤
│  今日日程                        │
│  ┌─────────────────────────┐   │
│  │ 10:00 团队会议           │   │
│  │ 14:00 项目评审           │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

### 年视图布局

```
┌─────────────────────────────────┐
│  ◀  2026年  ▶                   │
├─────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ 1月 │ │ 2月 │ │ 3月 │       │
│  │     │ │     │ │  ●  │ ←今天  │
│  └─────┘ └─────┘ └─────┘       │
│  ┌─────┐ ┌─────┐ ┌─────┐       │
│  │ 4月 │ │ 5月 │ │ 6月 │       │
│  └─────┘ └─────┘ └─────┘       │
│  ...                            │
└─────────────────────────────────┘
```

### 区间选择效果

选中区间内的日期使用浅蓝色背景，起点和终点使用深蓝色背景并显示选中效果。

## 颜色系统

- **工作日**：#1E293B（深灰）
- **周末**：#EF4444（红色）
- **今天**：#2563EB（主色蓝）
- **巴西节假日**：#F59E0B（橙色）
- **标注-休**：#EF4444（红色）
- **标注-班**：#16A34A（绿色）
- **选中区间**：#EFF6FF（浅蓝背景）
- **区间边界**：#2563EB（深蓝）

## 巴西节假日列表

| 日期 | 葡萄牙语名称 | 中文名称 |
| --- | --- | --- |
| 01/01 | Confraternização Universal | 元旦 |
| 02/03 | Carnaval | 狂欢节（每年不同，以复活节推算） |
| 04/18 | Sexta-feira Santa | 受难日（每年不同） |
| 04/21 | Tiradentes | 蒂拉登特斯日 |
| 05/01 | Dia do Trabalho | 劳动节 |
| 09/07 | Independência do Brasil | 独立日 |
| 10/12 | Nossa Senhora Aparecida | 阿帕雷西达圣母日 |
| 11/02 | Finados | 亡灵节 |
| 11/15 | Proclamação da República | 共和国宣言日 |
| 12/25 | Natal | 圣诞节 |


> 注：狂欢节、受难日等日期需根据复活节动态计算。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 搜索项目中已有的日期处理相关代码，确保与现有工具函数保持一致
- Expected outcome: 确认 utils.js 中的日期处理函数，避免重复实现

### MCP

- **readNoSqlDatabaseStructure**
- Purpose: 查询数据库中是否已有节假日相关集合
- Expected outcome: 确认是否需要新建 holiday_markings 集合