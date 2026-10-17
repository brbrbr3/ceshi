/**
 * 理发预约页面
 * 
 * 数据流：
 * 1. 本地计算日期列表（周一、三、五）
 * 2. 获取节假日配置（跨年处理）
 * 3. 过滤掉节假日，前端提示"节假日无法理发"
 * 4. 调用后端获取非节假日日期的预约情况
 * 5. 本地组合数据渲染页面
 */

const app = getApp()
const modalAnimation = require('../../../behaviors/modalAnimation.js')

// 可查看理发预约的岗位
const HAIRCUT_VIEWER_POSITIONS = ['招待员', '会计主管', '会计', '办公室内聘']

// 统计列表每页条数（按时间排序时生效，触底自动加载下一页）
const STATS_PAGE_SIZE = 20

// 取消原因
const CANCEL_REASONS = [
  '招待员未履约',
  '预约人失约'
]

// 时段配置（与后端保持一致；每日 15:00 开始，共 6 个时段）
const TIME_SLOTS = [{
    start: '15:00',
    end: '15:30',
    display: '15:00~15:30'
  },
  {
    start: '15:30',
    end: '16:00',
    display: '15:30~16:00'
  },
  {
    start: '16:00',
    end: '16:30',
    display: '16:00~16:30'
  },
  {
    start: '16:30',
    end: '17:00',
    display: '16:30~17:00'
  },
  {
    start: '17:00',
    end: '17:30',
    display: '17:00~17:30'
  },
  {
    start: '17:30',
    end: '18:00',
    display: '17:30~18:00'
  }
]

