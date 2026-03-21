/**
 * 本馆日历页面
 * 展示日历视图，支持管理员/会计配置节假日
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

Page({
  data: {
    statusBarHeight: 0,           // 状态栏高度
    navBarHeight: 44,             // 导航栏高度
    calendarLoaded: false,        // 日历是否加载完成
    marks: [],                    // 日历标记数据
    currentYear: new Date().getFullYear(),
    // 权限控制
    canConfig: false,             // 是否有配置权限
    currentUser: null,
    // 配置弹窗
    showConfigPopup: false,
    configYear: new Date().getFullYear(),  // 当前选择的年份
    yearOptions: [],              // 年份选项
    holidays: [],                 // 节假日日期列表
    submitting: false
  },

  onLoad() {
    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight
    })

    // 生成年份选项（今年和明年）
    const currentYear = new Date().getFullYear()
    this.setData({
      yearOptions: [currentYear, currentYear + 1],
      configYear: currentYear
    })

    // 检查权限
    this.checkPermission()

    // 加载节假日配置
    this.loadHolidays()
  },

  onShow() {
    // 每次显示时重新加载节假日
    this.loadHolidays()
  },

  /**
   * 检查用户权限
   */
  checkPermission() {
    app.checkUserRegistration().then((result) => {
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
      type: 'rest',
      text: '休'
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
    console.log('点击日期:', e.detail)
  },

  /**
   * 选中日期变化
   */
  handleCalendarChange(e) {
    console.log('选中日期变化:', e.detail)
  },

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

      // 如果没有数据，添加一个默认的空条目
      if (holidays.length === 0) {
        const today = utils.formatDate(Date.now())
        holidays = [{ date: today }]
      }

      this.setData({
        showConfigPopup: true,
        holidays
      })
    } catch (error) {
      console.error('加载节假日配置失败:', error)
      // 显示一个默认条目
      const today = utils.formatDate(Date.now())
      this.setData({
        showConfigPopup: true,
        holidays: [{ date: today }]
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
    const lastDate = holidays.length > 0 ? holidays[holidays.length - 1].date : utils.formatDate(Date.now())

    // 计算下一天
    const nextDate = this.getNextDate(lastDate)

    holidays.push({ date: nextDate })
    this.setData({ holidays })
  },

  /**
   * 获取下一天的日期
   */
  getNextDate(dateStr) {
    const date = new Date(dateStr)
    date.setDate(date.getDate() + 1)
    return utils.formatDate(date.getTime())
  },

  /**
   * 删除节假日
   */
  handleDeleteHoliday(e) {
    const index = e.currentTarget.dataset.index
    const holidays = [...this.data.holidays]

    if (holidays.length <= 1) {
      utils.showToast({ title: '至少保留一个节假日', icon: 'none' })
      return
    }

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
      .filter(d => d) // 过滤空值

    if (dates.length === 0) {
      utils.showToast({ title: '请至少添加一个节假日', icon: 'none' })
      return
    }

    this.setData({ submitting: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'holidayManager',
        data: {
          action: 'save',
          params: {
            year: this.data.configYear,
            dates
          }
        }
      })

      if (res.result.code === 0) {
        utils.showToast({ title: '配置成功', icon: 'success' })
        this.setData({ showConfigPopup: false })

        // 更新日历标记
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
  },

  /**
   * 返回上一页
   */
  handleBack() {
    wx.navigateBack()
  }
})
