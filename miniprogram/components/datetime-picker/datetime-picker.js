/**
 * 自定义日期时间选择器组件
 * 功能：支持年、月、日、星期、时、分、秒的自定义显示
 * 特点：本地时间处理，漂亮动画效果，支持精确到秒的时间范围限制
 */
Component({
  properties: {
    // 当前选中的日期时间值
    value: {
      type: String,
      value: '',
      observer: 'onValueChange'
    },
    // 显示字段配置，数组形式，如：['year', 'month', 'day', 'weekday', 'hour', 'minute', 'second']
    fields: {
      type: Array,
      value: ['year', 'month', 'day', 'weekday'],
      observer: 'onFieldsChange'
    },
    // 最小日期 YYYY-MM-DD
    startDate: {
      type: String,
      value: '1900-01-01',
      observer: 'onDateRangeChange'
    },
    // 最大日期 YYYY-MM-DD
    endDate: {
      type: String,
      value: '2100-12-31',
      observer: 'onDateRangeChange'
    },
    // 最小日期时间 YYYY-MM-DD HH:mm:ss（精确时间范围，优先于 startDate）
    startDatetime: {
      type: String,
      value: '',
      observer: 'onDatetimeRangeChange'
    },
    // 最大日期时间 YYYY-MM-DD HH:mm:ss（精确时间范围，优先于 endDate）
    endDatetime: {
      type: String,
      value: '',
      observer: 'onDatetimeRangeChange'
    },
    // 占位符文本
    placeholder: {
      type: String,
      value: '请选择日期时间'
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 触发器样式类型：default / card / border
    type: {
      type: String,
      value: 'default'
    }
  },

  data: {
    visible: false,
    displayText: '',
    // picker数据
    years: [],
    months: [],
    days: [],
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    hours: [],
    minutes: [],
    seconds: [],
    // 当前选中索引
    pickerValue: [],
    // 字段显示状态（用于 wxml 条件渲染）
    // 注意：weekday 不作为单独列，而是显示在日期列旁边
    showYear: true,
    showMonth: true,
    showDay: true,
    showWeekday: false,  // 是否在日期列旁显示星期（不是单独列）
    showHour: false,
    showMinute: false,
    showSecond: false,
    // 当前选中日期对应的星期文本（用于日期列显示）
    currentWeekdayText: '',
    // 日期列在 pickerValue 中的索引（用于 wxml 判断当前选中项）
    dayColumnIndex: 0,
    // 带星期的日期显示列表
    daysWithWeekday: [],
    // 内部状态
    selectedYear: 0,
    selectedMonth: 0,
    selectedDay: 0,
    selectedWeekday: 0,
    selectedHour: 0,
    selectedMinute: 0,
    selectedSecond: 0,
    // 动画相关
    animationData: null,
    maskAnimation: null,
    // 字段配置映射（weekday 不再作为单独字段）
    fieldMap: {
      year: { key: 'year', label: '年' },
      month: { key: 'month', label: '月' },
      day: { key: 'day', label: '日' },
      hour: { key: 'hour', label: '时' },
      minute: { key: 'minute', label: '分' },
      second: { key: 'second', label: '秒' }
    },
    // 隐式年份（当 fields 不含 year 时使用当前年份）
    implicitYear: new Date().getFullYear(),
    // 解析后的时间范围（用于精确限制）
    parsedStartDatetime: null,
    parsedEndDatetime: null
  },

  lifetimes: {
    attached() {
      this.initPickerData()
    }
  },

  methods: {
    /**
     * 日期范围变化回调
     * 当父页面动态设置 startDate 或 endDate 时触发
     */
    onDateRangeChange() {
      // 重新初始化数据
      this.initPickerData()
    },

    /**
     * 精确时间范围变化回调
     * 当父页面动态设置 startDatetime 或 endDatetime 时触发
     */
    onDatetimeRangeChange() {
      this.parseDatetimeRange()
      this.initPickerData()
    },

    /**
     * 解析精确时间范围
     */
    parseDatetimeRange() {
      const { startDatetime, endDatetime } = this.data
      
      let parsedStart = null
      let parsedEnd = null
      
      if (startDatetime) {
        parsedStart = this.parseDateTime(startDatetime)
      }
      
      if (endDatetime) {
        parsedEnd = this.parseDateTime(endDatetime)
      }
      
      this.setData({
        parsedStartDatetime: parsedStart,
        parsedEndDatetime: parsedEnd
      })
    },

    /**
     * 获取有效的时间范围
     * 优先使用 startDatetime/endDatetime，否则回退到 startDate/endDate
     */
    getEffectiveRange() {
      const { startDate, endDate, startDatetime, endDatetime, parsedStartDatetime, parsedEndDatetime } = this.data
      
      let minDate, maxDate
      let minTime = null, maxTime = null
      
      if (startDatetime && parsedStartDatetime) {
        minDate = `${parsedStartDatetime.year}-${String(parsedStartDatetime.month).padStart(2, '0')}-${String(parsedStartDatetime.day).padStart(2, '0')}`
        minTime = {
          year: parsedStartDatetime.year,
          month: parsedStartDatetime.month,
          day: parsedStartDatetime.day,
          hour: parsedStartDatetime.hour,
          minute: parsedStartDatetime.minute,
          second: parsedStartDatetime.second
        }
      } else {
        minDate = startDate
      }
      
      if (endDatetime && parsedEndDatetime) {
        maxDate = `${parsedEndDatetime.year}-${String(parsedEndDatetime.month).padStart(2, '0')}-${String(parsedEndDatetime.day).padStart(2, '0')}`
        maxTime = {
          year: parsedEndDatetime.year,
          month: parsedEndDatetime.month,
          day: parsedEndDatetime.day,
          hour: parsedEndDatetime.hour,
          minute: parsedEndDatetime.minute,
          second: parsedEndDatetime.second
        }
      } else {
        maxDate = endDate
      }
      
      return { minDate, maxDate, minTime, maxTime }
    },

    /**
     * 初始化picker数据
     */
    initPickerData() {
      const { fields } = this.data
      const { minDate, maxDate } = this.getEffectiveRange()
      
      // 生成年份列表
      const startYear = parseInt(minDate.split('-')[0], 10)
      const endYear = parseInt(maxDate.split('-')[0], 10)
      const years = []
      for (let y = startYear; y <= endYear; y++) {
        years.push(y)
      }
      
      // 是否在日期列旁显示星期
      const showWeekday = fields.includes('weekday')
      
      // 计算日期列在 pickerValue 中的索引
      let dayColumnIndex = 0
      if (fields.includes('year')) dayColumnIndex++
      if (fields.includes('month')) dayColumnIndex++
      // dayColumnIndex 现在指向日期列的索引
      
      // 当不含年份时，使用当前年份作为隐式年份
      const implicitYear = fields.includes('year') ? null : new Date().getFullYear()
      
      // 设置字段显示状态
      this.setData({ 
        years,
        implicitYear,
        // 设置字段显示状态
        showYear: fields.includes('year'),
        showMonth: fields.includes('month'),
        showDay: fields.includes('day'),
        showWeekday: showWeekday,  // 是否显示星期（在日期列旁边）
        showHour: fields.includes('hour'),
        showMinute: fields.includes('minute'),
        showSecond: fields.includes('second'),
        dayColumnIndex
      })
      
      // 根据日期范围初始化月份和日期
      // 使用 minDate 的年月日作为基准
      const baseYear = startYear
      const baseMonth = parseInt(minDate.split('-')[1], 10)
      const baseDay = parseInt(minDate.split('-')[2], 10)
      
      const months = this.getAvailableMonths(baseYear)
      const days = this.getAvailableDays(baseYear, baseMonth)
      const hours = this.getAvailableHours(baseYear, baseMonth, baseDay)
      const minutes = this.getAvailableMinutes(baseYear, baseMonth, baseDay, 0)
      const seconds = this.getAvailableSeconds(baseYear, baseMonth, baseDay, 0, 0)
      
      this.setData({ 
        months, days, hours, minutes, seconds
      })
      
      // 设置初始值（空值时显示 placeholder，不设置默认日期）
      if (this.data.value) {
        this.onValueChange(this.data.value)
      }
    },

    /**
     * 设置当前日期时间为默认值
     */
    setCurrentDateTime() {
      const now = new Date()
      this.setSelectedDateTime(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        now.getDay(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      )
    },

    /**
     * 设置选中的日期时间
     */
    setSelectedDateTime(year, month, day, weekday, hour, minute, second) {
      const { fields, years } = this.data
      
      // 计算各列索引
      const pickerValue = []
      const fieldConfigs = this.getFieldConfigs()
      
      // 获取可用的小时、分钟、秒列表
      const months = this.getAvailableMonths(year)
      const days = this.getAvailableDays(year, month)
      const hours = this.getAvailableHours(year, month, day)
      const minutes = this.getAvailableMinutes(year, month, day, hour)
      const seconds = this.getAvailableSeconds(year, month, day, hour, minute)
      
      fieldConfigs.forEach(config => {
        switch (config.key) {
          case 'year':
            const yearIdx = years.indexOf(year)
            pickerValue.push(yearIdx >= 0 ? yearIdx : 0)
            break
          case 'month':
            const monthIdx = months.indexOf(month)
            pickerValue.push(monthIdx >= 0 ? monthIdx : 0)
            break
          case 'day':
            const dayIdx = days.findIndex(d => d.day === day)
            pickerValue.push(dayIdx >= 0 ? dayIdx : 0)
            break
          case 'weekday':
            pickerValue.push(weekday || 0)
            break
          case 'hour':
            const hourIdx = hours.indexOf(hour)
            pickerValue.push(hourIdx >= 0 ? hourIdx : 0)
            break
          case 'minute':
            const minuteIdx = minutes.indexOf(minute)
            pickerValue.push(minuteIdx >= 0 ? minuteIdx : 0)
            break
          case 'second':
            const secondIdx = seconds.indexOf(second)
            pickerValue.push(secondIdx >= 0 ? secondIdx : 0)
            break
        }
      })
      
      // 计算当前选中日期的星期文本
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const currentWeekdayText = weekdays[weekday] || ''
      
      this.setData({
        pickerValue,
        months,
        days,
        hours,
        minutes,
        seconds,
        currentWeekdayText,
        selectedYear: year,
        selectedMonth: month,
        selectedDay: day,
        selectedWeekday: weekday,
        selectedHour: hour,
        selectedMinute: minute,
        selectedSecond: second
      })
      
      this.updateDisplayText()
    },

    /**
     * 获取可用月份列表
     */
    getAvailableMonths(year) {
      const { years } = this.data
      const { minDate, maxDate } = this.getEffectiveRange()
      
      const startY = parseInt(minDate.split('-')[0], 10)
      const startM = parseInt(minDate.split('-')[1], 10)
      const endY = parseInt(maxDate.split('-')[0], 10)
      const endM = parseInt(maxDate.split('-')[1], 10)
      
      let startMonth = 1
      let endMonth = 12
      
      // 只有在年列表中的年份才应用月份限制
      if (years && years.includes(year)) {
        if (year === startY) startMonth = startM
        if (year === endY) endMonth = endM
        // 如果是同一年，确保 endMonth >= startMonth
        if (year === startY && year === endY && endMonth < startMonth) {
          endMonth = startMonth
        }
      }
      
      const months = []
      for (let m = startMonth; m <= endMonth; m++) {
        months.push(m)
      }
      return months
    },

    /**
     * 获取可用日期列表
     */
    getAvailableDays(year, month) {
      const { implicitYear, showYear, years } = this.data
      const { minDate, maxDate } = this.getEffectiveRange()
      
      // 当不含年份时，使用隐式年份（当前年份）
      const actualYear = showYear ? year : (implicitYear || new Date().getFullYear())
      
      const startY = parseInt(minDate.split('-')[0], 10)
      const startM = parseInt(minDate.split('-')[1], 10)
      const startD = parseInt(minDate.split('-')[2], 10)
      const endY = parseInt(maxDate.split('-')[0], 10)
      const endM = parseInt(maxDate.split('-')[1], 10)
      const endD = parseInt(maxDate.split('-')[2], 10)
      
      // 获取该月的天数
      const daysInMonth = new Date(actualYear, month, 0).getDate()
      let startDay = 1
      let endDay = daysInMonth
      
      // 应用日期范围限制（无论是否显示年份，只要年份在范围内就应用限制）
      if (years && years.includes(actualYear)) {
        // 检查是否是开始日期所在月份
        if (actualYear === startY && month === startM) {
          startDay = Math.max(startDay, startD)
        }
        // 检查是否是结束日期所在月份
        if (actualYear === endY && month === endM) {
          endDay = Math.min(endDay, endD)
        }
      }
      
      // 确保 startDay <= endDay
      if (startDay > endDay) {
        startDay = endDay
      }
      
      const days = []
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      for (let d = startDay; d <= endDay; d++) {
        // 计算每个日期对应的星期
        const weekday = new Date(actualYear, month - 1, d).getDay()
        days.push({
          day: d,
          weekday: weekdays[weekday]
        })
      }
      return days
    },

    /**
     * 判断是否是同一天
     */
    isSameDay(year, month, day, timeObj) {
      if (!timeObj) return false
      return year === timeObj.year && month === timeObj.month && day === timeObj.day
    },

    /**
     * 获取可用小时列表
     */
    getAvailableHours(year, month, day) {
      const { minTime, maxTime } = this.getEffectiveRange()
      
      let startHour = 0
      let endHour = 23
      
      // 如果是开始时间的当天，限制最小小时
      if (minTime && this.isSameDay(year, month, day, minTime)) {
        startHour = minTime.hour
      }
      
      // 如果是结束时间的当天，限制最大小时
      if (maxTime && this.isSameDay(year, month, day, maxTime)) {
        endHour = maxTime.hour
      }
      
      const hours = []
      for (let h = startHour; h <= endHour; h++) {
        hours.push(h)
      }
      return hours
    },

    /**
     * 获取可用分钟列表
     */
    getAvailableMinutes(year, month, day, hour) {
      const { minTime, maxTime } = this.getEffectiveRange()
      
      let startMinute = 0
      let endMinute = 59
      
      // 如果是开始时间的当天且小时相同，限制最小分钟
      if (minTime && this.isSameDay(year, month, day, minTime) && hour === minTime.hour) {
        startMinute = minTime.minute
      }
      
      // 如果是结束时间的当天且小时相同，限制最大分钟
      if (maxTime && this.isSameDay(year, month, day, maxTime) && hour === maxTime.hour) {
        endMinute = maxTime.minute
      }
      
      const minutes = []
      for (let m = startMinute; m <= endMinute; m++) {
        minutes.push(m)
      }
      return minutes
    },

    /**
     * 获取可用秒列表
     */
    getAvailableSeconds(year, month, day, hour, minute) {
      const { minTime, maxTime } = this.getEffectiveRange()
      
      let startSecond = 0
      let endSecond = 59
      
      // 如果是开始时间的当天且小时分钟相同，限制最小秒
      if (minTime && this.isSameDay(year, month, day, minTime) && hour === minTime.hour && minute === minTime.minute) {
        startSecond = minTime.second
      }
      
      // 如果是结束时间的当天且小时分钟相同，限制最大秒
      if (maxTime && this.isSameDay(year, month, day, maxTime) && hour === maxTime.hour && minute === maxTime.minute) {
        endSecond = maxTime.second
      }
      
      const seconds = []
      for (let s = startSecond; s <= endSecond; s++) {
        seconds.push(s)
      }
      return seconds
    },

    /**
     * 获取字段配置列表
     * 注意：weekday 不作为单独列，只是标记是否在日期列旁显示
     */
    getFieldConfigs() {
      const { fields, fieldMap } = this.data
      // 过滤掉 weekday，因为它不是单独的列
      return fields.filter(f => f !== 'weekday').map(f => fieldMap[f]).filter(Boolean)
    },

    /**
     * value属性变化回调
     */
    onValueChange(newVal) {
      if (!newVal) {
        // 空值时只清空显示文本，显示 placeholder
        this.setData({ displayText: '' })
        return
      }
      
      // 解析日期时间字符串
      // 支持格式：YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DDTHH:mm:ss
      const dateTime = this.parseDateTime(newVal)
      if (dateTime) {
        this.setSelectedDateTime(
          dateTime.year,
          dateTime.month,
          dateTime.day,
          dateTime.weekday,
          dateTime.hour,
          dateTime.minute,
          dateTime.second
        )
      }
    },

    /**
     * 解析日期时间字符串
     */
    parseDateTime(dateStr) {
      try {
        // 支持多种格式
        let date
        if (dateStr.includes('T')) {
          date = new Date(dateStr)
        } else if (dateStr.includes(' ')) {
          date = new Date(dateStr.replace(' ', 'T'))
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          // 纯日期格式 YYYY-MM-DD，手动解析避免时区问题
          // new Date('YYYY-MM-DD') 会被解析为 UTC 时间，导致 getDate() 返回本地时区偏移后的日期
          const [y, m, d] = dateStr.split('-').map(Number)
          return {
            year: y,
            month: m,
            day: d,
            weekday: new Date(y, m - 1, d).getDay(),
            hour: 0,
            minute: 0,
            second: 0
          }
        } else {
          date = new Date(dateStr)
        }
        
        if (isNaN(date.getTime())) return null
        
        return {
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          weekday: date.getDay(),
          hour: date.getHours(),
          minute: date.getMinutes(),
          second: date.getSeconds()
        }
      } catch (e) {
        return null
      }
    },

    /**
     * fields属性变化回调
     */
    onFieldsChange(newFields) {
      this.setData({
        showYear: newFields.includes('year'),
        showMonth: newFields.includes('month'),
        showDay: newFields.includes('day'),
        showWeekday: newFields.includes('weekday'),
        showHour: newFields.includes('hour'),
        showMinute: newFields.includes('minute'),
        showSecond: newFields.includes('second')
      })
      this.updateDisplayText()
    },

    /**
     * 更新显示文本
     */
    updateDisplayText() {
      // 如果 value 为空，不更新显示文本，保持 placeholder 显示
      if (!this.data.value) {
        return
      }
      
      const { fields, selectedYear, selectedMonth, selectedDay, selectedWeekday, 
              selectedHour, selectedMinute, selectedSecond, weekdays } = this.data
      
      const parts = []
      
      if (fields.includes('year')) parts.push(`${selectedYear}年`)
      if (fields.includes('month')) parts.push(`${selectedMonth}月`)  // 不补零
      if (fields.includes('day')) {
        let dayText = `${selectedDay}日`
        // 如果包含星期字段，在日期后显示星期
        if (fields.includes('weekday')) {
          dayText += ` ${weekdays[selectedWeekday]}`
        }
        parts.push(dayText)
      }
      
      const timeParts = []
      const timeLabels = []
      if (fields.includes('hour')) { timeParts.push(String(selectedHour).padStart(2, '0')); timeLabels.push('时') }
      if (fields.includes('minute')) { timeParts.push(String(selectedMinute).padStart(2, '0')); }
      if (fields.includes('second')) { timeParts.push(String(selectedSecond).padStart(2, '0')); }
      
      if (timeParts.length > 0) {
        // 拼接带单位的时间文本：如 "18时" 或 "18:30分" 或 "18:30:00秒"
        let timeText = ''
        for (let i = 0; i < timeParts.length; i++) {
          if (i === 0) {
            timeText += ' ' + timeParts[i] + timeLabels[i]
          } else {
            timeText += ':' + timeParts[i] + timeLabels[i]
          }
        }
        parts.push(timeText)
      }
      
      this.setData({ displayText: parts.join('') })
    },

    /**
     * 显示picker
     */
    showPicker() {
      if (this.data.disabled) return
      
      // 创建动画
      const animation = wx.createAnimation({
        duration: 300,
        timingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      })
      
      const maskAnimation = wx.createAnimation({
        duration: 300,
        timingFunction: 'ease'
      })
      
      this.setData({ 
        visible: true,
        animationData: animation.translateY(0).step().export(),
        maskAnimation: maskAnimation.opacity(1).step().export()
      })
      
      // 如果没有初始值，使用最小可选日期作为默认值
      if (!this.data.value) {
        const { minDate } = this.getEffectiveRange()
        if (minDate && minDate !== '1900-01-01') {
          // 有最小日期限制时，用最小日期初始化
          this.onValueChange(minDate)
        } else {
          this.setCurrentDateTime()
        }
      } else {
        // 重新计算当前选中值
        this.onValueChange(this.data.value)
      }
    },

    /**
     * 隐藏picker
     */
    hidePicker() {
      const animation = wx.createAnimation({
        duration: 250,
        timingFunction: 'cubic-bezier(0.25, 0.1, 0.25, 1)'
      })
      
      const maskAnimation = wx.createAnimation({
        duration: 250,
        timingFunction: 'ease'
      })
      
      this.setData({
        animationData: animation.translateY('100%').step().export(),
        maskAnimation: maskAnimation.opacity(0).step().export()
      })
      
      setTimeout(() => {
        this.setData({ visible: false })
      }, 250)
    },

    /**
     * 点击遮罩层关闭
     */
    onMaskTap() {
      this.hidePicker()
    },

    /**
     * 阻止事件冒泡
     */
    stopPropagation() {},

    /**
     * picker滚动变化
     */
    onPickerChange(e) {
      const val = e.detail.value
      const { fields, years } = this.data
      const fieldConfigs = this.getFieldConfigs()
      
      // 解析当前值
      const values = {}
      fieldConfigs.forEach((config, index) => {
        values[config.key] = val[index]
      })
      
      // 处理年月日联动
      let newYear = this.data.selectedYear
      let newMonth = this.data.selectedMonth
      let newDay = this.data.selectedDay
      let newHour = this.data.selectedHour
      let newMinute = this.data.selectedMinute
      let newSecond = this.data.selectedSecond
      
      if (fields.includes('year')) {
        const yearIdx = values.year
        newYear = years[yearIdx] || newYear
      }
      
      if (fields.includes('month')) {
        const availableMonths = this.getAvailableMonths(newYear)
        newMonth = availableMonths[values.month] || availableMonths[0]
      }
      
      if (fields.includes('day')) {
        const availableDays = this.getAvailableDays(newYear, newMonth)
        newDay = availableDays[values.day] ? availableDays[values.day].day : availableDays[0].day
      }
      
      // 获取可用的小时列表
      const availableHours = this.getAvailableHours(newYear, newMonth, newDay)
      
      if (fields.includes('hour')) {
        newHour = availableHours[values.hour] !== undefined ? availableHours[values.hour] : availableHours[0]
      }
      
      // 获取可用的分钟列表
      const availableMinutes = this.getAvailableMinutes(newYear, newMonth, newDay, newHour)
      
      if (fields.includes('minute')) {
        newMinute = availableMinutes[values.minute] !== undefined ? availableMinutes[values.minute] : availableMinutes[0]
      }
      
      // 获取可用的秒列表
      const availableSeconds = this.getAvailableSeconds(newYear, newMonth, newDay, newHour, newMinute)
      
      if (fields.includes('second')) {
        newSecond = availableSeconds[values.second] !== undefined ? availableSeconds[values.second] : availableSeconds[0]
      }
      
      // 计算星期几
      const newWeekday = new Date(newYear, newMonth - 1, newDay).getDay()
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const currentWeekdayText = weekdays[newWeekday]
      
      // 检查是否需要重新计算pickerValue（年月日时分秒联动）
      const needRecalculate = 
        newYear !== this.data.selectedYear || 
        newMonth !== this.data.selectedMonth ||
        newDay !== this.data.selectedDay ||
        newHour !== this.data.selectedHour ||
        newMinute !== this.data.selectedMinute
      
      this.setData({
        currentWeekdayText,
        selectedYear: newYear,
        selectedMonth: newMonth,
        selectedDay: newDay,
        selectedWeekday: newWeekday,
        selectedHour: newHour,
        selectedMinute: newMinute,
        selectedSecond: newSecond
      })
      
      if (needRecalculate) {
        // 更新列表
        const days = this.getAvailableDays(newYear, newMonth)
        const hours = availableHours
        const minutes = availableMinutes
        const seconds = availableSeconds
        this.setData({ days, hours, minutes, seconds })
        // 重新计算索引
        this.recalculatePickerValue()
      }
    },

    /**
     * 重新计算pickerValue（处理年月日时分秒联动）
     */
    recalculatePickerValue() {
      const { fields, years, selectedYear, selectedMonth, selectedDay,
              selectedHour, selectedMinute, selectedSecond } = this.data
      
      const pickerValue = []
      const fieldConfigs = this.getFieldConfigs()
      
      // 获取可用列表
      const availableMonths = this.getAvailableMonths(selectedYear)
      const availableDays = this.getAvailableDays(selectedYear, selectedMonth)
      const availableHours = this.getAvailableHours(selectedYear, selectedMonth, selectedDay)
      const availableMinutes = this.getAvailableMinutes(selectedYear, selectedMonth, selectedDay, selectedHour)
      const availableSeconds = this.getAvailableSeconds(selectedYear, selectedMonth, selectedDay, selectedHour, selectedMinute)
      
      fieldConfigs.forEach(config => {
        switch (config.key) {
          case 'year':
            pickerValue.push(years.indexOf(selectedYear))
            break
          case 'month':
            pickerValue.push(availableMonths.indexOf(selectedMonth))
            break
          case 'day':
            const dayIdx = availableDays.findIndex(d => d.day === selectedDay)
            pickerValue.push(dayIdx >= 0 ? dayIdx : 0)
            break
          case 'hour':
            pickerValue.push(availableHours.indexOf(selectedHour))
            break
          case 'minute':
            pickerValue.push(availableMinutes.indexOf(selectedMinute))
            break
          case 'second':
            pickerValue.push(availableSeconds.indexOf(selectedSecond))
            break
        }
      })
      
      this.setData({ pickerValue })
    },

    /**
     * 确认选择
     */
    confirmPicker() {
      const { fields, years, months, daysWithWeekday, hours, minutes, seconds, 
              pickerValue } = this.data
      
      // 直接从 picker 当前位置读取各列真实选中值（避免 selected* 缓存不同步）
      const fieldConfigs = this.getFieldConfigs()
      let colIdx = 0
      let selectedYear = this.data.selectedYear
      let selectedMonth = this.data.selectedMonth
      let selectedDay = this.data.selectedDay
      let selectedHour = this.data.selectedHour
      let selectedMinute = this.data.selectedMinute
      let selectedSecond = this.data.selectedSecond

      for (const cfg of fieldConfigs) {
        const idx = pickerValue[colIdx] || 0
        switch (cfg.key) {
          case 'year': selectedYear = years[idx]; break
          case 'month': selectedMonth = months[idx]; break
          case 'day': {
            const dayItem = daysWithWeekday[idx]
            selectedDay = dayItem ? dayItem.day : this.data.selectedDay
            break
          }
          case 'hour': selectedHour = hours[idx]; break
          case 'minute': selectedMinute = minutes[idx]; break
          case 'second': selectedSecond = seconds[idx]; break
        }
        colIdx++
      }
      
      // 同步回内部状态（供 displayText 使用）
      const weekday = new Date(selectedYear, selectedMonth - 1, selectedDay).getDay()
      this.setData({
        selectedYear, selectedMonth, selectedDay,
        selectedWeekday: weekday,
        selectedHour, selectedMinute, selectedSecond
      })
      
      // 生成日期时间字符串
      let result = ''
      const datePart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
      
      if (fields.includes('hour') || fields.includes('minute') || fields.includes('second')) {
        const timePart = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}:${String(selectedSecond).padStart(2, '0')}`
        result = `${datePart} ${timePart}`
      } else {
        result = datePart
      }
      
      this.updateDisplayText()
      this.hidePicker()
      
      // 触发事件
      this.triggerEvent('change', { 
        value: result,
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
        weekday: weekday,
        hour: selectedHour,
        minute: selectedMinute,
        second: selectedSecond
      })
    },

    /**
     * 取消选择
     */
    cancelPicker() {
      this.hidePicker()
      this.triggerEvent('cancel')
    },

    /**
     * 获取当前选中的日期时间（本地时间）
     */
    getSelectedDateTime() {
      const { selectedYear, selectedMonth, selectedDay, 
              selectedHour, selectedMinute, selectedSecond } = this.data
      return {
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
        weekday: this.data.selectedWeekday,
        hour: selectedHour,
        minute: selectedMinute,
        second: selectedSecond,
        // 返回格式化的日期字符串
        dateStr: `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`,
        timeStr: `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}:${String(selectedSecond).padStart(2, '0')}`,
        // 返回Date对象（本地时间）
        date: new Date(selectedYear, selectedMonth - 1, selectedDay, selectedHour, selectedMinute, selectedSecond)
      }
    }
  }
})
