const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')

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

/**
 * 计算登录卡片的提示文案，避免在 WXML 中使用模板字符串导致编译错误
 */
function computeLoginTitle(statusLoading, isRegistered, isPendingApproval, statusCard) {
  if (statusLoading) return '正在获取用户状态...'
  if (isRegistered) return '您已注册，点击下方按钮登录：'
  if (isPendingApproval) return '您已提交注册申请，请等待管理员审核'
  if (statusCard && statusCard.className === 'is-rejected') return '您的注册申请被退回，退回原因：' + (statusCard.desc || '')
  return '您尚未注册，点击下方按钮注册：'
}

/**
 * 计算登录按钮文案，避免在 WXML 中使用模板字符串导致编译错误
 */
function computeLoginButtonText(statusLoading, isRegistered, isPendingApproval, isDesktop, statusCard) {
  if (statusLoading) return '加载中...'
  if (isPendingApproval) return '审核中'
  if (statusCard && statusCard.className === 'is-rejected') return '重新提交'
  if (isRegistered) return isDesktop ? '登录' : '微信一键登录'
  return '注册'
}

Page({
  behaviors: [modalAnimation],

  data: {
    loading: false,
    statusLoading: true,
    constantsReady: false,   // 常量是否加载完成，完成前禁止点击登录
    statusCard: null,
    showRegisterLink: true,
    isAdmin: false,
    isDevEnv: false,
    isDesktop: false,
    isRegistered: false,
    isPendingApproval: false,
    loginTitleText: '正在获取用户状态...',
    loginButtonText: '加载中...',
    showDebugPanel: false,
    debugResults: [],
    showClearDbPanel: false,
    dbCollections: [],
    selectedCollections: [],
    clearDbLoading: false,
    showClearDbKeyModal: false,
    showClearDbFinalConfirm: false,
    clearDbFinalContent: '',
    // 清库密钥输入框配置
    clearDbKeyInputs: [{
      key: 'clearKey',
      type: 'password',
      placeholder: '请输入清库密钥',
      required: true,
      emptyTip: '请输入清库密钥'
    }],
    bootstrapStatus: {
      bootstrapKeyConfigured: false,
      hasApprovedAdmin: true,
      canBootstrap: false
    },
    showBootstrapModal: false,
    bootstrapInviteCode: '',
    bootstrapLoading: false,
    showReviewerModal: false,
    reviewerLoading: false,
    // 审核员登录输入框配置
    reviewerInputs: [{
      key: 'account',
      type: 'text',
      placeholder: '请输入账号',
      required: true,
      emptyTip: '请输入账号和密码'
    }, {
      key: 'password',
      type: 'password',
      placeholder: '请输入密码',
      required: true,
      emptyTip: '请输入账号和密码'
    }]
  },

  onShow() {
    // 审核员会话恢复：直接跳转 home 页，无需再点击登录
    if (app.globalData.isReviewer) {
      wx.switchTab({
        url: '/pages/office/home/home'
      })
      return
    }

    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({
        fontStyle
      })
    }
    this.setData({
      isDevEnv: app.globalData.isDevEnv,
      isDesktop: ['windows', 'mac'].includes(app.globalData.platform),
      loading: false // 每次显示登录页时归位登录按钮状态
    })
    // 强制刷新注册状态（走网络），不再清空身份/资料缓存
    // 常量缓存由 refreshStatus 内部根据注册状态决定是否加载
    this.refreshStatus(true)
  },

  onPullDownRefresh() {
    this.refreshStatus(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadBootstrapStatus() {
    // 系统已有管理员，首个管理员引导已不需要
    const fallback = {
      bootstrapKeyConfigured: false,
      hasApprovedAdmin: true,
      canBootstrap: false
    }
    this.setData({ bootstrapStatus: fallback })
    return Promise.resolve(fallback)
    
    // --- 以下原代码保留但不再执行 ---
    //
    // 初始化状态基本不变：已初始化时长期缓存（24h），未初始化时短缓存（5min）
    const cacheKey = 'bootstrapStatus'
    const cached = wx.getStorageSync(cacheKey)
    const now = Date.now()
    if (cached && cached.data) {
      const ttl = cached.data.hasApprovedAdmin ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000
      if (cached.timestamp && now - cached.timestamp < ttl) {
        this.setData({ bootstrapStatus: cached.data })
        return Promise.resolve(cached.data)
      }
    }

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
      this.setData({
        bootstrapStatus
      })
      // 写入缓存
      wx.setStorageSync(cacheKey, {
        data: bootstrapStatus,
        timestamp: now
      })
      return bootstrapStatus
    }).catch((error) => {
      console.warn('获取首个管理员引导状态失败:', error)
      const fallback = {
        bootstrapKeyConfigured: false,
        hasApprovedAdmin: true,
        canBootstrap: false
      }
      this.setData({
        bootstrapStatus: fallback
      })
      return fallback
    })
  },

  refreshStatus(forceRefresh) {
    this.setData({ statusLoading: true })
    return Promise.all([
      app.checkUserRegistration({ forceRefresh }),
      this.loadBootstrapStatus()
    ]).then(([result]) => {
      // 已注销用户
      if (result.authStatus === 'deactivated') {
        this.setData({
          statusLoading: false,
          constantsReady: true,
          statusCard: null,
          showRegisterLink: false,
          isRegistered: false,
          isPendingApproval: false,
          loginTitleText: '您的账号已被管理员注销，如需恢复请联系管理员',
          loginButtonText: '不可用'
        })
        return
      }

      const statusCard = result.registered ?
        buildStatusCard({
          status: 'approved'
        }) :
        buildStatusCard(result.request)

      const isAdmin = result.registered && result.user && result.user.isAdmin === true

      const _isRegistered = result.registered
      const _isPendingApproval = !result.registered && result.request && result.request.status === 'pending'

      this.setData({
        statusLoading: false,
        statusCard,
        showRegisterLink: !result.registered && (!result.request || result.request.status === 'rejected'),
        isAdmin,
        isRegistered: _isRegistered,
        isPendingApproval: _isPendingApproval,
        loginTitleText: computeLoginTitle(false, _isRegistered, _isPendingApproval, statusCard),
        loginButtonText: computeLoginButtonText(false, _isRegistered, _isPendingApproval, this.data.isDesktop, statusCard)
      })

      // 仅已注册用户加载常量缓存，加载完成才允许登录；其他状态不加载、直接放行
      if (_isRegistered) {
        this.setData({ constantsReady: false })
        app.loadConstants().then(() => {
          this.setData({ constantsReady: true })
        }).catch((err) => {
          console.warn('预加载常量失败:', err)
          this.setData({ constantsReady: true }) // 失败也放行，避免永久阻塞
        })
      } else {
        this.setData({ constantsReady: true })
      }
    }).catch((error) => {
      // 连接失败：保持加载中状态，提示用户网络可能慢，可下拉刷新重试
      this.setData({
        statusLoading: true,
        constantsReady: true,
        statusCard: null,
        showRegisterLink: false,
        isRegistered: false,
        isPendingApproval: false,
        loginTitleText: '正在获取用户状态...若长时间加载，可能网络慢，可更换网络后下拉刷新重试',
        loginButtonText: '加载中...'
      })
    })
  },


  async handleWxLogin() {
    if (this.data.loading) return

    // 用户状态加载中，禁止操作（防止绕过生物认证）
    if (this.data.statusLoading) {
      utils.showToast({
        title: '正在获取用户状态，请稍候',
        icon: 'none'
      })
      return
    }

    // 已注销用户禁止登录
    if (this.data.loginButtonText === '不可用') {
      utils.showToast({
        title: '账号已注销，无法登录',
        icon: 'none'
      })
      return
    }

    // 常量未加载完成，禁止操作（防止缓存缺失导致后续页面异常）
    if (!this.data.constantsReady) {
      utils.showToast({
        title: '正在初始化，请稍候',
        icon: 'none'
      })
      return
    }

    // 审批中不可操作
    if (this.data.isPendingApproval) {
      wx.showToast({
        title: '注册申请审核中，请耐心等待',
        icon: 'none'
      })
      return
    }

    // 未注册用户无需生物认证，直接进入注册/登录流程
    if (!this.data.isRegistered) {
      this.doLogin()
      return
    }

    // 调试环境跳过生物认证（开发者工具不支持生物认证API）
    if (app.globalData.isDevEnv) {
      console.warn('[login] 开发环境，跳过生物认证')
      this.doLogin()
      return
    }

    // 桌面端（Windows/Mac 微信）不支持生物认证，直接登录
    if (this.data.isDesktop) {
      console.log('[login] 桌面端，跳过生物认证')
      this.doLogin()
      return
    }

    // 生物认证暂时关闭（部分设备未设置生物识别导致无法登录），后续如需恢复取消下方注释即可
    // try {
    //   // 1. 检测设备支持哪种生物认证
    //   let authMode = null
    //
    //   // 先尝试人脸（iOS Face ID 优先）
    //   try {
    //     const faceCheck = await wx.checkIsSoterEnrolledInDevice({
    //       checkAuthMode: 'facial'
    //     })
    //     if (faceCheck.isEnrolled) {
    //       authMode = 'facial'
    //     }
    //   } catch (e) {
    //     // 不支持人脸，继续检查指纹
    //   }
    //
    //   // 人脸不可用，再尝试指纹
    //   if (!authMode) {
    //     try {
    //       const fingerCheck = await wx.checkIsSoterEnrolledInDevice({
    //         checkAuthMode: 'fingerPrint'
    //       })
    //       if (fingerCheck.isEnrolled) {
    //         authMode = 'fingerPrint'
    //       }
    //     } catch (e) {
    //       // 不支持指纹
    //     }
    //   }
    //
    //   // 没有任何生物认证可用，返回
    //   if (!authMode) {
    //     //this.doLogin()
    //     return
    //   }
    //
    //   // 2. 调起生物认证
    //   this.setData({
    //     loading: true
    //   })
    //   await wx.startSoterAuthentication({
    //     requestAuthModes: [authMode],
    //     challenge: String(Date.now()),
    //     authContent: '请验证身份以登录'
    //   })
    //   // 认证通过，继续登录
    //   this.doLogin()
    // } catch (err) {
    //   // 生物认证失败或取消
    //   if (err.errCode === 90001 || err.errCode === 90002) {
    //     // 用户取消，不继续登录
    //     return
    //   }
    //   // 其他错误（如认证失败），返回
    //   //this.doLogin()
    // } finally {
    //   // 只有在 doLogin 没有被调用时才重置 loading
    //   if (this.data.loading) {
    //     this.setData({
    //       loading: false
    //     })
    //   }
    // }

    // 暂时跳过生物认证，直接登录
    this.doLogin()
  },

  // 原来的登录逻辑抽到这个方法
  doLogin() {
    this.setData({
      loading: true
    })
    app.checkUserRegistration({ forceRefresh: true })
      .then((result) => {
        if (result.registered === true) {
          // 未填写详细信息（角色为空）→ 进入 fill-detail 页补充
          if (!result.user || !result.user.role) {
            wx.navigateTo({
              url: '/pages/auth/fill-detail/fill-detail'
            })
            return
          }
          utils.showToast({
            title: '登录成功',
            icon: 'success'
          })
          // 登录成功，将用户状态设为 online（若当前外出则保持 out）
          app.callOfficeAuth('updateUserStatus', {
            userStatus: 'online',
            preserveOut: true
          }).catch(err => {
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
          // 审核中：不跳转，恢复按钮并刷新状态
          this.setData({ loading: false })
          this.refreshStatus()
          utils.showToast({
            title: '申请审核中',
            icon: 'none'
          })
          return
        }

        wx.navigateTo({
          url: result.request && result.request.status === 'rejected' ?
            '/pages/auth/register/register?mode=reapply' :
            '/pages/auth/register/register'
        })
      })
      .catch((error) => {
        // 失败：恢复按钮并刷新状态
        this.setData({ loading: false })
        this.refreshStatus()
        utils.showToast({
          title: error.message || '登录失败',
          icon: 'none'
        })
      })
  },

  goRegister() {
    wx.navigateTo({
      url: '/pages/auth/register/register'
    })
  },

  toggleDebugPanel() {
    if (!this.data.isAdmin || !this.data.isDevEnv) {
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
    wx.showLoading({
      title: '执行中...',
      mask: true
    })
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
    wx.showLoading({
      title: '执行中...',
      mask: true
    })
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

    wx.showLoading({
      title: '获取集合列表...',
      mask: true
    })
    try {
      const res = await wx.cloud.callFunction({
        name: 'dbManager',
        data: {
          action: 'listCollections'
        }
      })
      wx.hideLoading()

      if (res.result.code === 0) {
        const collections = res.result.data.collections.map((name) => ({
          name,
          checked: false
        }))
        this.setData({
          dbCollections: collections
        })
      } else {
        utils.showToast({
          title: res.result.message || '获取失败',
          icon: 'none'
        })
        this.hideClearDbPanel()
      }
    } catch (error) {
      wx.hideLoading()
      utils.showToast({
        title: error.message || '获取集合列表失败',
        icon: 'none'
      })
      this.hideClearDbPanel()
    }
  },

  hideClearDbPanel() {
    this.setData({
      showClearDbPanel: false,
      dbCollections: [],
      selectedCollections: [],
      showClearDbKeyModal: false
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
      const collections = this.data.dbCollections.map((item) => ({
        ...item,
        checked: false
      }))
      this.setData({
        dbCollections: collections,
        selectedCollections: []
      })
    } else {
      const collections = this.data.dbCollections.map((item) => ({
        ...item,
        checked: true
      }))
      const allNames = collections.map((item) => item.name)
      this.setData({
        dbCollections: collections,
        selectedCollections: allNames
      })
    }
  },

  doClearDb() {
    const {
      selectedCollections
    } = this.data

    if (selectedCollections.length === 0) {
      utils.showToast({
        title: '请先选择要清理的集合',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '确认清理',
      content: `将清理 ${selectedCollections.length} 个集合的所有数据，此操作不可恢复，是否继续？`,
      confirmText: '继续',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          // 二次确认改为倒计时 modal
          this.setData({
            showClearDbFinalConfirm: true,
            clearDbFinalContent: `确定要清空以下集合的所有数据吗？\n> ${selectedCollections.join('\n> ')}`
          })
        }
      }
    })
  },

  showClearDbKeyModal() {
    this.setData({
      showClearDbKeyModal: true
    })
  },

  onClearDbKeyCancel() {
    this.setData({
      showClearDbKeyModal: false
    })
  },

  onClearDbKeyConfirm(e) {
    const values = e.detail.values || {}
    const clearDbKey = String(values.clearKey || '').trim()
    if (!clearDbKey) {
      utils.showToast({
        title: '请输入清库密钥',
        icon: 'none'
      })
      return
    }

    this.setData({ showClearDbKeyModal: false })
    this.executeClearDb(clearDbKey)
  },

  onClearDbFinalConfirm() {
    this.setData({ showClearDbFinalConfirm: false })
    this.showClearDbKeyModal()
  },

  onClearDbFinalCancel() {
    this.setData({ showClearDbFinalConfirm: false })
  },

  async executeClearDb(clearKey) {
    const {
      selectedCollections
    } = this.data

    this.setData({
      clearDbLoading: true
    })
    wx.showLoading({
      title: '清理中...',
      mask: true
    })

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
      this.setData({
        clearDbLoading: false
      })

      if (res.result.code === 0) {
        const {
          summary,
          results
        } = res.result.data
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
        utils.showToast({
          title: res.result.message || '清理失败',
          icon: 'none'
        })
      }
    } catch (error) {
      wx.hideLoading()
      this.setData({
        clearDbLoading: false
      })
      this.addDebugResult('清除数据库', false, error.message || '清理失败')
      utils.showToast({
        title: error.message || '清理失败',
        icon: 'none'
      })
    }
  },

  showBootstrapModal() {
    this.setData({
      showBootstrapModal: true,
      bootstrapInviteCode: ''
    })
  },

  hideBootstrapModal() {
    this._closeModal('showBootstrapModal', () => {
      this.setData({
        bootstrapInviteCode: ''
      })
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

    this.setData({
      bootstrapLoading: true
    })
    wx.showLoading({
      title: '初始化中...',
      mask: true
    })

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

      return app.checkUserRegistration({
        forceRefresh: true
      })
    }).then((result) => {
      if (result && result.registered) {
        // 未填写详细信息（角色为空）→ 进入 fill-detail 页补充
        if (!result.user || !result.user.role) {
          setTimeout(() => {
            wx.navigateTo({
              url: '/pages/auth/fill-detail/fill-detail'
            })
          }, 200)
          return
        }
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
      this.setData({
        bootstrapLoading: false
      })
      this.refreshStatus()
    })
  },

  // ========== 审核员登录 ==========

  showReviewerModal() {
    this.setData({
      showReviewerModal: true
    })
  },

  onReviewerCancel() {
    this.setData({
      showReviewerModal: false
    })
  },

  async onReviewerConfirm(e) {
    const values = e.detail.values || {}
    const account = String(values.account || '').trim()
    const password = String(values.password || '').trim()

    if (!account || !password) {
      utils.showToast({ title: '请输入账号和密码', icon: 'none' })
      return
    }

    if (this.data.reviewerLoading) return
    this.setData({ reviewerLoading: true })

    wx.showLoading({ title: '验证中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'reviewerLogin',
        data: { account, password }
      })

      wx.hideLoading()

      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '验证失败')
      }

      // 激活审核模式
      app.activateReviewerMode()

      this.setData({ showReviewerModal: false })

      utils.showToast({ title: '登录成功', icon: 'success' })

      setTimeout(() => {
        wx.switchTab({
          url: '/pages/office/home/home'
        })
      }, 200)
    } catch (error) {
      wx.hideLoading()
      utils.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ reviewerLoading: false })
    }
  }
})