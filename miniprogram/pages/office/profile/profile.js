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
    avatarText: '未',
    userAvatarUrl: '',
    isAdmin: false,
    isReviewer: false,
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
        }]
      },
      {
        title: '个人设置',
        items: [{
            icon: '🔔',
            label: '消息中心'
          },
          /* {
            icon: '✍️',
            label: '签字管理'
          }, */
          {
            icon: '👤',
            label: '修改个人信息'
          },
          {
            icon: '❓',
            label: '帮助中心'
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
        label: '部门负责人',
        value: '否'
      },
      {
        label: '居住区域',
        value: '未填写'
      },
      {
        label: '系统管理员',
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
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.reLaunch({
          url: '/pages/auth/login/login'
        })
        return
      }

      const user = result.user
      const companyInfo = [
        {
          label: '角色',
          value: user.role || '未设置'
        }
      ]

      // 如果有岗位信息，添加到信息卡片中
      if (Array.isArray(user.position) && user.position.length > 0) {
        companyInfo.push({
          label: '岗位',
          value: user.position.join('、')
        })
      }

      // 如果有部门信息，添加到信息卡片中
      if (user.department) {
        companyInfo.push({
          label: '部门',
          value: user.department
        })
      }

      // 如果有部门信息，添加部门负责人情况到信息卡片中
      if (user.department) {
        // 部门负责人（是/否）
        companyInfo.push({
          label: '部门负责人',
          value: user.isDepartmentHead ? '是' : '否'
        })
      }

      // 居住区域
      companyInfo.push({
        label: '居住区域',
        value: user.livingArea || '未填写'
      })

      // 如果有亲属信息，添加到信息卡片中
      if (user.relativeName) {
        companyInfo.push({
          label: '亲属',
          value: user.relativeName
        })
      }

      // 系统管理员（是/否）
      companyInfo.push({
        label: '系统管理员',
        value: user.isAdmin ? '是' : '否'
      })
      
      // 用户状态映射
      const userStatus = user.userStatus
      const STATUS_MAP = {
        online: {
          label: '在线',
          cls: 'status-online'
        },
        out: {
          label: '外出中',
          cls: 'status-out'
        }
      }
      const statusInfo = STATUS_MAP[userStatus] || STATUS_MAP.online
      const systemItems = [{
        icon: 'Aa',
        label: '字体大小'
      }]
      
      // 报备配置：管理员可编辑，馆员只读查看
      if (user.role === '馆员') {
        systemItems.push({
          icon: '⚙️',
          label: '人员配置'
        })
      }
      const menuGroups = [{
          title: '系统设置',
          items: systemItems
        },
        this.data.menuGroups[1]
      ]

      this.setData({
        userName: user.name,
        roleLabel: (user.role || '馆员') + (user.isDepartmentHead ? ' · 负责人' : '') + (user.isAdmin ? ' · 管理员' : ''),
        primaryTag: user.isAdmin ? '系统管理员' : '非系统管理员',
        secondaryTag: '状态：' + statusInfo.label,
        avatarText: (user.avatarText || user.name || '巴').slice(0, 1),
        avatarStatusClass: statusInfo.cls,
        isAdmin: !!user.isAdmin,
        isReviewer: !!user.isReviewer,
        userAvatarUrl: user.avatarUrl || '',
        companyInfo,
        menuGroups
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


  handleClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '此功能可解决小程序运行异常问题。将清除小程序产生的所有本地缓存并返回登录页，是否继续？',
      confirmText: '清除',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({
            title: '清除中...',
            mask: true
          })
          // 审核模式需先停用：恢复被拦截的 wx.cloud.callFunction 并重置 isReviewer
          // 否则清缓存后仍处于审核态，login 页 onShow 会自动跳回 home
          if (app.globalData.isReviewer) {
            app.deactivateReviewerMode()
          }
          try {
            wx.clearStorageSync()
          } catch (e) {
            console.warn('清除本地缓存失败:', e)
          }
          // 重置 app 内存状态（身份/常量/权限缓存）
          app.clearOverallState()
          wx.hideLoading()
          utils.showToast({
            title: '缓存已清除',
            icon: 'success'
          })
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/auth/login/login'
            })
          }, 300)
        }
      }
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
    app.subscribeOnTap(app.getSubscribeTypesForUser(app.globalData.userProfile))
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
    } else if (label === '字体大小') {    } else if (label === '人员配置') {
      wx.navigateTo({
        url: '/pages/office/personnel-config/personnel-config'
      })
    } else {
      utils.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none'
      })
    }
  }
})