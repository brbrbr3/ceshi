/**
 * 日历组件
 * 支持月/周/年视图切换、农历节气显示、巴西节假日、日期标注、区间选择
 */

const lunar = require('./lunar.js')
const brazilHolidays = require('./brazil-holidays.js')

// 视图模式常量
const VIEW_MODE = {
  MONTH: 'month',
  WEEK: 'week',
  YEAR: 'year'
}

// 颜色常量
const COLORS = {
  WEEKEND: '#EF4444',
  WORKDAY: '#1E293B',
  TODAY: '#2563EB',
  SELECTED: '#2563EB',
  HOLIDAY: '#F59E0B',
  REST_MARK: '#EF4444',
  WORK_MARK: '#16A34A',
  RANGE_BG: '#EFF6FF'
}

// 星期标题（周日起始）
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六']

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    // 视图模式：month | week | year
    mode: {
      type: String,
      value: VIEW_MODE.MONTH
    },
    // 选中的日期时间戳
    selectedDate: {
      type: Number,
      value: 0
    },
    // 区间选择-开始日期
    rangeStart: {
      type: Number,
      value: 0
    },
    // 区间选择-结束日期
    rangeEnd: {
      type: Number,
      value: 0
    },
    // 日期标注数据 [{date: 'YYYY-MM-DD', type: 'rest'|'work', label: '休'|'班'}]
    markings: {
      type: Array,
      value: []
    },
    // 日程数据（周视图使用）[{date: 'YYYY-MM-DD', items: [...]}]
    schedules: {
      type: Array,
      value: []
    },
    // 是否显示农历
    showLunar: {
      type: Boolean,
      value: true
    },
    // 是否显示巴西节假日
    showBrazilHolidays: {
      type: Boolean,
      value: true
    },
    // 最小可选日期
    minDate: {
      type: Number,
      value: 0
    },
    // 最大可选日期
    maxDate: {
      type: Number,
      value: 0
    },
    // 是否启用区间选择
    enableRange: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 常量
    COLORS,
    WEEKDAY_NAMES,
    VIEW_MODE,
    
    // 当前显示的年月
    currentYear: 2026,
    currentMonth: 1,
    
    // 月视图数据
    monthDays: [],
    
    // 周视图数据
    weekDays: [],
    weekStartIndex: 0, // 周在月中的起始位置
    
    // 年视图数据
    yearMonths: [],
    
    // 今天的时间戳（午夜）
    todayTimestamp: 0,
    
    // swiper 当前索引
    swiperIndex: 1, // 中间页
    
    // 三页月数据（上月、当月、下月）
    swiperMonths: [{}, {}, {}],
    
    // 三页周数据
    swiperWeeks: [{}, {}, {}],
    
    // 当前选中日期的日程
    currentSchedules: [],
    
    // 滑动动画中
    isAnimating: false,
    
    // 年视图月份数据
    yearMonths: []
  },

  lifetimes: {
    attached() {
      this.initialize()
    }
  },

  observers: {
    'mode': function(mode) {
      this.handleModeChange(mode)
    },
    'selectedDate': function(timestamp) {
      if (timestamp) {
        this.handleSelectedDateChange(timestamp)
      }
    },
    'markings': function() {
      this.refreshCurrentView()
    },
    'schedules': function() {
      this.updateCurrentSchedules()
    }
  },

  methods: {
    /**
     * 初始化组件
     */
    initialize() {
      const now = new Date()
      const todayTimestamp = this.getStartOfDay(now).getTime()
      
      // 如果没有传入选中日期，默认选中今天
      let selectedTimestamp = this.properties.selectedDate || todayTimestamp
      
      const selectedDate = new Date(selectedTimestamp)
      const currentYear = selectedDate.getFullYear()
      const currentMonth = selectedDate.getMonth() + 1
      
      this.setData({
        todayTimestamp,
        currentYear,
        currentMonth,
        selectedDate: selectedTimestamp
      })
      
      this.initView()
    },

    /**
     * 初始化视图
     */
    initView() {
      const { mode } = this.properties
      
      switch (mode) {
        case VIEW_MODE.MONTH:
          this.initMonthView()
          break
        case VIEW_MODE.WEEK:
          this.initWeekView()
          break
        case VIEW_MODE.YEAR:
          this.initYearView()
          break
        default:
          this.initMonthView()
      }
    },

    /**
     * 处理模式变化
     */
    handleModeChange(mode) {
      this.initView()
    },

    /**
     * 处理选中日期变化
     */
    handleSelectedDateChange(timestamp) {
      const date = new Date(timestamp)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      
      if (year !== this.data.currentYear || month !== this.data.currentMonth) {
        this.setData({ currentYear: year, currentMonth: month })
        this.initView()
      }
    },

    /**
     * 刷新当前视图
     */
    refreshCurrentView() {
      this.initView()
    },

    // ==================== 月视图相关 ====================

    /**
     * 初始化月视图
     */
    initMonthView() {
      const { currentYear, currentMonth } = this.data
      
      // 生成三页数据
      const prevMonth = this.getPrevMonth(currentYear, currentMonth)
      const nextMonth = this.getNextMonth(currentYear, currentMonth)
      
      this.setData({
        swiperMonths: [
          this.generateMonthData(prevMonth.year, prevMonth.month),
          this.generateMonthData(currentYear, currentMonth),
          this.generateMonthData(nextMonth.year, nextMonth.month)
        ],
        swiperIndex: 1
      })
    },

    /**
     * 生成月份数据
     */
    generateMonthData(year, month) {
      const days = []
      const firstDay = new Date(year, month - 1, 1)
      const lastDay = new Date(year, month, 0)
      const daysInMonth = lastDay.getDate()
      
      // 获取当月第一天是星期几（0=周日）
      const firstWeekday = firstDay.getDay()
      
      // 上月填充
      const prevMonth = this.getPrevMonth(year, month)
      const prevMonthDays = new Date(prevMonth.year, prevMonth.month, 0).getDate()
      
      for (let i = firstWeekday - 1; i >= 0; i--) {
        const day = prevMonthDays - i
        const dateInfo = this.createDayInfo(prevMonth.year, prevMonth.month, day, false)
        days.push(dateInfo)
      }
      
      // 当月日期
      for (let day = 1; day <= daysInMonth; day++) {
        const dateInfo = this.createDayInfo(year, month, day, true)
        days.push(dateInfo)
      }
      
      // 下月填充
      const nextMonth = this.getNextMonth(year, month)
      const remainingDays = 42 - days.length // 6行 * 7天 = 42
      
      for (let day = 1; day <= remainingDays; day++) {
        const dateInfo = this.createDayInfo(nextMonth.year, nextMonth.month, day, false)
        days.push(dateInfo)
      }
      
      return {
        year,
        month,
        days,
        title: `${year}年${month}月`
      }
    },

    /**
     * 创建日期信息对象
     */
    createDayInfo(year, month, day, isCurrentMonth) {
      const timestamp = new Date(year, month - 1, day).getTime()
      const date = new Date(year, month - 1, day)
      const weekday = date.getDay()
      
      // 农历信息
      const lunarInfo = lunar.getCachedLunar(year, month, day)
      const solarTerm = lunar.getCachedSolarTerm(year, month, day)
      
      // 巴西节假日
      const holiday = this.properties.showBrazilHolidays 
        ? brazilHolidays.getHoliday(year, month, day) 
        : null
      
      // 标注信息
      const dateKey = this.formatDateKey(year, month, day)
      const marking = this.properties.markings.find(m => m.date === dateKey)
      
      // 今天、周末
      const isToday = timestamp === this.data.todayTimestamp
      const isWeekend = weekday === 0 || weekday === 6
      
      // 选中状态
      const selectedTimestamp = this.data.selectedDate || this.data.todayTimestamp
      const isSelected = this.properties.selectedDate 
        ? this.isSameDay(timestamp, this.properties.selectedDate)
        : isToday
      
      // 区间选择状态
      const { rangeStart, rangeEnd, enableRange } = this.properties
      let inRange = false
      let isRangeStart = false
      let isRangeEnd = false
      
      if (enableRange && rangeStart && rangeEnd) {
        inRange = timestamp > rangeStart && timestamp < rangeEnd
        isRangeStart = this.isSameDay(timestamp, rangeStart)
        isRangeEnd = this.isSameDay(timestamp, rangeEnd)
      }
      
      return {
        year,
        month,
        day,
        timestamp,
        weekday,
        isCurrentMonth,
        isToday,
        isWeekend,
        isSelected,
        lunar: lunarInfo,
        solarTerm,
        holiday,
        marking,
        displayText: solarTerm || lunarInfo.displayText,
        holidayText: holiday ? holiday.nameCN : '',
        inRange,
        isRangeStart,
        isRangeEnd
      }
    },

    /**
     * 月视图滑动变化
     */
    handleMonthSwiperChange(e) {
      // 如果是点击导航按钮触发的
      if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.direction) {
        const direction = e.currentTarget.dataset.direction
        this.updateMonthSwiper(direction)
        return
      }
      
      // 滑动触发
      const { current } = e.detail
      const { swiperIndex } = this.data
      
      if (current === swiperIndex) return
      
      const direction = current > swiperIndex ? 'next' : 'prev'
      this.updateMonthSwiper(direction)
    },

    /**
     * 更新月视图滑动
     */
    updateMonthSwiper(direction) {
      let { currentYear, currentMonth, swiperMonths } = this.data
      
      if (direction === 'next') {
        const next = this.getNextMonth(currentYear, currentMonth)
        currentYear = next.year
        currentMonth = next.month
        
        swiperMonths = [
          swiperMonths[1],
          swiperMonths[2],
          this.generateMonthData(
            ...Object.values(this.getNextMonth(currentYear, currentMonth))
          )
        ]
      } else {
        const prev = this.getPrevMonth(currentYear, currentMonth)
        currentYear = prev.year
        currentMonth = prev.month
        
        swiperMonths = [
          this.generateMonthData(
            ...Object.values(this.getPrevMonth(currentYear, currentMonth))
          ),
          swiperMonths[0],
          swiperMonths[1]
        ]
      }
      
      this.setData({
        currentYear,
        currentMonth,
        swiperMonths,
        swiperIndex: 1
      })
      
      this.triggerEvent('monthChange', { year: currentYear, month: currentMonth })
    },

    /**
     * 点击日期
     */
    handleDayTap(e) {
      const { day } = e.currentTarget.dataset
      if (!day || !day.isCurrentMonth) return
      
      const { enableRange, rangeStart, rangeEnd } = this.properties
      
      if (enableRange) {
        this.handleRangeSelect(day.timestamp)
      } else {
        this.selectDate(day.timestamp)
      }
    },

    /**
     * 选择日期
     */
    selectDate(timestamp) {
      this.setData({ selectedDate: timestamp })
      
      const dateInfo = lunar.getDateInfoCached(timestamp)
      const holiday = this.properties.showBrazilHolidays
        ? brazilHolidays.getHoliday(dateInfo.year, dateInfo.month, dateInfo.day)
        : null
      
      this.triggerEvent('dateSelect', {
        date: timestamp,
        lunar: dateInfo,
        holiday
      })
      
      // 更新日程
      this.updateCurrentSchedules()
    },

    /**
     * 处理区间选择
     */
    handleRangeSelect(timestamp) {
      const { rangeStart, rangeEnd } = this.properties
      
      if (!rangeStart || (rangeStart && rangeEnd)) {
        // 开始新的选择
        this.triggerEvent('rangeSelect', { start: timestamp, end: null })
      } else {
        // 完成选择
        const start = Math.min(rangeStart, timestamp)
        const end = Math.max(rangeStart, timestamp)
        this.triggerEvent('rangeSelect', { start, end })
      }
    },

    // ==================== 周视图相关 ====================

    /**
     * 初始化周视图
     */
    initWeekView() {
      const selectedTimestamp = this.data.selectedDate || this.data.todayTimestamp
      this.generateWeekData(selectedTimestamp)
    },

    /**
     * 生成周数据
     */
    generateWeekData(centerTimestamp) {
      const centerDate = new Date(centerTimestamp)
      const weekday = centerDate.getDay() // 0=周日
      
      // 计算周的起始日期（周日）
      const weekStart = new Date(centerDate)
      weekStart.setDate(centerDate.getDate() - weekday)
      
      const weekDays = []
      const swiperWeeks = []
      
      for (let i = -1; i <= 1; i++) {
        const weekStartCopy = new Date(weekStart)
        weekStartCopy.setDate(weekStart.getDate() + (i * 7))
        
        const weekData = this.createWeekData(weekStartCopy)
        swiperWeeks.push(weekData)
        
        if (i === 0) {
          weekDays.push(...weekData.days)
        }
      }
      
      this.setData({
        swiperWeeks,
        swiperIndex: 1,
        weekDays: swiperWeeks[1].days
      })
      
      this.updateCurrentSchedules()
    },

    /**
     * 创建单周数据
     */
    createWeekData(startDate) {
      const days = []
      const endDate = new Date(startDate)
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(startDate)
        date.setDate(startDate.getDate() + i)
        
        const dayInfo = this.createDayInfo(
          date.getFullYear(),
          date.getMonth() + 1,
          date.getDate(),
          true
        )
        days.push(dayInfo)
      }
      
      const endDateObj = new Date(startDate)
      endDateObj.setDate(startDate.getDate() + 6)
      
      return {
        startDate: startDate.getTime(),
        endDate: endDateObj.getTime(),
        days,
        title: this.formatWeekTitle(startDate, endDateObj)
      }
    },

    /**
     * 格式化周标题
     */
    formatWeekTitle(start, end) {
      const startMonth = start.getMonth() + 1
      const startDay = start.getDate()
      const endMonth = end.getMonth() + 1
      const endDay = end.getDate()
      
      if (startMonth === endMonth) {
        return `${startMonth}月${startDay}日 - ${endDay}日`
      }
      return `${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`
    },

    /**
     * 周视图滑动变化
     */
    handleWeekSwiperChange(e) {
      const { current } = e.detail
      const { swiperIndex } = this.data
      
      if (current === swiperIndex) return
      
      const direction = current > swiperIndex ? 'next' : 'prev'
      this.updateWeekSwiper(direction)
    },

    /**
     * 更新周视图滑动
     */
    updateWeekSwiper(direction) {
      const { swiperWeeks } = this.data
      
      let newWeeks
      if (direction === 'next') {
        const lastStart = swiperWeeks[2].endDate
        const newStart = new Date(lastStart)
        newStart.setDate(newStart.getDate() + 1)
        
        newWeeks = [
          swiperWeeks[1],
          swiperWeeks[2],
          this.createWeekData(newStart)
        ]
      } else {
        const firstStart = swiperWeeks[0].startDate
        const newStart = new Date(firstStart)
        newStart.setDate(newStart.getDate() - 7)
        
        newWeeks = [
          this.createWeekData(newStart),
          swiperWeeks[0],
          swiperWeeks[1]
        ]
      }
      
      this.setData({
        swiperWeeks: newWeeks,
        swiperIndex: 1,
        weekDays: newWeeks[1].days
      })
    },

    /**
     * 更新当前日程
     */
    updateCurrentSchedules() {
      const selectedTimestamp = this.data.selectedDate || this.data.todayTimestamp
      const dateKey = this.formatDateKeyFromTimestamp(selectedTimestamp)
      
      const scheduleData = this.properties.schedules.find(s => s.date === dateKey)
      
      this.setData({
        currentSchedules: scheduleData ? scheduleData.items : []
      })
    },

    // ==================== 年视图相关 ====================

    /**
     * 初始化年视图
     */
    initYearView() {
      const { currentYear } = this.data
      this.generateYearData(currentYear)
    },

    /**
     * 生成年数据
     */
    generateYearData(year) {
      const yearMonths = []
      
      for (let month = 1; month <= 12; month++) {
        const monthData = this.generateMonthData(year, month)
        yearMonths.push({
          month,
          days: monthData.days,
          title: `${month}月`
        })
      }
      
      this.setData({ yearMonths })
    },

    /**
     * 年视图滑动切换年份
     */
    handleYearSwiperChange(e) {
      const { current } = e.detail
      const { swiperIndex, currentYear } = this.data
      
      if (current === swiperIndex) return
      
      const newYear = current > swiperIndex ? currentYear + 1 : currentYear - 1
      this.setData({ currentYear: newYear })
      this.generateYearData(newYear)
    },

    // ==================== 视图切换 ====================

    /**
     * 切换到月视图
     */
    switchToMonth() {
      this.setData({ mode: VIEW_MODE.MONTH })
      this.triggerEvent('modeChange', { mode: VIEW_MODE.MONTH })
    },

    /**
     * 切换到周视图
     */
    switchToWeek() {
      this.setData({ mode: VIEW_MODE.WEEK })
      this.triggerEvent('modeChange', { mode: VIEW_MODE.WEEK })
    },

    /**
     * 切换到年视图
     */
    switchToYear() {
      this.setData({ mode: VIEW_MODE.YEAR })
      this.triggerEvent('modeChange', { mode: VIEW_MODE.YEAR })
    },

    /**
     * 点击模式切换按钮
     */
    handleModeTap(e) {
      const { mode } = e.currentTarget.dataset
      this.setData({ mode })
      this.triggerEvent('modeChange', { mode })
    },

    /**
     * 点击标题（快速跳转）
     */
    handleTitleTap() {
      // TODO: 实现快速跳转选择器
    },

    /**
     * 点击今天按钮
     */
    handleTodayTap() {
      const todayTimestamp = this.data.todayTimestamp
      const today = new Date(todayTimestamp)
      
      this.setData({
        selectedDate: todayTimestamp,
        currentYear: today.getFullYear(),
        currentMonth: today.getMonth() + 1
      })
      
      this.initView()
      this.selectDate(todayTimestamp)
    },

    // ==================== 工具方法 ====================

    /**
     * 获取上个月
     */
    getPrevMonth(year, month) {
      if (month === 1) {
        return { year: year - 1, month: 12 }
      }
      return { year, month: month - 1 }
    },

    /**
     * 获取下个月
     */
    getNextMonth(year, month) {
      if (month === 12) {
        return { year: year + 1, month: 1 }
      }
      return { year, month: month + 1 }
    },

    /**
     * 获取一天的开始时间
     */
    getStartOfDay(date) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    },

    /**
     * 判断是否同一天
     */
    isSameDay(timestamp1, timestamp2) {
      const d1 = new Date(timestamp1)
      const d2 = new Date(timestamp2)
      return d1.getFullYear() === d2.getFullYear() &&
             d1.getMonth() === d2.getMonth() &&
             d1.getDate() === d2.getDate()
    },

    /**
     * 格式化日期键
     */
    formatDateKey(year, month, day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    },

    /**
     * 从时间戳格式化日期键
     */
    formatDateKeyFromTimestamp(timestamp) {
      const date = new Date(timestamp)
      return this.formatDateKey(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate()
      )
    }
  }
})
