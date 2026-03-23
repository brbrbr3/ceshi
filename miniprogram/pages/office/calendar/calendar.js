/**
 * 本馆日历页面
 * 展示日历视图，支持管理员/会计配置节假日
 * 支持周视图下的日程管理功能
 */

const app = getApp()
const utils = require('../../../common/utils.js')

// 引入日历组件和农历插件
const { WxCalendar } = require('@lspriv/wx-calendar/lib')
const { LunarPlugin } = require('@lspriv/wc-plugin-lunar')

// 启用农历插件
WxCalendar.use(LunarPlugin)

// 权限角色列表
const CONFIG_ALLOWED_ROLES = ['admin', '会计', '会计主管']

// 日程类型配置
const SCHEDULE_TYPES = [
  { type: 'meeting', name: '会议', color: '#3B82F6' },
  { type: 'training', name: '培训', color: '#10B981' },
  { type: 'visit', name: '会见', color: '#8B5CF6' },
  { type: 'banquet', name: '宴请', color: '#F59E0B' },
  { type: 'other', name: '其他', color: '#6B7280' }
]

// 重复选项
const REPEAT_OPTIONS = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' }
]

// 时间轴配置
const HOUR_HEIGHT = 100 // 每小时高度 rpx
const START_HOUR = 0 // 起始小时 0:00
const END_HOUR = 24 // 结束小时 24:00

