const app = getApp()
const utils = require('../../../common/utils.js')
// 使用统一的时间格式化函数
const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  data: {
    displayName: '访客',
    greetingText: '欢迎使用Embaixada办公系统',
    currentDateText: '',
    todayTypeText: '今天是工作日', // 动态显示日期类型
    roleLabel: '待认证用户',
    pendingApprovalCount: 0,
    unreadNotificationCount: 0,
    loading: false,
    currentUser: null,
    // 权限缓存
    permissionCache: {},
    stats: [{
      label: '待审批',
      value: '0'
    }],
    quickActions: [{
        icon: '🍽️',
        label: '每周菜单',
        color: '#16A34A',
        bg: '#DCFCE7',
        implemented: true,
        featureKey: null
      },
      {
        icon: '🍱',
        label: '餐食管理',
        color: '#16A34A',
        bg: '#DCFCE7',
        implemented: true,
        featureKey: 'meal_management'
      },
      {
        icon: '🛴',
        label: '外出报备',
        color: '#2563EB',
        bg: '#EFF6FF',
        implemented: true,
        featureKey: 'trip_report'
      },
      {
        icon: '📊',
        label: '出行数据板',
        color: '#7C3AED',
        bg: '#F3E8FF',
        implemented: true,
        featureKey: 'trip_dashboard'
      },
      {
        icon: '🏥',
        label: '就医申请',
        color: '#EF4444',
        bg: '#FEE2E2',
        implemented: true,
        featureKey: 'medical_application'
      },
      {
        icon: '🏢',
        label: '会议室预约',
        color: '#7C5CFC',
        bg: '#E8E4FF',
        implemented: true,
        featureKey: 'meeting_room'
      },
      {
        icon: '💈',
        label: '理发预约',
        color: '#EA580C',
        bg: '#FFF7ED',
        implemented: true,
        featureKey: 'haircut_appointment'
      },
      {
        icon: '🛂',
        label: '护照管理',
        color: '#D97706',
        bg: '#FEF3C7',
        implemented: true,
        featureKey: 'passport_application'
      },
      {
        icon: '🔧',
        label: '物业报修',
        color: '#8B6F47',
        bg: '#FDF3E1',
        implemented: true,
        featureKey: null
      },
      {
        icon: '🚗',
        label: '购车管理',
        color: '#0891B2',
        bg: '#ECFEFF',
        implemented: true,
        featureKey: 'car_purchase'
      },
      {
        icon: 'ℹ️',
        label: '常用信息',
        color: '#0891B2',
        bg: '#E8E4FF',
        implemented: true,
        featureKey: 'arrival_guide'
      }
    ],
    announcements: [],
    articles: [],
    loadingArticles: false,
    todaySchedules: [],
    loadingSchedules: false,
    // 群团活动
    activities: [],
    loadingActivities: false,
    // 日程详情弹窗
    showScheduleDetail: false,
    detailSchedule: null,
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    this.setData({
      currentDateText: this.getCurrentDateText()
    })
    this.syncUserProfile() //同步用户资料
    this.syncNotifications() //同步消息推送
    this.loadAnnouncements() //加载通知公告
    this.loadArticles() //加载学习园地
    this.loadActivities() //加载群团活动
    this.loadPermissionCache() //加载权限缓存
    this.loadHolidayConfig() //加载节假日配置
    this.loadTodaySchedules() // 加载今日日程
    app.updateCacheVersionAndShowWhatsNew() //更新缓存版本号，展示更新说明弹窗
    this.loadSignature()
  },

  /**
   * 加载用户是否有签名，没有则提示配置
   */
  loadSignature() {
    // 已提示过则不再弹窗
    if (app.globalData.signaturePrompted) return

    const db = wx.cloud.database()
    db.collection('user_signatures')
      .orderBy('index', 'asc')
      .limit(2)
      .get()
      .then(res => {
        const signatures = (res.data || []).map(item => ({
          ...item
        }))
        this.setData({
          signatures,
          signatureLoaded: true
        })
        // 仅对需要签名的角色提示，且签名数量为0且本次启动未提示过
        const needSignatureRoles = ['馆领导', '部门负责人', '馆员', '工勤']
        const userRole = (this.data.currentUser && this.data.currentUser.role) || (app.globalData.userProfile && app.globalData.userProfile.role) || ''
        if (signatures.length === 0 && needSignatureRoles.includes(userRole) && !app.globalData.signaturePrompted) {
          app.globalData.signaturePrompted = true
          wx.showModal({
            title: '提示',
            content: '您还未配置签名，部分审批流程需要签名，是否前往配置？',
            confirmText: '去配置',
            cancelText: '稍后',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({
                  url: '/pages/office/signature-manage/signature-manage'
                })
              }
            }
          })
        }
      })
      .catch(err => {
        console.error('加载签字失败', err)
      })
  },

  /**
   * 加载权限缓存
   * 批量检查功能权限并存入缓存，提升后续访问性能
   */
  loadPermissionCache() {
    // 先检查是否已有有效缓存
    const cached = app.getPermissionCache()
    if (cached) {
      this.setData({
        permissionCache: cached
      })
      console.log('权限缓存已存在，跳过加载')
      return
    }

    // 显示加载提示
    wx.showToast({
      title: '缓存用户权限中',
      icon: 'loading',
      duration: 2000
    })

    // 批量检查权限
    const featureKeys = ['medical_application', 'trip_report', 'trip_dashboard', 'meeting_room', 'passport_application', 'meal_management', 'car_purchase']
    app.loadPermissionCache(featureKeys)
      .then((permissions) => {
        this.setData({
          permissionCache: permissions
        })
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
    const prefix = hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : hour < 22 ? '晚上好' : '夜深了~早点休息'
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

        // 待赴任馆员跳转到馆指南页
        if (user.role === '待赴任馆员') {
          wx.reLaunch({
            url: '/pages/office/arrival-guide/arrival-guide'
          })
          return
        }

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
    app.getNotifications({
      page: 1,
      pageSize: 20
    }, function (result) {
      const notifications = result.data || []
      const unreadCount = notifications.filter(function (n) {
        return !n.read
      }).length
      this.setData({
        unreadNotificationCount: unreadCount
      })
    }.bind(this))
  },

  goNotifications() {
    wx.navigateTo({
      url: '/pages/office/notifications/notifications'
    })
  },

  loadAnnouncements() {
    this.setData({
      loading: true
    })

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
      'urgent': {
        text: '紧急',
        color: '#DC2626',
        bg: '#FEE2E2'
      },
      'important': {
        text: '重要',
        color: '#D97706',
        bg: '#FEF3C7'
      },
      'normal': {
        text: '通知',
        color: '#0284C7',
        bg: '#E0F2FE'
      }
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

  loadArticles() {
    this.setData({
      loadingArticles: true
    })

    wx.cloud.callFunction({
      name: 'articleManager',
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
        const list = (result.data.list || []).map(item => ({
          _id: item._id,
          title: item.title,
          authorName: item.authorName,
          time: formatTime(item.createdAt),
          isPinned: item.isPinned || false
        }))
        this.setData({
          articles: list,
          loadingArticles: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载学习园地失败:', error)
      this.setData({
        loadingArticles: false
      })
    })
  },

  goLearning() {
    wx.navigateTo({
      url: '/pages/office/learning-list/learning-list'
    })
  },

  handleArticleTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/office/learning-detail/learning-detail?id=${id}`
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
    } else if (label === '出行数据板') {
      // 统一权限检查
      this.checkAndNavigate('trip_dashboard', '/pages/office/trip-dashboard/trip-dashboard', '出行数据板')
    } else if (label === '会议室预约') {
      // 统一权限检查
      this.checkAndNavigate('meeting_room', '/pages/office/meeting-room/meeting-room', '会议室预约')
    } else if (label === '护照管理') {
      // 统一权限检查
      this.checkAndNavigate('passport_application', '/pages/office/passport/passport', '护照管理')
    } else if (label === '餐食管理') {
      // 统一权限检查
      this.checkAndNavigate('meal_management', '/pages/office/meal-management/meal-management', '餐食管理')
    } else if (label === '理发预约') {
      // 全体用户可用，无需权限检查
      wx.navigateTo({
        url: '/pages/office/haircut/haircut'
      })
    } else if (label === '物业报修') {
      // 全体用户可用，无需权限检查
      wx.navigateTo({
        url: '/pages/office/repair/repair'
      })
    } else if (label === '购车管理') {
      // 统一权限检查
      this.checkAndNavigate('car_purchase', '/pages/office/car-purchase/car-purchase', '购车管理')
    } else if (label === '常用信息') {
      // 全体用户可用，无需权限检查
      wx.navigateTo({
        url: '/pages/office/arrival-guide/arrival-guide'
      })
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
      wx.navigateTo({
        url
      })
      return
    }

    if (cachedPermission === false) {
      this.showPermissionDenied(featureName)
      return
    }

    // 缓存未命中，实时检查权限
    wx.showLoading({
      title: '检查权限...',
      mask: true
    })
    app.checkPermission(featureKey)
      .then((allowed) => {
        wx.hideLoading()
        // 更新缓存
        const permissionCache = {
          ...this.data.permissionCache,
          [featureKey]: allowed
        }
        this.setData({
          permissionCache
        })

        if (allowed) {
          wx.navigateTo({
            url
          })
        } else {
          this.showPermissionDenied(featureName)
        }
      })
      .catch((error) => {
        wx.hideLoading()
        console.error('权限检查失败:', error)
        utils.showToast({
          title: '权限检查失败',
          icon: 'none'
        })
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
          params: {
            year: currentYear
          }
        }
      })

      let holidayDates = []
      if (res.result.code === 0 && res.result.data.exists) {
        holidayDates = res.result.data.config.dates || []
      }

      // 判断今天类型
      const todayType = this.getTodayType(holidayDates)
      this.setData({
        todayTypeText: todayType
      })
    } catch (error) {
      console.error('加载节假日配置失败:', error)
      // 使用默认判断（只判断周末）
      const todayType = this.getTodayType([])
      this.setData({
        todayTypeText: todayType
      })
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
    this.setData({
      loadingSchedules: true
    })

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
    this.setData({
      showScheduleDetail: false
    })
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
          wx.showLoading({
            title: '取消订阅...',
            mask: true
          })

          wx.cloud.callFunction({
            name: 'scheduleManager',
            data: {
              action: 'unsubscribe',
              params: {
                scheduleId: schedule.scheduleId || schedule._id
              }
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
              wx.showToast({
                title: '已取消订阅',
                icon: 'success'
              })
            } else {
              wx.showToast({
                title: res.result.message,
                icon: 'none'
              })
            }
          }).catch(err => {
            wx.hideLoading()
            console.error('取消订阅失败:', err)
            wx.showToast({
              title: '操作失败',
              icon: 'none'
            })
          })
        }
      }
    })
  },

  // ========== 群团活动 ==========

  /**
   * 加载首页活动列表（最多3条）
   */
  loadActivities() {
    this.setData({
      loadingActivities: true
    })

    wx.cloud.callFunction({
      name: 'activityManager',
      data: {
        action: 'list',
        params: {
          page: 1,
          pageSize: 3,
          status: 'active'
        }
      }
    }).then(res => {
      const result = res.result
      if (result && result.code === 0) {
        const allList = result.data.list || []
        // 根据当前用户角色过滤不可见活动（只对目标用户展示的活动）
        const filteredList = this._filterActivitiesByPermission(allList)

        const now = Date.now()
        const list = filteredList.map(item => {
          // 状态完全由截止日期决定：过了截止时间就是已结束
          const isEnded = !!(item.registrationDeadline && item.registrationDeadline < now)
          return {
            _id: item._id,
            title: item.title,
            creatorName: item.creatorName,
            timeText: formatTime(item.createdAt),
            registrationCount: item.registrationCount || 0,
            status: isEnded ? 'ended' : item.status
          }
        })
        this.setData({
          activities: list,
          loadingActivities: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载活动失败:', error)
      this.setData({
        loadingActivities: false
      })
    })
  },

  /**
   * 跳转活动列表页
   */
  goActivities() {
    wx.navigateTo({
      url: '/pages/office/activity-list/activity-list'
    })
  },

  /**
   * 根据当前用户角色过滤活动（只对目标用户展示的活动对非目标用户隐藏）
   */
  _filterActivitiesByPermission(activityList) {
    const user = app.globalData && app.globalData.userProfile

    return activityList.filter(item => {
      if (!item.isTargetOnlyVisible) return true
      if (!item.isTargetRoleEnabled) return true
      if (!item.targetRoles || item.targetRoles.length === 0) return true
      if (!user || !user.role) return false
      return item.targetRoles.includes(user.role)
    })
  },

  /**
   * 点击活动卡片条目
   */
  handleActivityTap(e) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({
        url: `/pages/office/activity-detail/activity-detail?id=${id}`
      })
    }
  }
})