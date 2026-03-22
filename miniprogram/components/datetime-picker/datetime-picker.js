/**
 * 自定义日期时间选择器组件
 * 功能：支持年、月、日、星期、时、分、秒的自定义显示
 * 特点：本地时间处理，漂亮动画效果
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
      value: '1900-01-01'
    },
    // 最大日期 YYYY-MM-DD
    endDate: {
      type: String,
      value: '2100-12-31'
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
    showYear: true,
    showMonth: true,
    showDay: true,
    showWeekday: true,
    showHour: false,
    showMinute: false,
    showSecond: false,
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
    // 字段配置映射
    fieldMap: {
      year: { key: 'year', label: '年' },
      month: { key: 'month', label: '月' },
      day: { key: 'day', label: '日' },
      weekday: { key: 'weekday', label: '星期' },
      hour: { key: 'hour', label: '时' },
      minute: { key: 'minute', label: '分' },
      second: { key: 'second', label: '秒' }
    }
  },

  lifetimes: {
    attached() {
      this.initPickerData()
    }
  },

  methods: {
    /**
     * 初始化picker数据
     */
    initPickerData() {
      const { startDate, endDate, fields } = this.data
      
      // 生成年份列表
      const startYear = parseInt(startDate.split('-')[0], 10)
      const endYear = parseInt(endDate.split('-')[0], 10)
      const years = []
      for (let y = startYear; y <= endYear; y++) {
        years.push(y)
      }
      
      // 生成月份列表
      const months = []
      for (let m = 1; m <= 12; m++) {
        months.push(m)
      }
      
      // 生成小时列表
      const hours = []
      for (let h = 0; h < 24; h++) {
        hours.push(h)
      }
      
      // 生成分钟和秒列表
      const minutes = []
      const seconds = []
      for (let i = 0; i < 60; i++) {
        minutes.push(i)
        seconds.push(i)
      }
      
      // 初始化日期列表（默认31天，后续根据年月动态调整）
      const days = []
      for (let d = 1; d <= 31; d++) {
        days.push(d)
      }
      
      this.setData({ 
        years, months, days, hours, minutes, seconds,
        // 设置字段显示状态
        showYear: fields.includes('year'),
        showMonth: fields.includes('month'),
        showDay: fields.includes('day'),
        showWeekday: fields.includes('weekday'),
        showHour: fields.includes('hour'),
        showMinute: fields.includes('minute'),
        showSecond: fields.includes('second')
      })
      
      // 设置初始值
      if (this.data.value) {
        this.onValueChange(this.data.value)
      } else {
        this.setCurrentDateTime()
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
      const { fields, years, startDate, endDate } = this.data
      
      // 根据日期范围调整月份和日期
      const startY = parseInt(startDate.split('-')[0], 10)
      const startM = parseInt(startDate.split('-')[1], 10)
      const startD = parseInt(startDate.split('-')[2], 10)
      const endY = parseInt(endDate.split('-')[0], 10)
      const endM = parseInt(endDate.split('-')[1], 10)
      const endD = parseInt(endDate.split('-')[2], 10)
      
      // 计算各列索引
      const pickerValue = []
      const fieldConfigs = this.getFieldConfigs()
      
      fieldConfigs.forEach(config => {
        switch (config.key) {
          case 'year':
            const yearIdx = years.indexOf(year)
            pickerValue.push(yearIdx >= 0 ? yearIdx : 0)
            break
          case 'month':
            const availableMonths = this.getAvailableMonths(year)
            const monthIdx = availableMonths.indexOf(month)
            pickerValue.push(monthIdx >= 0 ? monthIdx : 0)
            break
          case 'day':
            const availableDays = this.getAvailableDays(year, month)
            const dayIdx = availableDays.indexOf(day)
            pickerValue.push(dayIdx >= 0 ? dayIdx : 0)
            break
          case 'weekday':
            pickerValue.push(weekday || 0)
            break
          case 'hour':
            pickerValue.push(hour)
            break
          case 'minute':
            pickerValue.push(minute)
            break
          case 'second':
            pickerValue.push(second)
            break
        }
      })
      
      // 获取当前年月对应的天数列表
      const days = this.getAvailableDays(year, month)
      
      this.setData({
        pickerValue,
        days,
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
      const { startDate, endDate } = this.data
      const startY = parseInt(startDate.split('-')[0], 10)
      const startM = parseInt(startDate.split('-')[1], 10)
      const endY = parseInt(endDate.split('-')[0], 10)
      const endM = parseInt(endDate.split('-')[1], 10)
      
      let startMonth = 1
      let endMonth = 12
      
      if (year === startY) startMonth = startM
      if (year === endY) endMonth = endM
      
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
      const { startDate, endDate } = this.data
      const startY = parseInt(startDate.split('-')[0], 10)
      const startM = parseInt(startDate.split('-')[1], 10)
      const startD = parseInt(startDate.split('-')[2], 10)
      const endY = parseInt(endDate.split('-')[0], 10)
      const endM = parseInt(endDate.split('-')[1], 10)
      const endD = parseInt(endDate.split('-')[2], 10)
      
      // 获取该月的天数
      const daysInMonth = new Date(year, month, 0).getDate()
      let startDay = 1
      let endDay = daysInMonth
      
      if (year === startY && month === startM) startDay = startD
      if (year === endY && month === endM) endDay = endD
      
      const days = []
      for (let d = startDay; d <= endDay; d++) {
        days.push(d)
      }
      return days
    },

    /**
     * 获取字段配置列表
     */
    getFieldConfigs() {
      const { fields, fieldMap } = this.data
      return fields.map(f => fieldMap[f]).filter(Boolean)
    },

    /**
     * value属性变化回调
     */
    onValueChange(newVal) {
      if (!newVal) {
        this.setData({ displayText: '' })
        this.setCurrentDateTime()
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
      const { fields, selectedYear, selectedMonth, selectedDay, selectedWeekday, 
              selectedHour, selectedMinute, selectedSecond, weekdays } = this.data
      
      const parts = []
      
      if (fields.includes('year')) parts.push(`${selectedYear}年`)
      if (fields.includes('month')) parts.push(`${String(selectedMonth).padStart(2, '0')}月`)
      if (fields.includes('day')) parts.push(`${String(selectedDay).padStart(2, '0')}日`)
      if (fields.includes('weekday')) parts.push(weekdays[selectedWeekday])
      
      const timeParts = []
      if (fields.includes('hour')) timeParts.push(String(selectedHour).padStart(2, '0'))
      if (fields.includes('minute')) timeParts.push(String(selectedMinute).padStart(2, '0'))
      if (fields.includes('second')) timeParts.push(String(selectedSecond).padStart(2, '0'))
      
      if (timeParts.length > 0) {
        parts.push(' ' + timeParts.join(':'))
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
      
      // 如果没有初始值，设置为当前日期时间
      if (!this.data.value) {
        this.setCurrentDateTime()
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
        newDay = availableDays[values.day] || availableDays[0]
      }
      
      // 计算星期几
      const newWeekday = new Date(newYear, newMonth - 1, newDay).getDay()
      
      // 更新时间值
      const newHour = fields.includes('hour') ? values.hour : this.data.selectedHour
      const newMinute = fields.includes('minute') ? values.minute : this.data.selectedMinute
      const newSecond = fields.includes('second') ? values.second : this.data.selectedSecond
      
      // 检查是否需要重新计算pickerValue（年月联动）
      const needRecalculate = 
        newYear !== this.data.selectedYear || 
        newMonth !== this.data.selectedMonth
      
      this.setData({
        selectedYear: newYear,
        selectedMonth: newMonth,
        selectedDay: newDay,
        selectedWeekday: newWeekday,
        selectedHour: newHour,
        selectedMinute: newMinute,
        selectedSecond: newSecond
      })
      
      if (needRecalculate) {
        // 更新天数列表
        const days = this.getAvailableDays(newYear, newMonth)
        this.setData({ days })
        // 重新计算索引
        this.recalculatePickerValue()
      }
    },

    /**
     * 重新计算pickerValue（处理年月联动）
     */
    recalculatePickerValue() {
      const { fields, years, selectedYear, selectedMonth, selectedDay,
              selectedWeekday, selectedHour, selectedMinute, selectedSecond } = this.data
      
      const pickerValue = []
      const fieldConfigs = this.getFieldConfigs()
      
      fieldConfigs.forEach(config => {
        switch (config.key) {
          case 'year':
            pickerValue.push(years.indexOf(selectedYear))
            break
          case 'month':
            const availableMonths = this.getAvailableMonths(selectedYear)
            pickerValue.push(availableMonths.indexOf(selectedMonth))
            break
          case 'day':
            const availableDays = this.getAvailableDays(selectedYear, selectedMonth)
            pickerValue.push(availableDays.indexOf(selectedDay))
            break
          case 'weekday':
            pickerValue.push(selectedWeekday)
            break
          case 'hour':
            pickerValue.push(selectedHour)
            break
          case 'minute':
            pickerValue.push(selectedMinute)
            break
          case 'second':
            pickerValue.push(selectedSecond)
            break
        }
      })
      
      this.setData({ pickerValue })
    },

    /**
     * 确认选择
     */
    confirmPicker() {
      const { fields, selectedYear, selectedMonth, selectedDay, 
              selectedHour, selectedMinute, selectedSecond } = this.data
      
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
        weekday: this.data.selectedWeekday,
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
