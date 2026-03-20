const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    userName: '未登录用户',
    roleLabel: '点击登录后查看资料',
    primaryTag: '微信身份',
    secondaryTag: '状态：未注册',
    avatarText: 'CHN',
    userAvatarUrl: '',
    isAdmin: false,
    stats: [
      { label: '本月出勤（占位）', value: '7天', icon: '📅' },
      { label: '年假余额（占位）', value: '8天', icon: '🏖️' },
      { label: '绩效得分（占位）', value: '92分', icon: '⭐' }
    ],
    quickInfo: [
      { title: '今日工作时长（占位）', value: '7h 32m', desc: '08:52 上班 · 在岗中', icon: '📈', valueColor: '#2563EB' },
      { title: '积分余额（占位）', value: '1,280', desc: '本月获得 +100', icon: '✨', valueColor: '#FF9800' }
    ],
    menuGroups: [
      {
        title: '工作记录（占位）',
        items: [
          { icon: '📅', label: '考勤记录（占位）' },
          { icon: '📊', label: '工作报告（占位）', badge: '3 条未读' },
          { icon: '💰', label: '薪酬明细（占位）' },
          { icon: '🎯', label: '绩效评估（占位）' }
        ]
      },
      {
        title: '个人设置',
        items: [
          { icon: '👤', label: '修改个人信息' },
          { icon: '🔔', label: '消息通知' },
          { icon: '🔒', label: '账号安全（占位）' },
          { icon: '❓', label: '帮助中心（占位）' },
          { icon: '⭐', label: '意见反馈（占位）' }
        ]
      }
    ],
    companyInfo: [
      { label: '出生日期', value: '未填写' },
      { label: '角色', value: '待认证' },
      { label: '管理员', value: '否' }
    ]
  },

  onShow() {
    this.syncUserProfile()
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
        const companyInfo = [
          { label: '出生日期', value: user.birthday || '未填写' },
          { label: '角色', value: user.role || '未设置' },
          { label: '管理员', value: user.isAdmin ? '是' : '否' }
        ]

        // 如果有岗位信息，添加到信息卡片中
        if (user.position && user.position !== '无') {
          companyInfo.splice(2, 0, { label: '岗位', value: user.position })
        }

        // 如果有部门信息，添加到信息卡片中
        if (user.department) {
          companyInfo.splice(companyInfo.length - 1, 0, { label: '部门', value: user.department })
        }

        // 如果有亲属信息，添加到信息卡片中
        if (user.relativeName) {
          companyInfo.splice(companyInfo.length - 1, 0, { label: '亲属', value: user.relativeName })
        }

        this.setData({
          userName: user.name,
          roleLabel: user.isAdmin ? `${user.role} · 管理员` : user.role,
          primaryTag: user.isAdmin ? '管理员' : '普通用户',
          secondaryTag: '状态：已通过',
          avatarText: (user.avatarText || user.name || '智').slice(0, 1),
          isAdmin: !!user.isAdmin,
          companyInfo
        })
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
      })
  },

  handleLogout() {
    app.logout()
    utils.showToast({
      title: '已退出',
      icon: 'success'
    })
    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/auth/login/login'
      })
    }, 200)
  },

  showComingSoon() {
    utils.showToast({
      title: '功能开发中，敬请期待',
      icon: 'none'
    })
  },

  handleMenuTap(e) {
    const label = e.currentTarget.dataset.label
    if (label === '修改个人信息') {
      wx.navigateTo({
        url: '/pages/office/profile/edit-profile/edit-profile'
      })
    } else if (label === '消息通知') {
      wx.navigateTo({
        url: '/pages/office/notifications/notifications'
      })
    } else {
      utils.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
      })
    }
  }
})