Page({
  behaviors: [modalAnimation],

  data: {
    // 用户权限
    canView: false,
    isReceptionist: false,
    canExportStats: false, // 导出统计PDF：管理员 /「办公室内聘」岗位
    userName: '',
    userOpenId: '',
    isReviewer: false,
    // Tab
    activeTab: 'book',

    // 预约理发 Tab
    displayDates: [],
    selectedDate: '',
    selectedDateIndex: 0,
    selectedDateInfo: null,
    slots: [],
    slotsMessage: '',
    loadingSlots: false,
    selectedSlot: '',
    selectedSlotDisplay: '',

    // 理发统计 Tab
    statsList: [],
    statsGrouped: [],
    statsPage: 1,
    statsHasMore: true,
    statsTotalCount: 0,
    loadingstats: false,
    statsAllLoaded: false,
    sortBy: 'name', // 默认按人员统计（切换 Tab 时保留用户当前选择，不在此处重置）

    // 导出统计 PDF（选择模式）
    exportMode: false,
    exportGroups: [],      // 可选月份列表（全量数据）：{ monthKey, monthLabel, count, checked }
    selectedMonths: [],    // 已选月份的 monthKey
    exporting: false,       // 正在生成 PDF：按钮置灰防重入
    preparingExport: false, // 正在准备选择数据（时间排序下需补拉全量）

    // 我的预约 Tab
    myList: [],
    loadingMine: false,
    myPage: 1,
    hasMoreMine: true,

    // 预约表单
    showBookingPopup: false,
    bookingForm: {
      appointeeName: ''
    },
    submitting: false,

    // 取消弹窗
    showCancelPopup: false,
    cancelReasons: CANCEL_REASONS,
    cancelReason: '',
    cancellingAppointment: null,
    cancellingSlot: null,
    cancelling: false,

    // 时间状态
    todayStr: '',

    // 换日功能（招待员）
    showChangeDatePicker: false,
    changeDateStart: '',
    changeDateEnd: '',
    changeDateSource: '',
    changeDateTarget: '',
    changeDateConfirmVisible: false,
    changeDateConfirmInfo: '',
    changingDate: false,
    guardReady: false
  },

  onLoad() {
    this._slotsByDateCache = null
    // 权限（含 isReceptionist）就绪的 Promise：
    // onShow 触发的 loadData 会早于下面的 .then 执行，若不等待，
    // 首屏会用「非招待员」的口径计算 isDayLocked，与切 Tab 后的结果不一致
    this._permReady = app.guardRegistered().then((user) => {
      if (!user) return null
      this.setData({ guardReady: true })
      this.applyPermission(user)
      return user
    })
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    this.setData({ themeClass: app.getThemeClass(), pageStyle: app.getPageStyle() })
    app.applySystemUITheme(app.globalData.theme)
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    this.setData({
      todayStr: this.formatLocalDate(new Date())
    })
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 触底自动加载下一页
   * 与项目其它列表页一致：不再依赖「点击加载更多」按钮
   */
  onReachBottom() {
    if (this.data.exportMode) return // 选择模式下列表已收起，不触发分页
    if (this.data.activeTab === 'stats') {
      if (this.data.sortBy === 'time') this.loadMoreStatsAppointments()
      return
    }
    if (this.data.activeTab === 'mine') {
      this.loadMoreMyAppointments()
    }
  },

  /**
   * 设置用户权限（user 由守卫传入）
   */
  applyPermission(user) {
    const isAdmin = user.isAdmin === true
    const isLeader = user.role === '馆员' && user.department === '无'
    const isBanHead = user.role === '馆员' && user.department === '办' && user.isDepartmentHead === true
    const isAllowedPositions = Array.isArray(user.position) && user.position.some(p => HAIRCUT_VIEWER_POSITIONS.includes(p))
    //管理员、领导、办负责人、其他允许的岗位人员，可以看到‘理发统计’tab
    const canView = isAdmin || isLeader || isBanHead || isAllowedPositions
    const isReceptionist = Array.isArray(user.position) && user.position.includes('招待员')
    // 导出理发统计 PDF：管理员 /「办公室内聘」岗位
    // （与云端 generateOrderPdf.generateHaircutStatsPdf 校验口径一致，改一处需同步另一处）
    const canExportStats = isAdmin || (Array.isArray(user.position) && user.position.includes('办公室内聘'))
    this.setData({
      canView,
      isReceptionist,
      canExportStats,
      userName: user.name,
      userOpenId: user.openid || '',
      isReviewer: !!user.isReviewer
    })
  },

  /**
   * 加载数据
   */
  async loadData() {
    wx.showLoading({
      title: '加载中...',
      mask: true
    })
    try {
      if (this.data.activeTab === 'book') {
        await this.loadDisplayDates()
      } else if (this.data.activeTab === 'stats') {
        await this.loadstatsAppointments()
      } else if (this.data.activeTab === 'mine') {
        await this.loadMyAppointments()
      }
    } finally {
      wx.hideLoading()
    }
  },

  /**
   * Tab 切换
   */
  handleTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({
      activeTab: tab,
      // 切 Tab 时退出导出选择模式（悬浮按钮只在统计 Tab 显示）
      exportMode: false,
      exportGroups: [],
      selectedMonths: []
    })
    this.loadData()
  },

  // ==================== 预约理发 Tab ====================

  /**
   * 加载可显示日期
   * 流程：本地计算日期 -> 获取节假日 -> 过滤节假日 -> 获取预约情况 -> 组合数据
   */
  async loadDisplayDates() {
    // 等权限就绪：isReceptionist 参与 isDayLocked 计算（招待员不受锁定限制），
    // 未就绪就计算会导致首屏与切 Tab 后的结果不一致
    if (this._permReady) await this._permReady
    try {
      // 1. 本地计算应该显示的日期（基于本地时间）
      const calculatedDates = this.calculateDisplayDates()
      // 本周周一（显示下周时为下周一周一），传给云函数查询本周涉及的换日标记
      const weekMonday = calculatedDates[0] ? calculatedDates[0].date : ''

      // 1.5 计算候选日期（今天到下周五的工作日，用于查询临时理发日）
      const candidateDates = this.calculateCandidateDates()

      // 2. 获取节假日配置（全量缓存；传入本次会用到的年份，处理跨年未配置时的重拉）
      const holidaySet = await this.fetchHolidays(calculatedDates, candidateDates)

      // 3. 过滤节假日，生成最终显示的日期列表
      const displayDates = []
      const nonHolidayDates = [] // 非节假日日期，用于查询预约情况

      const now = new Date()
      const todayStr = this.formatLocalDate(now)

      calculatedDates.forEach(calcDate => {
        const isHoliday = holidaySet.has(calcDate.date)

        if (isHoliday) {
          // 节假日：显示但标记为禁用，不传给后端
          displayDates.push({
            ...calcDate,
            isHoliday: true,
            isToday: calcDate.date === todayStr,
            isDisabled: true,
            disableReason: '该日为节假日，不提供理发服务，祝假期愉快',
            reservationCount: 0
          })
        } else {
          // 非节假日：待后续填充预约数
          nonHolidayDates.push(calcDate.date)

          // 检查该日期是否已锁定（招待员不受限制）
          const isDayLocked = this.isDateLocked(calcDate.date) && !this.data.isReceptionist
          // 仅"该日已过去"才置为 isDisabled（灰掉、不可选）；过了14:50的当天不灰掉，仅锁定预约
          const isPastDate = calcDate.date < todayStr

          displayDates.push({
            ...calcDate,
            isHoliday: false,
            isToday: calcDate.date === todayStr,
            isDisabled: isPastDate,
            isDayLocked,
            disableReason: isPastDate
              ? '该日已过去'
              : (isDayLocked ? (calcDate.date === todayStr ? '今日时段已锁定，请联系招待员' : '该日时段已锁定，请联系招待员') : ''),
            reservationCount: 0 // 待后续填充
          })
        }
      })

      // 4. 合并查询日期：135 非节假日 + 候选日期（非节假日）
      const queryDates = [...new Set([
        ...nonHolidayDates,
        ...candidateDates.filter(d => !holidaySet.has(d))
      ])]

      // 审核模式：不请求时段/预约数据，仅展示本地计算的日期列表
      if (queryDates.length > 0 && !this.data.isReviewer) {
        const res = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'getReservationSlots',
            dates: queryDates,
            weekMonday
          }
        })

        if (res.result.code === 0) {
          const slotsByDate = res.result.data.slotsByDate || {}
          const changedDates = res.result.data.changedDates || []
          const movedSourceDates = res.result.data.movedSourceDates || []
          // 缓存完整时段数据，供 buildSlots 复用
          this._slotsByDateCache = slotsByDate
          // 填充预约数
          displayDates.forEach(d => {
            if (!d.isHoliday && slotsByDate[d.date]) {
              d.reservationCount = slotsByDate[d.date].length
            }
          })

          // 移除被换走的源日期（标准 135 中被换走的，不再显示、不再接收预约）
          if (movedSourceDates.length > 0) {
            for (let i = displayDates.length - 1; i >= 0; i--) {
              if (movedSourceDates.includes(displayDates[i].date)) {
                displayDates.splice(i, 1)
              }
            }
          }

          // 追加临时理发日（changedDates 中非 135、非本周一之前、非节假日的日期）
          // 本周内的换日标记（含已过去的）都需显示，便于查看已完成预约；仅过滤本周一之前的旧标记
          const existingDates = new Set(displayDates.map(d => d.date))
          changedDates.forEach(dateStr => {
            if (existingDates.has(dateStr)) return
            if (dateStr < weekMonday) return
            if (holidaySet.has(dateStr)) return

            const isDayLocked = this.isDateLocked(dateStr) && !this.data.isReceptionist
            const isPastDate = dateStr < todayStr
            displayDates.push({
              ...this.buildDateInfo(dateStr),
              isHoliday: false,
              isToday: dateStr === todayStr,
              isDisabled: isPastDate,
              isDayLocked,
              isChangedDate: true,
              disableReason: isPastDate ? '该日已过去' : '',
              reservationCount: (slotsByDate[dateStr] || []).length
            })
          })
        }
      }

      // 5. 按日期升序排序（临时理发日可能插在 135 之间）
      displayDates.sort((a, b) => a.date.localeCompare(b.date))

      // 6. 更新数据
      this.setData({
        displayDates
      })
      // 优先保持当前选中日期；若已不可用则回退到第一个可用日期
      let targetIndex = -1
      if (this.data.selectedDate) {
        targetIndex = displayDates.findIndex(d => d.date === this.data.selectedDate && !d.isDisabled)
      }
      if (targetIndex === -1) {
        targetIndex = displayDates.findIndex(d => !d.isDisabled)
      }

      if (targetIndex !== -1) {
        this.setData({
          selectedDateIndex: targetIndex,
          selectedDate: displayDates[targetIndex].date,
          selectedDateInfo: displayDates[targetIndex]
        })
        // 本地生成时段列表（复用缓存）
        await this.buildSlots(displayDates[targetIndex])
      } else if (displayDates.length > 0) {
        // 没有可用日期，选择第一个显示提示
        this.setData({
          selectedDateIndex: 0,
          selectedDate: displayDates[0].date,
          selectedDateInfo: displayDates[0]
        })
        // 修复：即使无可用日期也加载时段，避免首次进入时段为空
        await this.buildSlots(displayDates[0])
      }
    } catch (error) {
      console.error('加载日期失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 获取节假日配置（跨年处理）
   * @param {Array} displayDates - 标准 135 日期列表（元素含 date 字段）
   * @param {Array} candidateDates - 候选日期列表（今天到下周五，元素为日期字符串）
   * @returns {Set} 节假日日期集合
   */
  async fetchHolidays(displayDates, candidateDates) {
    const holidaySet = new Set()

    try {
      // 把本次真正会用到的年份传给缓存判定（12 月最后一周列表会跨到次年）：
      // 缓存里缺次年的数据（未配置）就会重新拉取 —— 未配置期间每次都拉，直到管理员配好
      const neededYears = [...new Set(
        [...(displayDates || []), ...(candidateDates || [])]
          .map(d => (d && d.date) || d || '')
          .map(s => String(s).substring(0, 4))
          .filter(y => /^\d{4}$/.test(y))
      )]
      const allList = await app.getAllHolidays(false, neededYears)
      allList.forEach(item => {
        if (item.dates && Array.isArray(item.dates)) {
          item.dates.forEach(d => holidaySet.add(d))
        }
      })
    } catch (error) {
      console.error('获取节假日失败:', error)
    }

    return holidaySet
  },

  /**
   * 判断当前时间是否已过截止时间（当日14:50）
   */
  isAfterDeadline() {
    const now = new Date()
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()
    const currentTime = currentHour * 60 + currentMinute
    const deadlineTime = 14 * 60 + 50 // 14:50
    return currentTime >= deadlineTime
  },

  /**
   * 判断指定日期是否已锁定（该日期的14:50已过，且锁永不解除）
   * 规则：如果指定日期 <= 今天，且（指定日期 < 今天 或 今天已过14:50），则该日期已锁定
   */
  isDateLocked(dateStr) {
    const todayStr = this.formatLocalDate(new Date())
    if (dateStr < todayStr) {
      // 过去的日期，一定已锁定
      return true
    }
    if (dateStr === todayStr) {
      // 今天，看是否过了14:50
      return this.isAfterDeadline()
    }
    // 未来的日期，未锁定
    return false
  },

  /**
   * 格式化本地日期为 YYYY-MM-DD
   */
  formatLocalDate(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 计算应该显示的日期（本地时间）
   * 规则：周日 0 点起显示下周的周一三五，否则显示本周的周一三五
   */
  /**
   * 构建日期显示信息（weekDay/monthDay/dayOfWeek）
   */
  buildDateInfo(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number)
    const dateObj = new Date(year, month - 1, day)
    const dayOfWeek = dateObj.getDay()
    const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    return {
      date: dateStr,
      weekDay: weekDays[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
      monthDay: `${month}月${day}日`,
      dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]
    }
  },

  /**
   * 计算候选日期（今天到下周五的所有工作日）
   * 用于查询临时理发日（换日标记）
   */
  calculateCandidateDates() {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = today.getDay()

    // 本周五距今天数，下周五 = 本周五 + 7 天
    const daysToThisFriday = (5 - dayOfWeek + 7) % 7
    const nextFriday = new Date(today)
    nextFriday.setDate(today.getDate() + daysToThisFriday + 7)

    const candidates = []
    const cursor = new Date(today)
    while (cursor <= nextFriday) {
      const dow = cursor.getDay()
      if (dow >= 1 && dow <= 5) {
        candidates.push(this.formatLocalDate(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return candidates
  },

  calculateDisplayDates() {
    const now = new Date()
    const currentDayOfWeek = now.getDay() // 0=周日, 5=周五, 6=周六

    // 判断是否应该显示下周：周日 0 点起显示下周
    // （周六仍显示本周的周一/周三/周五，这三天已过，会呈"已过期"状态）
    const shouldShowNextWeek = currentDayOfWeek === 0

    // 计算本周的周一
    const mondayOfThisWeek = new Date(now)
    mondayOfThisWeek.setHours(0, 0, 0, 0)

    if (currentDayOfWeek === 0) {
      // 周日，本周周一是6天前
      mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() - 6)
    } else {
      // 周一到周六，本周周一是 (currentDayOfWeek - 1) 天前
      mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() - (currentDayOfWeek - 1))
    }

    // 根据是否显示下周，确定基准周一
    let baseMonday = new Date(mondayOfThisWeek)
    if (shouldShowNextWeek) {
      baseMonday.setDate(baseMonday.getDate() + 7)
    }

    // 生成周一、周三、周五的日期
    const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    const dayOffsets = [0, 2, 4] // 周一、周三、周五相对于周一的偏移
    const dates = []

    for (const offset of dayOffsets) {
      const targetDate = new Date(baseMonday)
      targetDate.setDate(targetDate.getDate() + offset)

      const year = targetDate.getFullYear()
      const month = targetDate.getMonth() + 1
      const day = targetDate.getDate()
      const dayOfWeek = targetDate.getDay()

      dates.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        weekDay: weekDays[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
        monthDay: `${month}月${day}日`,
        dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]
      })
    }
    return dates
  },

  /**
   * 选择日期
   */
  async handleDateSelect(e) {
    const index = e.currentTarget.dataset.index
    const dateInfo = e.currentTarget.dataset.date
    if (!dateInfo) return

    this.setData({
      selectedDate: dateInfo.date,
      selectedDateIndex: index,
      selectedDateInfo: dateInfo,
      selectedSlot: '',
      selectedSlotDisplay: '',
      slots: []
    })

    // 仅节假日不加载时段；「该日已过去 / 时段已锁定」的日期仍可查看预约情况
    //（旧条件 isDisabled && !isDayLocked 会把招待员的过去日期也挡掉，因为招待员的 isDayLocked 恒为 false）
    if (dateInfo.isHoliday) return

    // 本地生成时段列表
    this.buildSlots(dateInfo)
  },

  /**
   * 本地生成时段列表
   * @param {Object} dateInfo - 日期信息，包含 date 字段
   */
  async buildSlots(dateInfo) {
    // 审核模式：不加载时段数据，直接显示「无可用时段」
    if (this.data.isReviewer) {
      this.setData({
        slots: [],
        slotsMessage: '无可用时段',
        loadingSlots: false
      })
      return
    }

    this.setData({
      loadingSlots: true
    })
    try {
      // 优先复用 loadDisplayDates 已缓存的全量数据，未命中才单独请求
      let bookedData = []
      if (this._slotsByDateCache && this._slotsByDateCache[dateInfo.date]) {
        bookedData = this._slotsByDateCache[dateInfo.date] || []
      } else {
        const res = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'getReservationSlots',
            dates: [dateInfo.date]
          }
        })
        if (res.result.code === 0) {
          bookedData = ((res.result.data && res.result.data.slotsByDate) || {})[dateInfo.date] || []
        }
      }

      // 构建时段列表
      const slots = TIME_SLOTS.map(slot => {
        // 查找该时段的预约信息
        const bookingInfo = bookedData.find(b => b.timeSlot === slot.start)

        // 判断是否为我已预约
        const isMyBooking = bookingInfo &&
          bookingInfo.status === 'booked' &&
          bookingInfo.bookerId === this.data.userOpenId

        // 确定时段状态
        // 日期已锁定（今天过了14:50）或已过去时，未预约的时段不再显示"可预约"
        const isDateUnbookable = !!(dateInfo && (dateInfo.isDayLocked || dateInfo.isDisabled))

        let slotStatus = 'available' // 默认可预约
        let statusLabel = '可预约'

        if (isDateUnbookable) {
          slotStatus = 'unavailable'
          statusLabel = '不可预约'
        }

        if (bookingInfo) {
          if (bookingInfo.status === 'unavailable') {
            slotStatus = 'unavailable'
            statusLabel = '不可预约'
          } else if (isMyBooking) {
            slotStatus = 'myBooked'
            statusLabel = '我已预约'
          } else {
            slotStatus = 'booked'
            statusLabel = '已被预约'
          }
        }

        return {
          ...slot,
          status: slotStatus,
          statusLabel,
          isMyBooking,
          bookingInfo: bookingInfo || null
        }
      })

      this.setData({
        slots,
        slotsMessage: ''
      })
    } catch (error) {
      console.error('加载时段失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        loadingSlots: false
      })
    }
  },

  /**
   * 选择时段（直接弹出预约弹窗）
   */
  handleSlotSelect(e) {
    const slot = e.currentTarget.dataset.slot
    if (!slot) return

    // 当日时段已锁定（普通用户14:50后）
    if (this.data.selectedDateInfo && this.data.selectedDateInfo.isDayLocked) {
      wx.showModal({
        title: '提示',
        content: '当日时段已锁定，请联系招待员',
        showCancel: false
      })
      return
    }

    // 不可预约的时段
    if (slot.status === 'unavailable') return

    // 已被他人预约的时段
    if (slot.status === 'booked') return

    // 我已预约的时段 - 无操作
    if (slot.status === 'myBooked') return

    // 可预约时段 - 弹出预约弹窗
    this.setData({
      selectedSlot: slot.start,
      selectedSlotDisplay: slot.display
    })
    this.showBookingForm()
  },

  /**
   * 取消我的预约（从时段列表）
   */
  async handleCancelMySlot(slot) {
    if (!this.data.isReceptionist && this.data.selectedDateInfo && this.data.selectedDateInfo.isDayLocked) {
      wx.showToast({
        title: '该日期时段已锁定，无法取消',
        icon: 'none'
      })
      return
    }

    const res = await wx.showModal({
      title: '确认取消',
      content: `确定要取消您于 ${this.data.selectedDate} ${slot.display} 的理发预约吗？`,
      confirmText: '确认取消',
      confirmColor: '#DC2626'
    })

    if (!res.confirm) return

    try {
      const result = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'cancelAppointment',
          appointmentId: String(slot.bookingInfo._id)
        }
      })

      if (result.result.code === 0) {
        wx.showToast({
          title: '取消成功',
          icon: 'success'
        })
        this.loadDisplayDates()
      } else {
        wx.showToast({
          title: result.result.message || '取消失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('取消失败:', error)
      wx.showToast({
        title: '取消失败',
        icon: 'none'
      })
    }
  },


  /**
   * 招待员操作时段（点击操作按钮）
   */
  async handleSlotAction(e) {
    const slot = e.currentTarget.dataset.slot
    if (!slot) return

    // 已被他人预约 - 先确认，再进入「选择取消原因」
    // 对话框样式与「设为不可预约」保持一致（标题、文案结构、确认按钮与橙色都相同）
    if (slot.status === 'booked') {
      const res = await wx.showModal({
        title: '取消预约',
        content: `确定取消 ${slot.bookingInfo.appointeeName} 在 ${this.data.selectedDate} ${slot.display} 的理发预约吗？`,
        confirmText: '确认',
        confirmColor: '#EA580C'
      })

      if (!res.confirm) return

      // 确认后再弹出「选择取消原因」，由该弹窗完成最终取消
      this.showCancelSlotPopup(slot)
      return
    }

    // 可预约 - 设为不可预约
    if (slot.status === 'available') {
      const res = await wx.showModal({
        title: '设为不可预约',
        content: `确定将 ${this.data.selectedDate} ${slot.display} 设为不可预约的时段吗？`,
        confirmText: '确认',
        confirmColor: '#EA580C'
      })

      if (!res.confirm) return

      try {
        const result = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'setSlotStatus',
            date: this.data.selectedDate,
            timeSlot: slot.start,
            status: 'unavailable'
          }
        })

        if (result.result.code === 0) {
          wx.showToast({
            title: '设置成功',
            icon: 'success'
          })
          this.loadDisplayDates()
        } else {
          wx.showToast({
            title: result.result.message || '设置失败',
            icon: 'none'
          })
        }
      } catch (error) {
        console.error('设置失败:', error)
        wx.showToast({
          title: '设置失败',
          icon: 'none'
        })
      }
      return
    }

    // 不可预约 - 恢复为可预约
    if (slot.status === 'unavailable') {
      const res = await wx.showModal({
        title: '恢复为可预约',
        content: `确定将 ${this.data.selectedDate} ${slot.display} 恢复为可预约的时段吗？`,
        confirmText: '确认',
        confirmColor: '#10B981'
      })

      if (!res.confirm) return

      try {
        const result = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'setSlotStatus',
            date: this.data.selectedDate,
            timeSlot: slot.start,
            status: 'available'
          }
        })

        if (result.result.code === 0) {
          wx.showToast({
            title: '恢复成功',
            icon: 'success'
          })
          this.loadDisplayDates()
        } else {
          wx.showToast({
            title: result.result.message || '恢复失败',
            icon: 'none'
          })
        }
      } catch (error) {
        console.error('恢复失败:', error)
        wx.showToast({
          title: '恢复失败',
          icon: 'none'
        })
      }
      return
    }

    // 我已预约 - 取消我的预约
    if (slot.status === 'myBooked') {
      this.handleCancelMySlot(slot)
      return
    }
  },

  /**
   * 显示取消预约弹窗（招待员）
   */
  showCancelSlotPopup(e) {
    const slot = e.currentTarget ? e.currentTarget.dataset.slot : e
    if (!slot || slot.status !== 'booked') return

    this.setData({
      showCancelPopup: true,
      cancellingSlot: slot,
      cancelReason: ''
    })
  },

  /**
   * 确认取消预约（招待员）
   */

  /**
   * 显示预约表单
   */
  showBookingForm() {
    this.setData({
      showBookingPopup: true,
      'bookingForm.appointeeName': this.data.userName || ''
    })
  },

  /**
   * 隐藏预约表单
   */
  hideBookingPopup() {
    this._closeModal('showBookingPopup')
  },

  /**
   * 输入姓名
   */
  handleNameInput(e) {
    this.setData({
      'bookingForm.appointeeName': e.detail.value
    })
  },

  /**
   * 提交预约
   */
  async handleBookingSubmit() {
    const {
      appointeeName
    } = this.data.bookingForm
    if (!appointeeName || !appointeeName.trim()) {
      wx.showToast({
        title: '请输入理发人姓名',
        icon: 'none'
      })
      return
    }

    this.setData({
      submitting: true
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'createAppointment',
          appointmentData: {
            date: this.data.selectedDate,
            timeSlot: this.data.selectedSlot,
            appointeeName: appointeeName.trim()
          }
        }
      })

      if (res.result.code === 0) {
        this.hideBookingPopup()
        // 预约成功提示（系统原生 Modal）
        wx.showModal({
          title: '预约成功',
          content: `时段：${this.data.selectedDate} ${this.data.selectedSlotDisplay}\n理发人：${appointeeName.trim()}\n请等待招待员在相应时段与您联系`,
          showCancel: false,
          confirmText: '好的',
          confirmColor: '#EA580C'
        })
        // 刷新时段与日期列表（loadDisplayDates 内部会复用缓存刷新时段）
        this.loadDisplayDates()
      } else {
        wx.showToast({
          title: res.result.message || '预约失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('预约失败:', error)
      wx.showToast({
        title: '预约失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        submitting: false
      })
    }
  },

  // ==================== 换日功能（招待员） ====================

  /**
   * 打开换日日期选择器
   */
  handleOpenChangeDate() {
    const dateInfo = this.data.selectedDateInfo
    if (!dateInfo) return

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayOfWeek = today.getDay()
    const daysToThisFriday = (5 - dayOfWeek + 7) % 7
    const nextFriday = new Date(today)
    nextFriday.setDate(today.getDate() + daysToThisFriday + 7)

    this.setData({
      showChangeDatePicker: true,
      changeDateStart: this.formatLocalDate(today),
      changeDateEnd: this.formatLocalDate(nextFriday),
      changeDateSource: dateInfo.date,
      changeDateTarget: ''
    })
  },

  /**
   * 校验换日目标日期
   * 规则：非过去、非源日期、非周末、本周仅二四、下周为周一至周五
   */
  /**
   * 把 YYYY-MM-DD 转成中文「X年X月X日周X」
   */
  formatChineseDate(dateStr) {
    const info = this.buildDateInfo(dateStr)
    const [year] = dateStr.split('-')
    return `${year}年${info.monthDay}（${info.weekDay}）`
  },

  validateChangeDateTarget(targetDate, sourceDate) {
    const todayStr = this.formatLocalDate(new Date())
    if (targetDate < todayStr) {
      return { ok: false, msg: '目标日期不能早于今天' }
    }
    if (targetDate === sourceDate) {
      return { ok: false, msg: '目标日期不能与当前日期相同' }
    }

    const [y, m, d] = targetDate.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay()

    if (dow === 0 || dow === 6) {
      return { ok: false, msg: '仅可选择工作日' }
    }

    return { ok: true }
  },

  /**
   * 日期选择器确认
   */
  handleChangeDatePicked(e) {
    const targetDate = e.detail.value
    if (!targetDate) return

    const sourceDate = this.data.changeDateSource
    const check = this.validateChangeDateTarget(targetDate, sourceDate)
    if (!check.ok) {
      wx.showToast({ title: check.msg, icon: 'none' })
      return
    }

    this.setData({
      showChangeDatePicker: false,
      changeDateTarget: targetDate,
      changeDateConfirmVisible: true,
      changeDateConfirmInfo: `确认将理发日从${this.formatChineseDate(sourceDate)}调整到${this.formatChineseDate(targetDate)}吗？\n已有的理发预约将同步调整至新日期，部分预约时段可能会顺延调整。`
    })
  },

  /**
   * 取消换日日期选择
   */
  closeChangeDatePicker() {
    this.setData({ showChangeDatePicker: false })
  },

  /**
   * 取消换日二次确认
   */
  closeChangeDateConfirm() {
    this.setData({ changeDateConfirmVisible: false })
  },

  /**
   * 确认换日
   */
  async handleChangeDateConfirm() {
    if (this.data.changingDate) return
    const sourceDate = this.data.changeDateSource
    const targetDate = this.data.changeDateTarget
    if (!sourceDate || !targetDate) return

    this.setData({ changingDate: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'changeDate',
          sourceDate,
          targetDate
        }
      })

      if (res.result.code === 0) {
        this.setData({ changeDateConfirmVisible: false })
        // 换日成功提示（系统原生 Modal）
        wx.showModal({
          title: '理发日调整成功',
          content: `理发日已由${this.formatChineseDate(sourceDate)}改至 ${this.formatChineseDate(targetDate)}，预约（如有）已同步调整至新日期。`,
          showCancel: false,
          confirmText: '好的',
          confirmColor: '#EA580C'
        })
        this.loadDisplayDates()
      } else {
        wx.showToast({ title: res.result.message || '换日失败', icon: 'none' })
      }
    } catch (error) {
      console.error('换日失败:', error)
      wx.showToast({ title: '换日失败', icon: 'none' })
    } finally {
      this.setData({ changingDate: false })
    }
  },

  // ==================== 理发统计 Tab ====================

  /**
   * 加载理发统计（重置分页）
   */
  async loadstatsAppointments() {
    if (!this.data.canView) return

    this.setData({
      loadingstats: true,
      statsList: [],
      statsGrouped: [],
      statsPage: 1,
      statsHasMore: true,
      statsTotalCount: 0,
      statsAllLoaded: false
    })
    await this.fetchStatsAppointments()
  },

  /**
   * 获取理发统计数据（按时间排序时分页，按人员统计时全量获取）
   */
  async fetchStatsAppointments() {
    try {
      const params = {
        sortBy: this.data.sortBy
      }

      // 按时间排序时启用分页（每页 20 条，与项目其它列表页一致）
      if (this.data.sortBy === 'time') {
        params.page = this.data.statsPage
        params.pageSize = STATS_PAGE_SIZE
      }

      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'getAppointments',
          params
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data

        if (this.data.sortBy === 'time') {
          // 按时间排序：分页模式
          const newList = data.list || []
          const hasMore = data.hasMore || false

          // 追加到已有列表（首页替换）
          const mergedList = this.data.statsPage === 1 ?
            newList :
            this.data.statsList.concat(newList)

          this.setData({
            statsTotalCount: data.total || 0,
            statsHasMore: hasMore,
            statsAllLoaded: !hasMore,
            loadingstats: false
          })

          this.processStatsByTime(mergedList)
        } else {
          // 按人员统计：全量获取，一次性聚合
          const allList = data.list || []
          this.setData({
            statsAllLoaded: true,
            statsTotalCount: allList.length,
            statsHasMore: false,
            loadingstats: false
          })
          this.processStatsByName(allList)
        }
      }
    } catch (error) {
      console.error('加载理发统计失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        loadingstats: false
      })
    }
  },

  /**
   * 按时间排序：按月分组，过去日期标记已完成（支持分页追加）
   */
  processStatsByTime(list) {
    const todayStr = this.data.todayStr
    // 按月分组
    const groupMap = {}
    list.forEach(item => {
      const monthKey = item.date.substring(0, 7) // "2026-03"
      if (!groupMap[monthKey]) {
        const [y, m] = monthKey.split('-')
        groupMap[monthKey] = {
          monthKey,
          monthLabel: `${parseInt(y)}年${parseInt(m)}月`,
          items: []
        }
      }
      // 日期在今日之前的标记为已完成
      const isPast = item.status === 'booked' && item.date < todayStr
      groupMap[monthKey].items.push({
        ...item,
        displayStatus: isPast ? 'completed' : item.status
      })
    })

    // 月份倒序排列（最新月份在前）
    const groups = Object.values(groupMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    this.setData({
      statsList: list,
      statsGrouped: groups
    })
  },

  /**
   * 触底加载更多（仅按时间排序时生效）
   */
  async loadMoreStatsAppointments() {
    if (!this.data.statsHasMore || this.data.loadingstats) return
    if (this.data.sortBy !== 'time') return

    this.setData({
      loadingstats: true
    })
    this.setData({
      statsPage: this.data.statsPage + 1
    })
    await this.fetchStatsAppointments()
  },

  /**
   * 按人员统计：按月分组，每月内统计每人理发次数并倒序
   */
  processStatsByName(list) {
    // 只统计非取消的记录
    const activeList = list.filter(item => item.status !== 'cancelled')

    // 按月分组
    const groupMap = {}
    activeList.forEach(item => {
      const monthKey = item.date.substring(0, 7)
      if (!groupMap[monthKey]) {
        const [y, m] = monthKey.split('-')
        groupMap[monthKey] = {
          monthKey,
          monthLabel: `${parseInt(y)}年${parseInt(m)}月`,
          items: []
        }
      }
      // 统计人名和次数
      const existing = groupMap[monthKey].items.find(i => i.appointeeName === item.appointeeName)
      if (existing) {
        existing.count++
      } else {
        groupMap[monthKey].items.push({
          appointeeName: item.appointeeName,
          count: 1
        })
      }
    })

    // 每月内按次数倒序，月份倒序
    const groups = Object.values(groupMap)
    groups.forEach(g => {
      g.items.sort((a, b) => b.count - a.count || a.appointeeName.localeCompare(b.appointeeName, 'zh-CN'))
    })
    groups.sort((a, b) => b.monthKey.localeCompare(a.monthKey))

    this.setData({
      statsList: list,
      statsGrouped: groups
    })
  },

  /**
   * 排序切换
   */
  handleSortChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    if (sortBy === this.data.sortBy) return

    this.setData({
      sortBy
    })
    this.loadstatsAppointments()
  },

  // ==================== 导出统计 PDF（仅办公室内聘） ====================

  /**
   * 按人员统计的全量接口（不分页），导出选择模式需要完整月份列表时复用
   * 与 fetchStatsAppointments 的按人员分支同源，只是不写入页面统计 data
   */
  async fetchAllStatsAppointments() {
    const res = await wx.cloud.callFunction({
      name: 'haircutManager',
      data: {
        action: 'getAppointments',
        params: { sortBy: 'name' }
      }
    })
    const result = res.result || {}
    if (result.code !== 0) {
      throw new Error(result.message || '加载失败')
    }
    return (result.data && result.data.list) || []
  },

  /**
   * 由原始记录生成可选月份列表（口径与页面统计一致：排除已取消）
   * checked 在 JS 侧预计算 —— WXML 不支持 indexOf 调用
   */
  buildExportGroups(list) {
    const map = {}
    ;(list || []).forEach(item => {
      if (item.status === 'cancelled') return
      const monthKey = (item.date || '').substring(0, 7)
      if (!monthKey) return
      if (!map[monthKey]) {
        const [y, m] = monthKey.split('-')
        map[monthKey] = {
          monthKey,
          monthLabel: `${parseInt(y)}年${parseInt(m)}月`,
          count: 0,
          checked: false
        }
      }
      map[monthKey].count++
    })
    return Object.values(map).sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  },

  /**
   * 进入导出选择模式：按月收起条目 + 月份复选框
   * 「按时间排序」是分页的，已加载数据可能缺月份 → 先补拉一份全量再列月份
   */
  async handleStartExport() {
    if (this.data.exporting || this.data.preparingExport) return
    if (!this.data.canExportStats) return

    this.setData({ preparingExport: true })
    wx.showLoading({ title: '准备数据...', mask: true })
    try {
      // 按人员统计时 statsList 本身就是全量，无需额外请求
      const list = this.data.sortBy === 'name'
        ? this.data.statsList
        : await this.fetchAllStatsAppointments()

      const exportGroups = this.buildExportGroups(list)
      wx.hideLoading()
      this.setData({ preparingExport: false })

      if (exportGroups.length === 0) {
        wx.showToast({ title: '暂无可导出的月份', icon: 'none' })
        return
      }
      this.setData({
        exportMode: true,
        exportGroups,
        selectedMonths: []
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ preparingExport: false })
      console.error('准备导出数据失败:', error)
      wx.showToast({ title: '数据加载失败，请重试', icon: 'none' })
    }
  },

  /**
   * 退出导出选择模式
   */
  handleCancelExport() {
    if (this.data.exporting) return
    this.setData({
      exportMode: false,
      exportGroups: [],
      selectedMonths: []
    })
  },

  /**
   * 勾选 / 取消勾选某个月份（可多选）
   */
  handleToggleMonth(e) {
    if (this.data.exporting) return
    const monthKey = e.currentTarget.dataset.monthkey
    if (!monthKey) return

    const selected = [...this.data.selectedMonths]
    const idx = selected.indexOf(monthKey)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(monthKey)
    }
    // 预计算每项 checked，避免 WXML 调用 indexOf
    const exportGroups = this.data.exportGroups.map(g => ({
      ...g,
      checked: selected.indexOf(g.monthKey) >= 0
    }))
    this.setData({ selectedMonths: selected, exportGroups })
  },

  /**
   * 导出选中月份的理发统计 PDF
   */
  async handleExportStats() {
    if (this.data.exporting) return
    const months = this.data.selectedMonths
    if (!months.length) {
      wx.showToast({ title: '请先选择至少一个月份', icon: 'none' })
      return
    }

    this.setData({ exporting: true })
    wx.showLoading({ title: '生成中...', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateOrderPdf',
        data: { type: 'haircutStats', months }
      })
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '生成失败')
      }
      const fileID = result.data && result.data.fileID
      if (!fileID) throw new Error('未获取到文件')

      // 下载并打开 PDF
      const dl = await wx.cloud.downloadFile({ fileID })
      wx.openDocument({
        filePath: dl.tempFilePath,
        fileType: 'pdf',
        showMenu: true,
        success: () => {
          this.setData({
            exportMode: false,
            exportGroups: [],
            selectedMonths: [],
            exporting: false
          })
        },
        fail: () => {
          this.setData({ exporting: false })
          wx.showToast({ title: '打开失败', icon: 'none' })
        }
      })
    } catch (error) {
      wx.hideLoading()
      this.setData({ exporting: false })
      console.error('导出理发统计失败:', error)
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    }
  },

  /**
   * 显示取消弹窗
   */
  showCancelPopup(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      showCancelPopup: true,
      cancellingAppointment: item,
      cancelReason: ''
    })
  },

  /**
   * 隐藏取消弹窗
   */
  hideCancelPopup() {
    this.setData({
      showCancelPopup: false,
      cancellingAppointment: null,
      cancellingSlot: null,
      cancelReason: ''
    })
  },

  /**
   * 选择取消原因
   */
  handleCancelReasonSelect(e) {
    this.setData({
      cancelReason: e.currentTarget.dataset.reason
    })
  },

  /**
   * 确认取消
   */
  async handleConfirmCancel() {
    if (!this.data.cancelReason) {
      wx.showToast({
        title: '请选择取消原因',
        icon: 'none'
      })
      return
    }

    this.setData({
      cancelling: true
    })
    try {
      // 判断是从预约统计列表取消还是从时段列表取消
      if (this.data.cancellingSlot) {
        // 从时段列表取消（招待员）
        const res = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'cancelAppointmentByReceptionist',
            date: this.data.selectedDate,
            timeSlot: this.data.cancellingSlot.start,
            cancelReason: this.data.cancelReason
          }
        })

        if (res.result.code === 0) {
          wx.showToast({
            title: '取消成功',
            icon: 'success'
          })
          this.hideCancelPopup()
          this.loadDisplayDates()
        } else {
          wx.showToast({
            title: res.result.message || '取消失败',
            icon: 'none'
          })
        }
      } else if (this.data.cancellingAppointment) {
        // 从预约统计列表取消
        const res = await wx.cloud.callFunction({
          name: 'haircutManager',
          data: {
            action: 'cancelAppointment',
            appointmentId: this.data.cancellingAppointment._id,
            cancelReason: this.data.cancelReason
          }
        })

        if (res.result.code === 0) {
          wx.showToast({
            title: '取消成功',
            icon: 'success'
          })
          this.hideCancelPopup()
          this.loadstatsAppointments()
        } else {
          wx.showToast({
            title: res.result.message || '取消失败',
            icon: 'none'
          })
        }
      }
    } catch (error) {
      console.error('取消失败:', error)
      wx.showToast({
        title: '取消失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        cancelling: false
      })
    }
  },

  // ==================== 我的预约 Tab ====================

  /**
   * 加载我的预约
   */
  async loadMyAppointments() {
    this.setData({
      loadingMine: true,
      myPage: 1,
      myList: [],
      hasMoreMine: true
    })
    await this.fetchMyAppointments()
  },

  /**
   * 获取我的预约数据
   */
  async fetchMyAppointments() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'getMyAppointments',
          page: this.data.myPage,
          pageSize: 20
        }
      })

      if (res.result.code === 0) {
        const list = res.result.data.list || []
        const total = res.result.data.total || 0
        // 为每条预约标记是否已锁定（已过该日期的14:50）
        const enrichedList = list.map(item => ({
          ...item,
          isDateLocked: this.isDateLocked(item.date),
          displayStatus: item.status === 'booked' && item.date < this.data.todayStr ? 'completed' : item.status
        }))
        this.setData({
          myList: this.data.myList.concat(enrichedList),
          hasMoreMine: this.data.myList.length + enrichedList.length < total
        })
      }
    } catch (error) {
      console.error('加载我的预约失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        loadingMine: false
      })
    }
  },

  /**
   * 加载更多
   */
  async loadMoreMyAppointments() {
    if (!this.data.hasMoreMine || this.data.loadingMine) return

    this.setData({
      myPage: this.data.myPage + 1
    })
    await this.fetchMyAppointments()
  },

  /**
   * 取消我的预约
   */
  async handleCancelMyAppointment(e) {
    const item = e.currentTarget.dataset.item

    // 前端校验：已锁定日期不允许取消（招待员不受限制）
    if (!this.data.isReceptionist && this.isDateLocked(item.date)) {
      wx.showToast({
        title: '该日期时段已锁定，无法取消',
        icon: 'none'
      })
      return
    }

    const res = await wx.showModal({
      title: '确认取消',
      content: `确定要取消您于 ${item.date} ${item.timeSlotDisplay} 的理发预约吗？`,
      confirmText: '确认取消',
      confirmColor: '#DC2626'
    })

    if (!res.confirm) return

    try {
      const result = await wx.cloud.callFunction({
        name: 'haircutManager',
        data: {
          action: 'cancelAppointment',
          appointmentId: item._id
        }
      })

      if (result.result.code === 0) {
        wx.showToast({
          title: '取消成功',
          icon: 'success'
        })
        this.loadMyAppointments()
      } else {
        wx.showToast({
          title: result.result.message || '取消失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('取消失败:', error)
      wx.showToast({
        title: '取消失败',
        icon: 'none'
      })
    }
  },

  // ==================== 工具方法 ====================

  stopPropagation() {
    // 阻止事件冒泡
  }
})