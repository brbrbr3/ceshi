const app = getApp()
const utils = require('../../../common/utils.js')

// 权限缓存 key
const PERMISSION_CACHE_KEY = 'office-permission-cache'
const PERMISSION_CACHE_EXPIRE = 30 * 60 * 1000 // 权限缓存30分钟

// 使用统一的时间格式化函数
const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  data: {
    displayName: '访客',
    greetingText: '欢迎使用Embaixada办公系统',
    currentDateText: '',
    todayTypeText: '今天是工作日',  // 动态显示日期类型
    roleLabel: '待认证用户',
    pendingApprovalCount: 0,
    unreadNotificationCount: 0,
    loading: false,
    currentUser: null,
    // 权限缓存
    permissionCache: {},
    stats: [
      { label: '待审批', value: '0', color: '#F44336', bg: '#FFEBEE' }
    ],
    quickActions: [
      { icon: '🍽️', label: '每周菜单', color: '#16A34A', bg: '#DCFCE7', implemented: true, featureKey: null },
      { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2', implemented: true, featureKey: 'medical_application' },
      { icon: '🚗', label: '外出报备', color: '#2563EB', bg: '#EFF6FF', implemented: true, featureKey: 'trip_report' },
      { icon: '📊', label: '出行管理', color: '#7C3AED', bg: '#F3E8FF', implemented: true, featureKey: 'trip_dashboard' }
    ],
    announcements: [],
    todaySchedules: [],
    loadingSchedules: false,
    // 日程详情弹窗
    showScheduleDetail: false,
    detailSchedule: null
  },

  onShow() {
    this.setData({
      currentDateText: this.getCurrentDateText()
    })
    this.syncUserProfile()
    this.syncNotifications()
    this.loadAnnouncements()
    this.loadPermissionCache()
    this.loadHolidayConfig()
    this.loadTodaySchedules()  // 加载今日日程
  },

  /**
   * 加载权限缓存
   * 批量检查功能权限并存入缓存，提升后续访问性能
   */
  loadPermissionCache() {
    // 从本地存储读取缓存
    try {
      const cached = wx.getStorageSync(PERMISSION_CACHE_KEY)
      if (cached && cached.timestamp && (Date.now() - cached.timestamp < PERMISSION_CACHE_EXPIRE)) {
        this.setData({ permissionCache: cached.permissions || {} })
        console.log('使用缓存的权限信息')
        return
      }
    } catch (e) {
      console.warn('读取权限缓存失败:', e)
    }

    // 显示加载提示
    wx.showToast({
      title: '缓存用户权限中',
      icon: 'loading',
      duration: 2000
    })

    // 批量检查权限
    const featureKeys = ['medical_application', 'trip_report', 'trip_dashboard']
    app.batchCheckPermissions(featureKeys)
      .then((result) => {
        const permissions = {}
        const perms = result.permissions || {}
        featureKeys.forEach(key => {
          permissions[key] = perms[key] ? perms[key].allowed : false
        })

        this.setData({ permissionCache: permissions })

        // 存入本地缓存
        try {
          wx.setStorageSync(PERMISSION_CACHE_KEY, {
            timestamp: Date.now(),
            permissions
          })
          console.log('权限信息已缓存', permissions)
        } catch (e) {
          console.warn('缓存权限信息失败:', e)
        }
        wx.hideToast()
      })
      .catch((error) => {
        console.error('批量检查权限失败:', error)
        wx.hideToast()
      })
  },

  getCurrentDateText() {
    const weekMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    const date = new Date()
    return ` ${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日　${weekMap[date.getDay()]}`
  },

  getGreeting(name) {
    const hour = new Date().getHours()
    const prefix = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'
    return `${prefix}，${name}`
  },

  syncUserProfile() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          wx.reLaunch({
            url: '/pages/auth/login/login'
          })
          return
        }

        const user = result.user
        const roleLabel = user.isAdmin ? `${user.role} · 管理员` : user.role

        this.setData({
          displayName: user.name,
          greetingText: this.getGreeting(user.name),
          roleLabel,
          currentUser: user
        })

        // 获取待审批数量
        return app.callOfficeAuth('getApprovalData')
      })
      .then((data) => {
        if (data && data.summary) {
          const pendingCount = data.summary.pendingCount || 0
          const newStats = [...this.data.stats]
          newStats[0].value = pendingCount
          this.setData({
            pendingApprovalCount: pendingCount,
            stats: newStats
          })
        }
      })
      .catch(() => {
        // 静默失败
      })
      return
  },

  goApprovalTab() {
    wx.switchTab({
      url: '/pages/office/approval/approval'
    })
  },

  requestSubscribeMessage() {
    app.requestSubscribeMessage().then((subscribed) => {
      if (subscribed) {
        utils.showToast({
          title: '订阅成功',
          icon: 'success'
        })
      }
    })
  },

  syncNotifications() {
    // 只加载第一页数据，用于统计未读数量
    app.getNotifications({ page: 1, pageSize: 20 }, function(result) {
      const notifications = result.data || []
      const unreadCount = notifications.filter(function(n) { return !n.read }).length
      this.setData({ unreadNotificationCount: unreadCount })
    }.bind(this))
  },

  goNotifications() {
    wx.navigateTo({
      url: '/pages/office/notifications/notifications'
    })
  },

  loadAnnouncements() {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'announcementManager',
      data: {
        action: 'list',
        params: {
          page: 1,
          pageSize: 3
        }
      }
    }).then(res => {
      const result = res.result
      if (result && result.code === 0) {
        const list = result.data.list || []
        const formattedList = list.map(item => this.formatAnnouncement(item))
        this.setData({
          announcements: formattedList,
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载通知公告失败:', error)
      this.setData({
        loading: false
      })
    })
  },

  formatAnnouncement(item) {
    const typeInfo = this.getAnnouncementTypeInfo(item.type)
    return {
      _id: item._id,
      title: item.title,
      tag: typeInfo.text,
      tagColor: typeInfo.color,
      tagBg: typeInfo.bg,
      time: formatTime(item.publishedAt),
      unread: !item.readUsers || !item.readUsers.includes(app.globalData.openid)
    }
  },

  getAnnouncementTypeInfo(type) {
    const typeMap = {
      'urgent': { text: '紧急', color: '#DC2626', bg: '#FEE2E2' },
      'important': { text: '重要', color: '#D97706', bg: '#FEF3C7' },
      'normal': { text: '通知', color: '#0284C7', bg: '#E0F2FE' }
    }
    return typeMap[type] || typeMap.normal
  },

  goAnnouncements() {
    wx.navigateTo({
      url: '/pages/office/announcement-list/announcement-list'
    })
  },

  handleAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/office/announcement-detail/announcement-detail?id=${id}`
      })
    }
  },

  handleQuickAction(e) {
    const label = e.currentTarget.dataset.label
    const featureKey = e.currentTarget.dataset.feature

    if (label === '每周菜单') {
      wx.navigateTo({
        url: '/pages/office/menus/menus'
      })
    } else if (label === '就医申请') {
      // 统一权限检查
      this.checkAndNavigate('medical_application', '/pages/office/medical-application/medical-application', '就医申请')
    } else if (label === '外出报备') {
      // 统一权限检查
      this.checkAndNavigate('trip_report', '/pages/office/trip-report/trip-report', '外出报备')
    } else if (label === '出行管理') {
      // 统一权限检查
      this.checkAndNavigate('trip_dashboard', '/pages/office/trip-dashboard/trip-dashboard', '出行管理')
    } else {
      utils.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
      })
    }
  },

  /**
   * 统一的权限检查和页面跳转方法
   * @param {string} featureKey 功能权限key
   * @param {string} url 目标页面路径
   * @param {string} featureName 功能名称（用于提示）
   */
  checkAndNavigate(featureKey, url, featureName) {
    // 优先使用缓存权限
    const cachedPermission = this.data.permissionCache[featureKey]
    if (cachedPermission === true) {
      wx.navigateTo({ url })
      return
    }
    
    if (cachedPermission === false) {
      this.showPermissionDenied(featureName)
      return
    }
    
    // 缓存未命中，实时检查权限
    wx.showLoading({ title: '检查权限...', mask: true })
    app.checkPermission(featureKey)
      .then((allowed) => {
        wx.hideLoading()
        // 更新缓存
        const permissionCache = { ...this.data.permissionCache, [featureKey]: allowed }
        this.setData({ permissionCache })
        
        if (allowed) {
          wx.navigateTo({ url })
        } else {
          this.showPermissionDenied(featureName)
        }
      })
      .catch((error) => {
        wx.hideLoading()
        console.error('权限检查失败:', error)
        utils.showToast({ title: '权限检查失败', icon: 'none' })
      })
  },

  /**
   * 显示无权限提示
   */
  showPermissionDenied(featureName) {
    wx.showModal({
      title: '权限提示',
      content: `您没有权限使用「${featureName}」功能`,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  showComingSoon() {
    utils.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none'
    })
  },

  /**
   * 跳转到日历页面
   */
  goCalendar() {
    wx.navigateTo({
      url: '/pages/office/calendar/calendar'
    })
  },

  /**
   * 加载节假日配置并判断今天类型
   */
  async loadHolidayConfig() {
    try {
      const currentYear = new Date().getFullYear()
      const res = await wx.cloud.callFunction({
        name: 'holidayManager',
        data: {
          action: 'getByYear',
          params: { year: currentYear }
        }
      })

      let holidayDates = []
      if (res.result.code === 0 && res.result.data.exists) {
        holidayDates = res.result.data.config.dates || []
      }

      // 判断今天类型
      const todayType = this.getTodayType(holidayDates)
      this.setData({ todayTypeText: todayType })
    } catch (error) {
      console.error('加载节假日配置失败:', error)
      // 使用默认判断（只判断周末）
      const todayType = this.getTodayType([])
      this.setData({ todayTypeText: todayType })
    }
  },

  /**
   * 判断今天的类型
   * @param {Array} holidayDates 节假日日期数组 ['2026-01-01', ...]
   * @returns {String} 今天类型描述
   */
  getTodayType(holidayDates) {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=周日, 6=周六
    // 使用本地日期字符串，与picker保持一致（避免时区转换问题）
    const todayStr = utils.getLocalDateString()

    // 先检查是否是法定节假日
    if (holidayDates.includes(todayStr)) {
      return '今天是法定节假日'
    }

    // 再检查是否是周末
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return '今天是公休日'
    }

    // 工作日
    return '今天是工作日'
  },

  /**
   * 加载今日订阅日程
   */
  loadTodaySchedules() {
    this.setData({ loadingSchedules: true })

    wx.cloud.callFunction({
      name: 'scheduleManager',
      data: {
        action: 'getTodaySubscriptions'
      }
    }).then(res => {
      if (res.result.code === 0) {
        this.setData({
          todaySchedules: res.result.data.list,
          loadingSchedules: false
        })
      } else {
        throw new Error(res.result.message)
      }
    }).catch(err => {
      console.error('加载今日日程失败:', err)
      this.setData({
        loadingSchedules: false,
        todaySchedules: []
      })
    })
  },

  /**
   * 点击日程条目
   */
  handleScheduleTap(e) {
    const schedule = e.currentTarget.dataset.schedule
    if (!schedule) return

    this.setData({
      showScheduleDetail: true,
      detailSchedule: schedule
    })
  },

  /**
   * 隐藏日程详情弹窗
   */
  hideScheduleDetail() {
    this.setData({ showScheduleDetail: false })
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {},

  /**
   * 取消订阅
   */
  handleUnsubscribe() {
    const schedule = this.data.detailSchedule
    if (!schedule) return

    wx.showModal({
      title: '确认取消订阅',
      content: `确定要取消订阅「${schedule.title}」吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '取消订阅...', mask: true })

          wx.cloud.callFunction({
            name: 'scheduleManager',
            data: {
              action: 'unsubscribe',
              params: { scheduleId: schedule.scheduleId || schedule._id }
            }
          }).then(res => {
            wx.hideLoading()
            if (res.result.code === 0) {
              // 从列表中移除
              const todaySchedules = this.data.todaySchedules.filter(
                s => (s.scheduleId || s._id) !== (schedule.scheduleId || schedule._id)
              )
              this.setData({
                todaySchedules,
                showScheduleDetail: false,
                detailSchedule: null
              })
              wx.showToast({ title: '已取消订阅', icon: 'success' })
            } else {
              wx.showToast({ title: res.result.message, icon: 'none' })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error('取消订阅失败:', err)
            wx.showToast({ title: '操作失败', icon: 'none' })
          })
        }
      }
    })
  }
})