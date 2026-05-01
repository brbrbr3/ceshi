const app = getApp()
const utils = require('../../../common/utils.js')
const config = require('../../../config.js')

Page({
  data: {
    version: config.CACHE_VERSION,
    userName: '未登录用户',
    roleLabel: '点击登录后查看资料',
    primaryTag: '微信身份',
    secondaryTag: '状态：未注册',
    avatarStatusClass: 'status-offline',
    avatarText: 'CHN',
    userAvatarUrl: '',
    isAdmin: false,

    stats: [{
        label: '本月出勤（占位）',
        value: '7天',
        icon: '📅'
      },
      {
        label: '年假余额（占位）',
        value: '8天',
        icon: '🏖️'
      },
      {
        label: '绩效得分（占位）',
        value: '92分',
        icon: '⭐'
      }
    ],
    quickInfo: [{
        title: '今日工作时长（占位）',
        value: '7h 32m',
        desc: '08:52 上班 · 在岗中',
        icon: '📈',
        valueColor: '#2563EB'
      },
      {
        title: '积分余额（占位）',
        value: '1,280',
        desc: '本月获得 +100',
        icon: '✨',
        valueColor: '#FF9800'
      }
    ],
    menuGroups: [{
        title: '系统设置',
        items: [{
            icon: 'Aa',
            label: '字体大小'
          },
          {
            icon: '🗂️',
            label: '岗位配置'
          }
        ]
      },
      {
        title: '个人设置',
        items: [{
            icon: '🔔',
            label: '消息中心'
          },
          {
            icon: '✍️',
            label: '签字管理'
          },
          {
            icon: '👤',
            label: '修改个人信息'
          },
          {
            icon: '❓',
            label: '帮助中心'
          },
          {
            icon: '💬',
            label: '意见反馈'
          }
        ]
      }
    ],
    companyInfo: [{
        label: '出生日期',
        value: '未填写'
      },
      {
        label: '角色',
        value: '待认证'
      },
      {
        label: '管理员',
        value: '否'
      }
    ],
    fontsizeOptions: ['小', '正常', '大', '特大'],
    fontscaleValues: [1, 1.1, 1.2, 1.4],
    selectedFontsizeStepperIndex: 1, //默认‘正常’
  },

  onShow() {
    //字体缩放，并记录设置
    const fontScale = app.globalData.fontScale || 1.1
    const fontStyle = app.globalData.fontStyle
    const scaleIndex = this.data.fontscaleValues.indexOf(fontScale)
    this.setData({
      fontScale,
      fontStyle,
      selectedFontsizeStepperIndex: scaleIndex >= 0 ? scaleIndex : 1
    })
    this.syncUserProfile()
    this.syncNotifications()
  },

  decreaseFontsizeStepper(e) {
    // 阻止冒泡到 handleMenuTap
    const idx = this.data.selectedFontsizeStepperIndex
    if (idx <= 0) return
    this.applyFontscaleStepper(idx - 1)
  },

  increaseFontsizeStepper(e) {
    const idx = this.data.selectedFontsizeStepperIndex
    if (idx >= this.data.fontscaleValues.length - 1) return
    this.applyFontscaleStepper(idx + 1)
  },

  applyFontscaleStepper(index) {
    const scale = this.data.fontscaleValues[index]
    const fontStyle = app.generateFontStyle(scale)
    this.setData({
      selectedFontsizeStepperIndex: index,
      fontScale: scale,
      fontStyle
    })
    app.globalData.fontScale = scale
    app.globalData.fontStyle = fontStyle
    try {
      wx.setStorageSync('app-fontsize-cache', {
        scale
      })
    } catch (e) {}
  },

  async syncUserProfile() {
    try {
      const result = await app.checkUserRegistration({
        forceRefresh: true
      })
      if (!result.registered || !result.user) {
        wx.reLaunch({
          url: '/pages/auth/login/login'
        })
        return
      }

      const user = result.user
      const companyInfo = [{
          label: '出生日期',
          value: user.birthday || '未填写'
        },
        {
          label: '角色',
          value: user.role || '未设置'
        },
        {
          label: '管理员',
          value: user.isAdmin ? '是' : '否'
        }
      ]

      // 如果有岗位信息，添加到信息卡片中
      if (Array.isArray(user.position) && user.position.length > 0) {
        companyInfo.splice(2, 0, {
          label: '岗位',
          value: user.position.join('、')
        })
      }

      // 如果有部门信息，添加到信息卡片中
      if (user.department) {
        companyInfo.splice(companyInfo.length - 1, 0, {
          label: '部门',
          value: user.department
        })
      }

      // 如果有亲属信息，添加到信息卡片中
      if (user.relativeName) {
        companyInfo.splice(companyInfo.length - 1, 0, {
          label: '亲属',
          value: user.relativeName
        })
      }

      // 用户状态映射
      const userStatus = user.userStatus || 'offline'
      const STATUS_MAP = {
        online: {
          label: '在线',
          cls: 'status-online'
        },
        busy: {
          label: '忙碌',
          cls: 'status-busy'
        },
        out: {
          label: '外出中',
          cls: 'status-out'
        },
        offline: {
          label: '离线',
          cls: 'status-offline'
        }
      }
      const statusInfo = STATUS_MAP[userStatus] || STATUS_MAP.offline




      this.setData({
        userName: user.name,
        roleLabel: user.isAdmin ? `${user.role} · 管理员` : user.role,
        primaryTag: user.isAdmin ? '管理员' : '普通用户',
        secondaryTag: '状态：' + statusInfo.label,
        avatarText: (user.avatarText || user.name || '智').slice(0, 1),
        avatarStatusClass: statusInfo.cls,
        isAdmin: !!user.isAdmin,

        companyInfo
      })
    } catch (error) {
      utils.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
    }
  },

  onChangeStatus() {
    const currentStatus = this.data.avatarStatusClass.replace('status-', '')
    // status-out: 外出中，不允许手动切换
    if (currentStatus === 'out') {
      wx.showToast({
        title: '外出中无法切换状态',
        icon: 'none'
      })
      return
    }
    // online ↔ busy 互切
    wx.showLoading({
      title: '切换状态中...',
      mask: true
    })
    const nextStatus = currentStatus === 'online' ? 'busy' : 'online'
    app.callOfficeAuth('updateUserStatus', {
      userStatus: nextStatus
    }).then(() => {
      // 即时更新 UI
      const STATUS_MAP = {
        online: {
          label: '在线',
          cls: 'status-online'
        },
        busy: {
          label: '忙碌',
          cls: 'status-busy'
        }
      }
      const info = STATUS_MAP[nextStatus]
      this.setData({
        secondaryTag: '状态：' + info.label,
        avatarStatusClass: info.cls
      })
    }).catch(err => {
      console.warn('更新状态失败:', err)
      wx.showToast({
        title: '状态切换失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
    })
  },


  handleLogout() {
    // 退出登录前，将用户状态设为 offline（若当前外出则保持 out）
    app.callOfficeAuth('updateUserStatus', {
      userStatus: 'offline',
      preserveOut: true
    }).catch(err => {
      console.warn('更新离线状态失败:', err)
    })
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

  syncNotifications() {
    app.getNotifications({
      page: 1,
      pageSize: 20
    }, function (result) {
      const notifications = result.data || []
      const unreadCount = notifications.filter(function (n) {
        return !n.read
      }).length

      // 更新 menuGroups 的 badge
      const menuGroups = this.data.menuGroups
      menuGroups[1].items[0].badge = unreadCount > 0 ? unreadCount + '条未读' : ''
      this.setData({
        menuGroups: menuGroups
      })
    }.bind(this))
  },

  handleMenuTap(e) {
    const label = e.currentTarget.dataset.label
    if (label === '修改个人信息') {
      wx.navigateTo({
        url: '/pages/office/profile/edit-profile/edit-profile'
      })
    } else if (label === '消息中心') {
      wx.navigateTo({
        url: '/pages/office/notifications/notifications'
      })
    } else if (label === '签字管理') {
      wx.navigateTo({
        url: '/pages/office/signature-manage/signature-manage'
      })
    } else if (label === '意见反馈') {
      wx.navigateTo({
        url: '/pages/office/feedback/feedback'
      })
    } else if (label === '帮助中心') {
      wx.navigateTo({
        url: '/pages/office/help/help'
      })
    } else if (label === '字体大小') {
    } else if (label === '岗位配置') {
      app.navigateWithPermission('manage_positions', '/pages/office/position-config/position-config', '岗位配置')
    } else {
      utils.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
      })
    }
  }
})