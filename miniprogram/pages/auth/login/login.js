const app = getApp()
const utils = require('../../../common/utils.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  return utils.formatShortDateTime(timestamp)
}

function buildStatusCard(request) {
  if (!request) {
    return null
  }

  if (request.status === 'pending') {
    return {
      className: 'is-pending',
      title: '注册申请审核中',
      desc: '您的资料已提交，管理员审批通过后即可进入首页。',
      tag: '审核中',
      extra: request.requestNo ? `申请编号：${request.requestNo}` : '',
      time: request.submittedAt ? `提交时间：${formatTime(request.submittedAt)}` : ''
    }
  }

  if (request.status === 'rejected') {
    return {
      className: 'is-rejected',
      title: '申请需重新提交',
      desc: request.reviewRemark || '管理员已退回本次申请，请修改后重新提交。',
      tag: '已退回',
      extra: request.requestNo ? `申请编号：${request.requestNo}` : '',
      time: request.reviewedAt ? `处理时间：${formatTime(request.reviewedAt)}` : ''
    }
  }

  return {
    className: 'is-approved',
    title: '账号已完成注册',
    desc: '您已通过管理员审批，点击上方按钮进入首页。',
    tag: '已通过',
    extra: '',
    time: ''
  }
}

Page({
  data: {
    loading: false,
    statusCard: null,
    showRegisterLink: true,
    isAdmin: false,
    showDebugPanel: false,
    debugResults: [],
    showClearDbPanel: false,
    dbCollections: [],
    selectedCollections: [],
    clearDbLoading: false,
    showClearDbKeyModal: false,
    clearDbKey: '',
    bootstrapStatus: {
      bootstrapKeyConfigured: false,
      hasApprovedAdmin: true,
      canBootstrap: false
    },
    showBootstrapModal: false,
    bootstrapInviteCode: '',
    bootstrapLoading: false
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    app.clearAuthState()
    this.refreshStatus()
    app.loadConstants().catch((err) => {
      console.warn('预加载常量失败:', err)
    })
  },

  onPullDownRefresh() {
    app.clearAuthState()
    this.refreshStatus().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadBootstrapStatus() {
    return wx.cloud.callFunction({
      name: 'bootstrapAdmin',
      data: {
        action: 'getStatus'
      }
    }).then((res) => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '获取初始化状态失败')
      }
      const bootstrapStatus = result.data || {}
      this.setData({ bootstrapStatus })
      return bootstrapStatus
    }).catch((error) => {
      console.warn('获取首个管理员引导状态失败:', error)
      const fallback = {
        bootstrapKeyConfigured: false,
        hasApprovedAdmin: true,
        canBootstrap: false
      }
      this.setData({ bootstrapStatus: fallback })
      return fallback
    })
  },

  refreshStatus() {
    return Promise.all([
      app.checkUserRegistration(),
      this.loadBootstrapStatus()
    ]).then(([result]) => {
      const statusCard = result.registered
        ? buildStatusCard({ status: 'approved' })
        : buildStatusCard(result.request)

      const isAdmin = result.registered && result.user && result.user.isAdmin === true

      this.setData({
        statusCard,
        showRegisterLink: !result.registered && (!result.request || result.request.status === 'rejected'),
        isAdmin
      })
    }).catch((error) => {
      this.setData({
        statusCard: {
          className: 'is-error',
          title: '连接失败',
          desc: error.message || '请稍后重试。',
          tag: '异常',
          extra: '',
          time: ''
        },
        showRegisterLink: false
      })
    })
  },


  async handleWxLogin() {
    if (this.data.loading) return

    // 调试环境跳过生物认证（开发者工具不支持生物认证API）
    if (this.isDevEnvironment()) {
      console.warn('[login] 开发环境，跳过生物认证')
      this.doLogin()
      return
    }

    try {
      // 1. 检测设备支持哪种生物认证
      let authMode = null

      // 先尝试人脸（iOS Face ID 优先）
      try {
        const faceCheck = await wx.checkIsSoterEnrolledInDevice({
          checkAuthMode: 'facial'
        })
        if (faceCheck.isEnrolled) {
          authMode = 'facial'
        }
      } catch (e) {
        // 不支持人脸，继续检查指纹
      }

      // 人脸不可用，再尝试指纹
      if (!authMode) {
        try {
          const fingerCheck = await wx.checkIsSoterEnrolledInDevice({
            checkAuthMode: 'fingerPrint'
          })
          if (fingerCheck.isEnrolled) {
            authMode = 'fingerPrint'
          }
        } catch (e) {
          // 不支持指纹
        }
      }

      // 没有任何生物认证可用，返回
      if (!authMode) {
        //this.doLogin()
        return
      }

      // 2. 调起生物认证
      this.setData({ loading: true })
      await wx.startSoterAuthentication({
        requestAuthModes: [authMode],
        challenge: String(Date.now()),
        authContent: '请验证身份以登录'
      })
      // 认证通过，继续登录
      this.doLogin()
    } catch (err) {
      // 生物认证失败或取消
      if (err.errCode === 90001 || err.errCode === 90002) {
        // 用户取消，不继续登录
        return
      }
      // 其他错误（如认证失败），返回
      //this.doLogin()
    } finally {
      // 只有在 doLogin 没有被调用时才重置 loading
      if (this.data.loading) {
        this.setData({ loading: false })
      }
    }
  },

  // 判断是否为开发环境（开发者工具）
  isDevEnvironment() {
    try {
      const accountInfo = wx.getAccountInfoSync()
      return accountInfo.miniProgram.envVersion === 'develop'
    } catch (e) {
      return false
    }
  },

  // 原来的登录逻辑抽到这个方法
  doLogin() {
    this.setData({ loading: true })
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered === true) {
          utils.showToast({
            title: '登录成功',
            icon: 'success'
          })
          // 登录成功，将用户状态设为 online（若当前外出则保持 out）
          app.callOfficeAuth('updateUserStatus', { userStatus: 'online', preserveOut: true }).catch(err => {
            console.warn('更新在线状态失败:', err)
          })
          setTimeout(() => {
            // 待赴任馆员跳转到馆指南页，其他角色跳转首页
            if (result.user && result.user.role === '待赴任馆员') {
              wx.reLaunch({
                url: '/pages/office/arrival-guide/arrival-guide'
              })
            } else {
              wx.switchTab({
                url: '/pages/office/home/home'
              })
            }
          }, 200)
          return
        }

        if (result.request && result.request.status === 'pending') {
          this.setData({
            statusCard: buildStatusCard(result.request),
            showRegisterLink: false
          })
          utils.showToast({
            title: '申请审核中',
            icon: 'none'
          })
          return
        }

        wx.navigateTo({
          url: result.request && result.request.status === 'rejected'
            ? '/pages/auth/register/register?mode=reapply'
            : '/pages/auth/register/register'
        })
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '登录失败',
          icon: 'none'
        })
      })
      .finally(() => {
        this.setData({ loading: false })
        this.refreshStatus()
      })
  },

  goRegister() {
    wx.navigateTo({
      url: '/pages/auth/register/register'
    })
  },

  toggleDebugPanel() {
    if (!this.data.isAdmin) {
      return
    }

    this.setData({
      showDebugPanel: !this.data.showDebugPanel
    })
  },

  hideDebugPanel() {
    this.setData({
      showDebugPanel: false,
      debugResults: []
    })
  },

  addDebugResult(name, success, message, data) {
    const result = {
      id: Date.now(),
      name,
      success,
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    }
    this.setData({
      debugResults: [result, ...this.data.debugResults]
    })
  },

  callInitSystemConfig() {
    wx.showLoading({ title: '执行中...', mask: true })
    wx.cloud.callFunction({
      name: 'initSystemConfig',
      data: {}
    }).then((res) => {
      wx.hideLoading()
      const result = res.result || {}
      this.addDebugResult(
        '初始化系统配置',
        result.code === 0,
        result.message || (result.code === 0 ? '执行成功' : '执行失败'),
        result.data
      )
    }).catch((error) => {
      wx.hideLoading()
      this.addDebugResult('初始化系统配置', false, error.message || '执行失败')
    })
  },

  callInitWorkflowDB() {
    wx.showLoading({ title: '执行中...', mask: true })
    wx.cloud.callFunction({
      name: 'initWorkflowDB',
      data: {}
    }).then((res) => {
      wx.hideLoading()
      const result = res.result || {}
      this.addDebugResult(
        '初始化工作流',
        result.code === 0,
        result.message || (result.code === 0 ? '执行成功' : '执行失败'),
        result.data
      )
    }).catch((error) => {
      wx.hideLoading()
      this.addDebugResult('初始化工作流', false, error.message || '执行失败')
    })
  },

  async showClearDbPanel() {
    this.setData({
      showClearDbPanel: true,
      dbCollections: [],
      selectedCollections: []
    })

    wx.showLoading({ title: '获取集合列表...', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'dbManager',
        data: { action: 'listCollections' }
      })
      wx.hideLoading()

      if (res.result.code === 0) {
        const collections = res.result.data.collections.map((name) => ({
          name,
          checked: false
        }))
        this.setData({ dbCollections: collections })
      } else {
        utils.showToast({ title: res.result.message || '获取失败', icon: 'none' })
        this.hideClearDbPanel()
      }
    } catch (error) {
      wx.hideLoading()
      utils.showToast({ title: error.message || '获取集合列表失败', icon: 'none' })
      this.hideClearDbPanel()
    }
  },

  hideClearDbPanel() {
    this.setData({
      showClearDbPanel: false,
      dbCollections: [],
      selectedCollections: [],
      showClearDbKeyModal: false,
      clearDbKey: ''
    })
  },

  onCollectionChange(e) {
    const selectedValues = e.detail.value || []
    const collections = this.data.dbCollections.map((item) => ({
      ...item,
      checked: selectedValues.includes(item.name)
    }))
    this.setData({
      dbCollections: collections,
      selectedCollections: selectedValues
    })
  },

  toggleSelectAll() {
    const allSelected = this.data.selectedCollections.length === this.data.dbCollections.length
    if (allSelected) {
      const collections = this.data.dbCollections.map((item) => ({ ...item, checked: false }))
      this.setData({ dbCollections: collections, selectedCollections: [] })
    } else {
      const collections = this.data.dbCollections.map((item) => ({ ...item, checked: true }))
      const allNames = collections.map((item) => item.name)
      this.setData({ dbCollections: collections, selectedCollections: allNames })
    }
  },

  doClearDb() {
    const { selectedCollections } = this.data

    if (selectedCollections.length === 0) {
      utils.showToast({ title: '请先选择要清理的集合', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认清理',
      content: `将清理 ${selectedCollections.length} 个集合的所有数据，此操作不可恢复，是否继续？`,
      confirmText: '继续',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.showModal({
            title: '最终确认',
            content: `确定要清空以下集合的所有数据吗？\n\n${selectedCollections.join('\n')}`,
            confirmText: '确认清理',
            confirmColor: '#ff4d4f',
            success: (res2) => {
              if (res2.confirm) {
                this.showClearDbKeyModal()
              }
            }
          })
        }
      }
    })
  },

  showClearDbKeyModal() {
    this.setData({
      showClearDbKeyModal: true,
      clearDbKey: ''
    })
  },

  hideClearDbKeyModal() {
    this.setData({
      showClearDbKeyModal: false,
      clearDbKey: ''
    })
  },

  onClearDbKeyInput(e) {
    this.setData({
      clearDbKey: e.detail.value
    })
  },

  confirmClearDb() {
    const clearDbKey = String(this.data.clearDbKey || '').trim()
    if (!clearDbKey) {
      utils.showToast({ title: '请输入清库密钥', icon: 'none' })
      return
    }

    this.hideClearDbKeyModal()
    this.executeClearDb(clearDbKey)
  },

  async executeClearDb(clearKey) {
    const { selectedCollections } = this.data

    this.setData({ clearDbLoading: true })
    wx.showLoading({ title: '清理中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'dbManager',
        data: {
          action: 'clearCollections',
          collections: selectedCollections,
          clearKey
        }
      })

      wx.hideLoading()
      this.setData({ clearDbLoading: false })

      if (res.result.code === 0) {
        const { summary, results } = res.result.data
        this.addDebugResult(
          '清除数据库',
          summary.failed === 0,
          `成功清理 ${summary.success} 个集合，失败 ${summary.failed} 个`,
          results
        )

        wx.showModal({
          title: summary.failed === 0 ? '清理完成' : '部分清理完成',
          content: `成功: ${summary.success} 个\n失败: ${summary.failed} 个`,
          showCancel: false,
          success: () => {
            this.hideClearDbPanel()
          }
        })
      } else {
        this.addDebugResult('清除数据库', false, res.result.message)
        utils.showToast({ title: res.result.message || '清理失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({ clearDbLoading: false })
      this.addDebugResult('清除数据库', false, error.message || '清理失败')
      utils.showToast({ title: error.message || '清理失败', icon: 'none' })
    }
  },

  showBootstrapModal() {
    this.setData({
      showBootstrapModal: true,
      bootstrapInviteCode: ''
    })
  },

  hideBootstrapModal() {
    this.setData({
      showBootstrapModal: false,
      bootstrapInviteCode: ''
    })
  },

  onBootstrapInviteCodeInput(e) {
    this.setData({
      bootstrapInviteCode: e.detail.value
    })
  },

  confirmBootstrapAdmin() {
    if (this.data.bootstrapLoading) {
      return
    }

    const inviteCode = String(this.data.bootstrapInviteCode || '').trim()
    if (!inviteCode) {
      utils.showToast({
        title: '请输入初始化密钥',
        icon: 'none'
      })
      return
    }

    this.setData({ bootstrapLoading: true })
    wx.showLoading({ title: '初始化中...', mask: true })

    wx.cloud.callFunction({
      name: 'bootstrapAdmin',
      data: {
        action: 'claimAdmin',
        inviteCode
      }
    }).then((res) => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '初始化失败')
      }

      this.hideBootstrapModal()
      utils.showToast({
        title: '管理员初始化成功',
        icon: 'success'
      })

      return app.checkUserRegistration({ forceRefresh: true })
    }).then((result) => {
      if (result && result.registered) {
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/office/home/home'
          })
        }, 200)
      }
    }).catch((error) => {
      utils.showToast({
        title: error.message || '初始化失败',
        icon: 'none'
      })
    }).finally(() => {
      wx.hideLoading()
      this.setData({ bootstrapLoading: false })
      this.refreshStatus()
    })
  }
})
