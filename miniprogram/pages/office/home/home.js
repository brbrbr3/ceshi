const app = getApp()
const util = require('../../../util/util.js')

Page({
  data: {
    displayName: '访客',
    greetingText: '欢迎使用智汇办公',
    currentDateText: '',
    roleLabel: '待认证用户',
    pendingApprovalCount: 3,
    unreadNotificationCount: 0,
    stats: [
      { label: '待审批', value: '5', color: '#F44336', bg: '#FFEBEE' },
      { label: '待办事项', value: '12', color: '#FF9800', bg: '#FFF3E0' },
      { label: '本月出勤', value: '7天', color: '#4CAF50', bg: '#E8F5E9' },
      { label: '绩效得分', value: '92', color: '#2563EB', bg: '#EFF6FF' }
    ],
    quickActions: [
      { icon: '📅', label: '打卡签到', color: '#4CAF50', bg: '#E8F5E9' },
      { icon: '📋', label: '发起审批', color: '#FF9800', bg: '#FFF3E0' },
      { icon: '📢', label: '公告通知', color: '#9C27B0', bg: '#F3E5F5' },
      { icon: '📊', label: '工作报告', color: '#00BCD4', bg: '#E0F7FA' },
      { icon: '💬', label: '企业通讯', color: '#F44336', bg: '#FFEBEE' },
      { icon: '📁', label: '云端文档', color: '#FF5722', bg: '#FBE9E7' },
      { icon: '🗓️', label: '日程安排', color: '#3F51B5', bg: '#E8EAF6' },
      { icon: '🎯', label: '任务中心', color: '#795548', bg: '#EFEBE9' }
    ],
    approvals: [
      { name: '张晓明', dept: '技术部', type: '请假申请', time: '30分钟前', avatar: '张', avatarBg: '#4CAF50' },
      { name: '李婷婷', dept: '市场部', type: '费用报销', time: '1小时前', avatar: '李', avatarBg: '#FF9800' },
      { name: '王建国', dept: '销售部', type: '出差申请', time: '2小时前', avatar: '王', avatarBg: '#9C27B0' }
    ],
    announcements: [
      { tag: '重要', tagColor: '#F44336', tagBg: '#FFEBEE', title: '关于 2026 年 Q1 绩效考核通知', time: '今天 09:30', unread: true },
      { tag: '通知', tagColor: '#FF9800', tagBg: '#FFF3E0', title: '3 月份团建活动报名截止时间提醒', time: '昨天 14:20', unread: true },
      { tag: '公告', tagColor: '#9C27B0', tagBg: '#F3E5F5', title: '办公系统升级维护公告（3 月 15 日）', time: '03-08', unread: false }
    ],
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
    this.requestSubscribeMessage()
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
          roleLabel,
          pendingApprovalCount: this.data.approvals.length
        })
      })
      .catch((error) => {
        util.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
      })
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
    app.getNotifications(function(notifications) {
      const unreadCount = notifications.filter(function(n) { return !n.read }).length
      this.setData({ unreadNotificationCount: unreadCount })
    }.bind(this))
  },

  goNotifications() {
    wx.navigateTo({
      url: '/pages/office/notifications/notifications'
    })
  }
})