Page({
  data: {
    // 日历状态
    calendarLoaded: false,
    calendarView: 'month', // 'month' | 'week'
    isWeekView: false,
    marks: [],
    currentYear: new Date().getFullYear(),

    // 权限控制
    canConfig: false,
    currentUser: null,

    // 配置弹窗
    showConfigPopup: false,
    configYear: new Date().getFullYear(),
    yearOptions: [],
    holidays: [],
    submitting: false,

    // 日程相关
    selectedDate: null,
    selectedDateText: '',
    schedules: {
      all: [],
      allDay: [],
      timed: []
    },
    hours: Array.from({ length: END_HOUR - START_HOUR }, (_, i) => i + START_HOUR),

    // 当前时间线
    showCurrentTime: true,
    currentTimeTop: 0,
    currentTimeText: '',
    currentTimeView: '',

    // 日程弹窗
    showSchedulePopup: false,
    editingSchedule: null,
    scheduleForm: {
      title: '',
      isAllDay: false,
      startDate: '',
      endDate: '',
      startTime: '09:00',
      endTime: '10:00',
      type: 'meeting',
      typeName: '会议',
      color: '#3B82F6',
      repeat: 'none',
      location: '',
      description: ''
    },

    // 类型和重复选项
    typeOptions: SCHEDULE_TYPES,
    repeatOptions: REPEAT_OPTIONS,

    // 类型/重复选择弹窗
    showTypePopup: false,
    showRepeatPopup: false
  },

  async onLoad() {
    wx.showLoading({ title: '加载中...', mask: true })

    try {
      // 生成年份选项
      const currentYear = new Date().getFullYear()
      this.setData({
        yearOptions: [currentYear, currentYear + 1],
        configYear: currentYear
      })

      // 检查权限
      await this.checkPermission()

      // 加载节假日配置
      await this.loadHolidays()

      // 初始化今日日期
      this.initTodayDate()

      // 更新当前时间线
      this.updateCurrentTime()

      // 每分钟更新时间线
      this.timeInterval = setInterval(() => {
        this.updateCurrentTime()
      }, 60000)
    } finally {
      wx.hideLoading()
    }
  },

  onShow() {
    // 每次显示时重新加载节假日和日程
    this.loadHolidays()
    if (this.data.selectedDate) {
      this.loadSchedules(this.data.selectedDate)
    }
  },

  onUnload() {
    // 清除定时器
    if (this.timeInterval) {
      clearInterval(this.timeInterval)
    }
  },

  /**
   * 初始化今日日期
   */
  initTodayDate() {
    const today = new Date()
    const defaultDate = {
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate()
    }
    const dateStr = this.formatDateStr(defaultDate)
    const todayStr = this.getDateString(today)

    this.setData({
      selectedDate: defaultDate,
      selectedDateText: dateStr,
      'scheduleForm.startDate': todayStr,
      'scheduleForm.endDate': todayStr
    })

    // 加载今日日程
    this.loadSchedules(defaultDate)
  },

  /**
   * 格式化日期显示文本
   */
  formatDateStr(date) {
    return `${date.month}月${date.day}日`
  },

  /**
   * 获取日期字符串 YYYY-MM-DD
   */
  getDateString(date) {
    const d = date instanceof Date ? date : new Date(date.year, date.month - 1, date.day)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    return app.checkUserRegistration().then((result) => {
      if (result.registered && result.user) {
        const user = result.user
        const isAdmin = user.isAdmin || user.role === 'admin'
        const isAllowed = isAdmin || CONFIG_ALLOWED_ROLES.includes(user.role)

        this.setData({
          currentUser: user,
          canConfig: isAllowed
        })
      }
    }).catch(() => {
      // 静默失败
    })
  },

  /**
   * 加载节假日配置
   */
  async loadHolidays() {
    try {
      const currentYear = new Date().getFullYear()
      const res = await wx.cloud.callFunction({
        name: 'holidayManager',
        data: {
          action: 'getByYear',
          params: { year: currentYear }
        }
      })

      if (res.result.code === 0 && res.result.data.exists) {
        const config = res.result.data.config
        this.setCalendarMarks(config.dates)
      } else {
        this.setData({ marks: [] })
      }
    } catch (error) {
      console.error('加载节假日失败:', error)
    }
  },

  /**
   * 设置日历标记
   */
  setCalendarMarks(dates) {
    if (!dates || dates.length === 0) {
      this.setData({ marks: [] })
      return
    }

    const marks = dates.map(date => ({
      date: date,
      type: 'corner',
      text: '休',
      style: { color: '#16A34A' }
    }))

    this.setData({ marks })
  },

  /**
   * 日历加载完成
   */
  handleCalendarLoad(e) {
    this.setData({ calendarLoaded: true })
    console.log('日历加载完成:', e.detail)
  },

  /**
   * 点击日期
   */
  handleCalendarClick(e) {
    const { checked } = e.detail
    console.log('点击日期:', checked)

    const dateText = this.formatDateStr(checked)
    const dateStr = this.getDateString(checked)

    this.setData({
      selectedDate: checked,
      selectedDateText: dateText,
      'scheduleForm.startDate': dateStr,
      'scheduleForm.endDate': dateStr
    })

    this.loadSchedules(checked)
  },

  /**
   * 选中日期变化
   */
  handleCalendarChange(e) {
    const { checked } = e.detail
    console.log('选中日期变化:', checked)

    const dateText = this.formatDateStr(checked)
    const dateStr = this.getDateString(checked)

    this.setData({
      selectedDate: checked,
      selectedDateText: dateText,
      'scheduleForm.startDate': dateStr,
      'scheduleForm.endDate': dateStr
    })

    this.loadSchedules(checked)
  },

  /**
   * 视图变化（月视图/周视图切换）
   */
  handleViewChange(e) {
    const { view } = e.detail
    console.log('视图变化:', view)

    this.setData({
      calendarView: view,
      isWeekView: view === 'week'
    })

    // 切换到周视图时加载日程
    if (view === 'week' && this.data.selectedDate) {
      this.loadSchedules(this.data.selectedDate)
    }
  },

  /**
   * 加载日程数据
   */
  async loadSchedules(date) {
    if (!date) return

    const dateStr = this.getDateString(date)

    try {
      const res = await wx.cloud.callFunction({
        name: 'scheduleManager',
        data: {
          action: 'getByDate',
          params: { date: dateStr }
        }
      })

      if (res.result.code === 0) {
        const { all, allDay, timed } = res.result.data

        // 计算时间轴位置
        const timedWithPosition = timed.map(schedule => ({
          ...schedule,
          ...this.calculateSchedulePosition(schedule)
        }))

        this.setData({
          'schedules.all': all,
          'schedules.allDay': allDay,
          'schedules.timed': timedWithPosition
        })
      }
    } catch (error) {
      console.error('加载日程失败:', error)
    }
  },

  /**
   * 计算日程在时间轴上的位置
   */
  calculateSchedulePosition(schedule) {
    if (schedule.isAllDay) {
      return { top: 0, height: 0 }
    }

    const [startHour, startMin] = schedule.startTime.split(':').map(Number)
    const [endHour, endMin] = schedule.endTime.split(':').map(Number)

    // 计算相对于 0:00 的偏移
    const startOffset = startHour + startMin / 60
    const endOffset = endHour + endMin / 60

    const top = startOffset * HOUR_HEIGHT
    const height = Math.max((endOffset - startOffset) * HOUR_HEIGHT, 50) // 最小高度 50rpx

    return { top, height }
  },

  /**
   * 更新当前时间线
   */
  updateCurrentTime() {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()

    // 时间范围检查 (0-24)
    if (hour < START_HOUR || hour > END_HOUR) {
      this.setData({ showCurrentTime: false })
      return
    }

    // 计算位置
    const timeOffset = hour + minute / 60
    const currentTimeTop = timeOffset * HOUR_HEIGHT

    // 格式化时间文本
    const currentTimeText = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

    // 自动滚动到当前时间附近
    const currentTimeView = `hour-${Math.max(0, hour - 1)}`

    this.setData({
      showCurrentTime: true,
      currentTimeTop,
      currentTimeText,
      currentTimeView
    })
  },

  // ==================== 日程弹窗相关 ====================

  /**
   * 显示添加日程弹窗
   */
  handleAddSchedule() {
    const today = this.getDateString(new Date())

    this.setData({
      showSchedulePopup: true,
      editingSchedule: null,
      scheduleForm: {
        title: '',
        isAllDay: false,
        startDate: this.data.scheduleForm.startDate || today,
        endDate: this.data.scheduleForm.endDate || today,
        startTime: '09:00',
        endTime: '10:00',
        type: 'meeting',
        typeName: '会议',
        color: '#3B82F6',
        repeat: 'none',
        location: '',
        description: ''
      }
    })
  },

  /**
   * 点击日程条
   */
  handleScheduleTap(e) {
    const schedule = e.currentTarget.dataset.schedule
    console.log('点击日程:', schedule)

    this.setData({
      showSchedulePopup: true,
      editingSchedule: schedule,
      scheduleForm: {
        title: schedule.title,
        isAllDay: schedule.isAllDay,
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        startTime: schedule.startTime || '09:00',
        endTime: schedule.endTime || '10:00',
        type: schedule.type,
        typeName: schedule.typeName,
        color: schedule.color,
        repeat: schedule.repeat || 'none',
        location: schedule.location || '',
        description: schedule.description || ''
      }
    })
  },

  /**
   * 隐藏日程弹窗
   */
  hideSchedulePopup() {
    this.setData({ showSchedulePopup: false })
  },

  /**
   * 标题输入
   */
  handleTitleInput(e) {
    this.setData({ 'scheduleForm.title': e.detail.value })
  },

  /**
   * 全天开关
   */
  handleAllDayChange(e) {
    this.setData({ 'scheduleForm.isAllDay': e.detail.value })
  },

  /**
   * 开始日期变化
   */
  handleStartDateChange(e) {
    this.setData({ 'scheduleForm.startDate': e.detail.value })
  },

  /**
   * 结束日期变化
   */
  handleEndDateChange(e) {
    this.setData({ 'scheduleForm.endDate': e.detail.value })
  },

  /**
   * 开始时间变化
   */
  handleStartTimeChange(e) {
    this.setData({ 'scheduleForm.startTime': e.detail.value })
  },

  /**
   * 结束时间变化
   */
  handleEndTimeChange(e) {
    this.setData({ 'scheduleForm.endTime': e.detail.value })
  },

  /**
   * 地点输入
   */
  handleLocationInput(e) {
    this.setData({ 'scheduleForm.location': e.detail.value })
  },

  /**
   * 备注输入
   */
  handleDescriptionInput(e) {
    this.setData({ 'scheduleForm.description': e.detail.value })
  },

  /**
   * 显示类型选择弹窗
   */
  handleTypeTap() {
    this.setData({ showTypePopup: true })
  },

  /**
   * 隐藏类型选择弹窗
   */
  hideTypePopup() {
    this.setData({ showTypePopup: false })
  },

  /**
   * 选择类型
   */
  handleSelectType(e) {
    const type = e.currentTarget.dataset.type
    const typeOption = SCHEDULE_TYPES.find(t => t.type === type)

    if (typeOption) {
      this.setData({
        'scheduleForm.type': typeOption.type,
        'scheduleForm.typeName': typeOption.name,
        'scheduleForm.color': typeOption.color,
        showTypePopup: false
      })
    }
  },

  /**
   * 显示重复选择弹窗
   */
  handleRepeatTap() {
    this.setData({ showRepeatPopup: true })
  },

  /**
   * 隐藏重复选择弹窗
   */
  hideRepeatPopup() {
    this.setData({ showRepeatPopup: false })
  },

  /**
   * 选择重复
   */
  handleSelectRepeat(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      'scheduleForm.repeat': value,
      showRepeatPopup: false
    })
  },

  /**
   * 获取重复标签
   */
  get repeatLabel() {
    const option = REPEAT_OPTIONS.find(o => o.value === this.data.scheduleForm.repeat)
    return option ? option.label : '不重复'
  },

  /**
   * 保存日程
   */
  async handleSaveSchedule() {
    const { scheduleForm, editingSchedule } = this.data

    // 表单验证
    if (!scheduleForm.title.trim()) {
      utils.showToast({ title: '请输入日程标题', icon: 'none' })
      return
    }

    if (!scheduleForm.startDate) {
      utils.showToast({ title: '请选择开始日期', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    try {
      const currentUser = this.data.currentUser || app.globalData.userProfile
      const params = {
        title: scheduleForm.title.trim(),
        isAllDay: scheduleForm.isAllDay,
        startDate: scheduleForm.startDate,
        endDate: scheduleForm.endDate || scheduleForm.startDate,
        startTime: scheduleForm.isAllDay ? null : scheduleForm.startTime,
        endTime: scheduleForm.isAllDay ? null : scheduleForm.endTime,
        type: scheduleForm.type,
        repeat: scheduleForm.repeat,
        location: scheduleForm.location,
        description: scheduleForm.description,
        creatorName: currentUser ? currentUser.name : '未知用户'
      }

      let res
      if (editingSchedule) {
        // 编辑模式
        res = await wx.cloud.callFunction({
          name: 'scheduleManager',
          data: {
            action: 'update',
            params: {
              scheduleId: editingSchedule._id,
              ...params
            }
          }
        })
      } else {
        // 新建模式
        res = await wx.cloud.callFunction({
          name: 'scheduleManager',
          data: {
            action: 'create',
            params
          }
        })
      }

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: editingSchedule ? '更新成功' : '创建成功', icon: 'success' })
        this.setData({ showSchedulePopup: false })

        // 重新加载日程
        if (this.data.selectedDate) {
          this.loadSchedules(this.data.selectedDate)
        }
      } else {
        utils.showToast({ title: res.result.message || '操作失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('保存日程失败:', error)
      utils.showToast({ title: '保存失败，请重试', icon: 'none' })
    }
  },

  /**
   * 删除日程
   */
  async handleDeleteSchedule() {
    const { editingSchedule } = this.data

    if (!editingSchedule) return

    const result = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '确定要删除这个日程吗？',
        success: resolve
      })
    })

    if (!result.confirm) return

    wx.showLoading({ title: '删除中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'scheduleManager',
        data: {
          action: 'delete',
          params: { scheduleId: editingSchedule._id }
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: '删除成功', icon: 'success' })
        this.setData({ showSchedulePopup: false })

        // 重新加载日程
        if (this.data.selectedDate) {
          this.loadSchedules(this.data.selectedDate)
        }
      } else {
        utils.showToast({ title: res.result.message || '删除失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('删除日程失败:', error)
      utils.showToast({ title: '删除失败，请重试', icon: 'none' })
    }
  },

  // ==================== 节假日配置相关 ====================

  /**
   * 点击配置按钮
   */
  handleConfigTap() {
    if (!this.data.canConfig) {
      wx.showModal({
        title: '权限提示',
        content: '您没有权限配置节假日',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    this.showConfigPopup()
  },

  /**
   * 显示配置弹窗
   */
  async showConfigPopup() {
    const year = this.data.configYear

    try {
      const res = await wx.cloud.callFunction({
        name: 'holidayManager',
        data: {
          action: 'getByYear',
          params: { year }
        }
      })

      let holidays = []
      if (res.result.code === 0 && res.result.data.exists) {
        holidays = res.result.data.config.dates.map(date => ({ date }))
      }

      this.setData({
        showConfigPopup: true,
        holidays
      })
    } catch (error) {
      console.error('加载节假日配置失败:', error)
      this.setData({
        showConfigPopup: true,
        holidays: []
      })
    }
  },

  /**
   * 隐藏配置弹窗
   */
  hideConfigPopup() {
    this.setData({ showConfigPopup: false })
  },

  /**
   * 阻止冒泡
   */
  stopPropagation() {},

  /**
   * 年份选择
   */
  handleYearChange(e) {
    const index = e.detail.value
    const year = this.data.yearOptions[index]
    this.setData({ configYear: year })
    this.showConfigPopup()
  },

  /**
   * 日期选择
   */
  handleDateChange(e) {
    const index = e.currentTarget.dataset.index
    const date = e.detail.value
    const holidays = [...this.data.holidays]
    holidays[index].date = date
    this.setData({ holidays })
  },

  /**
   * 添加节假日
   */
  handleAddHoliday() {
    const holidays = [...this.data.holidays]
    const defaultDate = holidays.length > 0 ? holidays[holidays.length - 1].date : utils.getLocalDateString()
    const nextDate = holidays.length > 0 ? this.getNextDate(defaultDate) : defaultDate

    holidays.push({ date: nextDate })
    this.setData({ holidays })
  },

  /**
   * 获取下一天的日期
   */
  getNextDate(dateStr) {
    const parts = dateStr.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const day = parseInt(parts[2])
    const date = new Date(year, month, day)
    date.setDate(date.getDate() + 1)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  },

  /**
   * 删除节假日
   */
  handleDeleteHoliday(e) {
    const index = e.currentTarget.dataset.index
    const holidays = [...this.data.holidays]
    holidays.splice(index, 1)
    this.setData({ holidays })
  },

  /**
   * 提交配置
   */
  async handleSubmitConfig() {
    if (this.data.submitting) return

    const dates = this.data.holidays
      .map(h => h.date)
      .filter(d => d)

    this.setData({ submitting: true })

    try {
      const currentUser = this.data.currentUser || app.globalData.userProfile
      const res = await wx.cloud.callFunction({
        name: 'holidayManager',
        data: {
          action: 'save',
          params: {
            year: this.data.configYear,
            dates
          },
          userInfo: {
            name: currentUser ? currentUser.name : '未知用户'
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '配置成功', icon: 'success' })
        this.setData({ showConfigPopup: false })
        this.setCalendarMarks(dates)
      } else {
        utils.showToast({ title: res.result.message || '配置失败', icon: 'none' })
      }
    } catch (error) {
      console.error('提交配置失败:', error)
      utils.showToast({ title: '配置失败，请重试', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
