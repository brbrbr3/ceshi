const app = getApp()

Page({
  data: {
    userName: '未登录用户',
    roleLabel: '点击登录后查看资料',
    primaryTag: '微信身份',
    secondaryTag: '状态：未注册',
    avatarText: '智',
    isAdmin: false,
    stats: [
      { label: '本月出勤', value: '7天', icon: '📅' },
      { label: '年假余额', value: '8天', icon: '🏖️' },
      { label: '绩效得分', value: '92分', icon: '⭐' }
    ],
    quickInfo: [
      { title: '今日工作时长', value: '7h 32m', desc: '08:52 上班 · 在岗中', icon: '📈', valueColor: '#2563EB' },
      { title: '积分余额', value: '1,280', desc: '本月获得 +100', icon: '✨', valueColor: '#FF9800' }
    ],
    menuGroups: [
      {
        title: '工作记录',
        items: [
          { icon: '📅', label: '考勤记录' },
          { icon: '📊', label: '工作报告', badge: '3 条未读' },
          { icon: '💰', label: '薪酬明细' },
          { icon: '🎯', label: '绩效评估' }
        ]
      },
      {
        title: '个人设置',
        items: [
          { icon: '🔔', label: '消息通知' },
          { icon: '🔒', label: '账号安全' },
          { icon: '❓', label: '帮助中心' },
          { icon: '⭐', label: '意见反馈' }
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
        this.setData({
          userName: user.name,
          roleLabel: user.isAdmin ? `${user.role} · 管理员` : user.role,
          primaryTag: user.isAdmin ? '管理员账号' : '微信身份',
          secondaryTag: '状态：已通过',
          avatarText: (user.avatarText || user.name || '智').slice(0, 1),
          isAdmin: !!user.isAdmin,
          companyInfo: [
            { label: '出生日期', value: user.birthday || '未填写' },
            { label: '角色', value: user.role || '未设置' },
            { label: '管理员', value: user.isAdmin ? '是' : '否' }
          ]
        })
      })
      .catch((error) => {
        wx.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
      })
  },

  handleLogout() {
    app.logout()
    wx.showToast({
      title: '已退出',
      icon: 'success'
    })
    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/auth/login/login'
      })
    }, 200)
  }
})
