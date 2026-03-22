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

    // 使用 corner 类型显示角标（日历组件只支持 schedule/corner/festival/solar）
    const marks = dates.map(date => ({
      date: date,
      type: 'corner',
      text: '休',
      style: { color: '#16A34A' }  // 绿色字体
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

      // 不添加默认条目，让用户自己添加
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
    const date = e.detail.value  // datetime-picker 返回的是日期时间字符串
    const holidays = [...this.data.holidays]
    holidays[index].date = date
    this.setData({ holidays })
  },

  /**
   * 添加节假日
   */
  handleAddHoliday() {
    const holidays = [...this.data.holidays]
    // 使用本地日期作为默认值，避免时区问题
    const defaultDate = holidays.length > 0 ? holidays[holidays.length - 1].date : utils.getLocalDateString()

    // 计算下一天
    const nextDate = holidays.length > 0 ? this.getNextDate(defaultDate) : defaultDate

    holidays.push({ date: nextDate })
    this.setData({ holidays })
  },

  /**
   * 获取下一天的日期（本地日期格式，不进行时区转换）
   * @param {string} dateStr - 日期字符串 YYYY-MM-DD
   * @returns {string} 下一天的日期字符串
   */
  getNextDate(dateStr) {
    // 解析日期字符串，使用本地时区
    const parts = dateStr.split('-')
    const year = parseInt(parts[0])
    const month = parseInt(parts[1]) - 1
    const day = parseInt(parts[2])
    const date = new Date(year, month, day)
    date.setDate(date.getDate() + 1)
    // 使用本地日期格式化，不进行时区转换
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

    // 允许删除所有节假日，提交时会自动添加一个默认值
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

    this.setData({ submitting: true })

    try {
      // 传递用户名给云函数
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
  }
})
