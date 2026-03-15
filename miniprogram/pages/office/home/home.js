const app = getApp()
const util = require('../../../util/util.js')

// 使用统一的时间格式化函数
const formatTime = util.formatTimeToGMT3

Page({
  data: {
    displayName: '访客',
    greetingText: '欢迎使用Embaixada办公系统',
    currentDateText: '',
    roleLabel: '待认证用户',
    pendingApprovalCount: 0,
    unreadNotificationCount: 0,
    loading: false,
    stats: [
      { label: '待审批', value: '0', color: '#F44336', bg: '#FFEBEE' },
      { label: '待办事项', value: '12', color: '#FF9800', bg: '#FFF3E0' },
      { label: '本月出勤', value: '7天', color: '#4CAF50', bg: '#E8F5E9' },
      { label: '绩效得分', value: '92', color: '#2563EB', bg: '#EFF6FF' }
    ],
    quickActions: [
      { icon: '🍽️', label: '每周菜单', color: '#16A34A', bg: '#DCFCE7', implemented: true },
      { icon: '🏥', label: '就医申请', color: '#EF4444', bg: '#FEE2E2', implemented: true },
      { icon: '📅', label: '打卡签到', color: '#94A3B8', bg: '#F1F5F9', implemented: false },
      { icon: '📊', label: '工作报告', color: '#94A3B8', bg: '#F1F5F9', implemented: false },
      { icon: '💬', label: '企业通讯', color: '#94A3B8', bg: '#F1F5F9', implemented: false },
      { icon: '📁', label: '云端文档', color: '#94A3B8', bg: '#F1F5F9', implemented: false },
      { icon: '🎯', label: '任务中心', color: '#94A3B8', bg: '#F1F5F9', implemented: false }
    ],
    approvals: [
      { name: '张晓明', dept: '技术部', type: '请假申请', time: '30分钟前', avatar: '张', avatarBg: '#4CAF50' },
      { name: '李婷婷', dept: '市场部', type: '费用报销', time: '1小时前', avatar: '李', avatarBg: '#FF9800' },
      { name: '王建国', dept: '销售部', type: '出差申请', time: '2小时前', avatar: '王', avatarBg: '#9C27B0' }
    ],
    announcements: [],
    schedules: [
      { time: '10:00', title: '产品周会', type: '会议', color: '#7C3AED', bg: '#F3E8FF' },
      { time: '14:00', title: 'Q1 季度总结汇报', type: '汇报', color: '#0891B2', bg: '#E0F2FE' },
      { time: '16:30', title: '新项目启动会', type: '会议', color: '#059669', bg: '#D1FAE5' }
    ]
  },

  onShow() {
    this.setData({
      currentDateText: this.getCurrentDateText()
    })
    this.syncUserProfile()
    this.syncNotifications()
    this.loadAnnouncements()
  },

  getCurrentDateText() {
    const weekMap = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    const date = new Date()
    return `今天是 ${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 · ${weekMap[date.getDay()]}`
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

        const roleLabel = result.user.isAdmin ? `${result.user.role} · 管理员` : result.user.role
        this.setData({
          displayName: result.user.name,
          greetingText: this.getGreeting(result.user.name),
          roleLabel
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
        util.showToast({
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
    if (label === '每周菜单') {
      wx.navigateTo({
        url: '/pages/office/menus/menus'
      })
    } else if (label === '就医申请') {
      // 使用统一的权限检查
      app.checkPermission('medical_application')
        .then((hasPermission) => {
          if (hasPermission) {
            wx.navigateTo({
              url: '/pages/office/medical-application/medical-application'
            })
          } else {
            // 获取详细的权限信息
            app.getPermissionInfo('medical_application')
              .then((permInfo) => {
                const message = permInfo.feature ? permInfo.feature.message : '您没有权限使用此功能'
                wx.showModal({
                  title: '权限提示',
                  content: message,
                  showCancel: false,
                  confirmText: '我知道了'
                })
              })
              .catch(() => {
                wx.showToast({
                  title: '您没有权限使用此功能',
                  icon: 'none'
                })
              })
          }
        })
        .catch((error) => {
          console.error('权限检查失败:', error)
          // 权限检查失败时，允许访问（向后兼容）
          wx.navigateTo({
            url: '/pages/office/medical-application/medical-application'
          })
        })
    } else {
      util.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
      })
    }
  },

  showComingSoon() {
    util.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none'
    })
  }
})
