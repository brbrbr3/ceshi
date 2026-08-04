// ========== 生产环境日志拦截 ==========
// 非开发环境下屏蔽 console.log 和 console.warn，保留 console.error 用于线上排查
;(function () {
  try {
    const accountInfo = wx.getAccountInfoSync()
    const envVersion = accountInfo.miniProgram.envVersion
    if (envVersion !== 'develop') {
      console.log = function () {}
      console.warn = function () {}
    }
  } catch (e) {
    // 获取环境信息失败时不拦截，避免影响正常开发
  }
})()

const config = require('./config')
const reviewerMock = require('./common/reviewer-mock')
const themeListeners = []
const AUTH_CORE_KEY = 'app-auth-core'
const REVIEWER_SESSION_KEY = 'app-reviewer-session'
const PROFILE_CACHE_KEY = 'app-profile-cache'
const CONSTANTS_CACHE_KEY = 'app-constants-cache'
const PERMISSION_CACHE_KEY = 'app-permission-cache'
const VERSION_CACHE_KEY = 'app-cache-version'
const LAST_SHOWN_VERSION_KEY = 'app-last-shown-version'  // 上次展示更新说明的版本（与缓存版本分离）
const FONTSIZE_CACHE_KEY = 'app-fontsize-cache'
// 字体令牌基础值（rpx）
const FONT_TOKENS = {
  13: 13,
  14: 14,
  15: 15,
  16: 16,
  17: 17,
  18: 18,
  19: 19,
  20: 20,
  21: 21,
  22: 22,
  23: 23,
  24: 24,
  25: 25,
  26: 26,
  27: 27,
  28: 28,
  29: 29,
  30: 30,
  31: 31,
  32: 32,
  33: 33,
  34: 34,
  35: 35,
  36: 36,
  37: 37,
  38: 38,
  39: 39,
  40: 40,
  41: 41,
  42: 42,
  43: 43,
  44: 44,
  45: 45,
  46: 46,
  47: 47,
  48: 48,
  49: 49,
  50: 50,
  51: 51,
  52: 52,
  53: 53,
  54: 54,
  55: 55,
  56: 56,
  57: 57,
  58: 58,
  59: 59,
  60: 60,
  61: 61,
  62: 62,
  63: 63,
  64: 64,
  65: 65,
  66: 66,
  67: 67,
  68: 68,
  69: 69,
  70: 70,
  71: 71,
  72: 72,
  73: 73,
  74: 74,
  75: 75,
  76: 76,
  77: 77,
  78: 78,
  79: 79,
  80: 80,
  81: 81,
  82: 82,
  83: 83,
  84: 84,
  85: 85,
  86: 86,
  87: 87,
  88: 88,
  89: 89,
  90: 90,
  91: 91,
  92: 92,
  93: 93,
  94: 94,
  95: 95,
  96: 96,
  97: 97,
  98: 98,
  99: 99,
  100: 100
}

function getDefaultAuthState() {
  return {
    hasLogin: false,
    openid: null,
    userProfile: null
  }
}

function readStorage(key) {
  try {
    return wx.getStorageSync(key)
  } catch (error) {
    return null
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {
    // 静默失败
  }
}

function removeStorage(key) {
  try {
    wx.removeStorageSync(key)
    console.log(key + '已清除')
  } catch (error) {
    // 静默失败
  }
}


App({
  onLaunch(opts, data) {
    if (data && data.path) {
      wx.navigateTo({
        url: data.path,
      })
    }
    if (!wx.cloud) {
      // 基础库不支持云能力
    } else {
      wx.cloud.init({
        env: config.envId,
        traceUser: true,
      })
    }

    // 判断是否为开发环境（开发者工具），启动时执行一次，全局可用
    try {
      const accountInfo = wx.getAccountInfoSync()
      this.globalData.isDevEnv = accountInfo.miniProgram.envVersion === 'develop'
    } catch (e) {
      this.globalData.isDevEnv = false
    }

    // 检查缓存版本号，版本变化时清除常量、权限的内存、缓存
    this.checkCacheVersion()

    this.readAndSetFontScale()

    // 恢复审核员会话（如果存在）
    this.restoreReviewerSession()
  },

  // 读取字体缩放缓存并设置
  readAndSetFontScale() {
    const cached = readStorage(FONTSIZE_CACHE_KEY)
    const scale = cached ? cached.scale : 1.1
    this.globalData.fontScale = scale
    this.globalData.fontStyle = this.generateFontStyle(scale)
  },

  // 根据 fontScale 生成所有令牌的 CSS 变量字符串
  // 桌面端（windows/mac）rpx 会按窗口宽度放大（375px 手机 vs 1000px+ 桌面），
  // 导致字号被放大 ~2.67 倍。桌面端改用 px，锁定 375px 设计稿换算（1rpx = 0.5px）。
  generateFontStyle(scale) {
    const isDesktop = ['windows', 'mac'].includes(this.globalData.platform)
    const rpxToPx = 0.5 // 375px 设计稿：1rpx = 375 / 750 = 0.5px
    const vars = Object.entries(FONT_TOKENS)
      .map(([key, baseRpx]) => {
        const scaled = Math.round(baseRpx * scale * 100) / 100
        if (isDesktop) {
          return `--fs-${key}: ${(scaled * rpxToPx).toFixed(2)}px`
        }
        return `--fs-${key}: ${scaled}rpx`
      })
      .join('; ')
    return vars
  },

  /**
   * 检查缓存版本号，版本变化时清除常量、权限的内存、缓存
   * 并立即落盘新版本号，确保未登录用户也能记录版本（避免每次冷启动都误判为版本变化）
   * 更新说明弹窗由 updateCacheVersionAndShowWhatsNew 基于 LAST_SHOWN_VERSION_KEY 独立控制
   */
  checkCacheVersion() {
    const storedVersion = readStorage(VERSION_CACHE_KEY)
    if (storedVersion !== config.CACHE_VERSION) {
      // 只清版本相关的缓存
      this.clearConstantsCache()    // 常量结构随版本变
      this.clearPermissionCache()   // 权限结构可能随版本变

      // 不清 AUTH_CORE_KEY / PROFILE_CACHE_KEY ——
      // 身份与版本无关；PROFILE 有 updatedAt 静默刷新自动同步

      // 立即落盘新版本号，避免未到达首页的用户下次冷启动再次误清
      writeStorage(VERSION_CACHE_KEY, config.CACHE_VERSION)
      console.log('新版缓存为' + config.CACHE_VERSION + '，已清除版本相关缓存')
    } else {
      console.log('缓存版本未变，为' + storedVersion)
    }
  },

  //登录后调用，基于"上次展示版本"决定是否展示更新说明modal（与缓存版本解耦）
  updateCacheVersionAndShowWhatsNew() {
    const lastShown = readStorage(LAST_SHOWN_VERSION_KEY)
    if (lastShown !== config.CACHE_VERSION) {
      writeStorage(LAST_SHOWN_VERSION_KEY, config.CACHE_VERSION)
      console.log('展示更新说明，版本为' + config.CACHE_VERSION + '（上次展示：' + (lastShown || '无') + '）')
      wx.showModal({
        title: '版本' + config.CACHE_VERSION + '更新说明',
        content: config.VERSION_DESCRIPTION,
        showCancel: false,
        confirmText: '我知道了'
      })
    } else {
      console.log('更新说明已展示过，版本为' + lastShown)
    }
  },

  onShow(opts) {
    // App 显示
  },

  onHide() {
    // App 隐藏
  },

  onThemeChange({
    theme
  }) {
    this.globalData.theme = theme
    themeListeners.forEach((listener) => {
      listener(theme)
    })
  },

  watchThemeChange(listener) {
    if (themeListeners.indexOf(listener) < 0) {
      themeListeners.push(listener)
    }
  },

  unWatchThemeChange(listener) {
    const index = themeListeners.indexOf(listener)
    if (index > -1) {
      themeListeners.splice(index, 1)
    }
  },

  globalData: Object.assign({
    theme: wx.getWindowInfo().theme || 'light',
    platform: wx.getDeviceInfo().platform || 'unknown',
    targetApprovalTab: null, // 目标审批tab（用于消息跳转：'pending'=待审批, 'mine'=我的发起）
    constantsCache: null, // 常量缓存
    permissionCache: null, // 权限缓存
    fontScale: 1.1, // ← 新增，字体缩放默认值
    fontStyle: '', // ← 新增
    isDevEnv: false, // 是否为开发环境（开发者工具），onLaunch 时计算一次
    isReviewer: false, // 是否为审核模式
  }, getDefaultAuthState()),

  // ========== 审核员模式 ==========

  /**
   * 恢复审核员会话（onLaunch 时调用）
   * 检查本地存储中是否有有效的审核员会话，有则恢复审核模式
   */
  restoreReviewerSession() {
    const session = readStorage(REVIEWER_SESSION_KEY)
    if (session && session.active) {
      // 检查会话是否过期（默认 24 小时）
      const SESSION_TTL = 24 * 60 * 60 * 1000
      if (session.loginAt && Date.now() - session.loginAt < SESSION_TTL) {
        this.activateReviewerMode(true)
        console.log('[reviewer] 审核员会话已恢复')
      } else {
        removeStorage(REVIEWER_SESSION_KEY)
        console.log('[reviewer] 审核员会话已过期，已清除')
      }
    }
  },

  /**
   * 激活审核模式
   * @param {boolean} isRestore - 是否为从缓存恢复（恢复时不写缓存）
   */
  activateReviewerMode(isRestore) {
    this.globalData.isReviewer = true
    this.globalData.hasLogin = true
    this.globalData.openid = '__reviewer__'
    this.globalData.userProfile = reviewerMock.mockReviewerProfile

    if (!isRestore) {
      writeStorage(REVIEWER_SESSION_KEY, {
        active: true,
        loginAt: Date.now()
      })
    }

    // Monkey-patch wx.cloud.callFunction，拦截所有云函数调用
    if (!this._originalCallFunction) {
      this._originalCallFunction = wx.cloud.callFunction.bind(wx.cloud)
    }

    const self = this
    wx.cloud.callFunction = function(options) {
      options = options || {}
      const mockData = reviewerMock.getMockResponse(options.name, options.data)
      const result = {
        result: {
          code: 0,
          message: 'ok',
          data: mockData
        }
      }

      // 兼容回调风格
      if (options.success && typeof options.success === 'function') {
        options.success(result)
      }
      if (options.complete && typeof options.complete === 'function') {
        options.complete(result)
      }

      // 同时返回 Promise
      return Promise.resolve(result)
    }

    // Monkey-patch wx.cloud.database，拦截所有直接数据库查询
    if (!this._originalDatabase) {
      this._originalDatabase = wx.cloud.database.bind(wx.cloud)
    }

    function createMockCollection() {
      return {
        doc: function() { return createMockCollection() },
        where: function() { return createMockCollection() },
        orderBy: function() { return createMockCollection() },
        skip: function() { return createMockCollection() },
        limit: function() { return createMockCollection() },
        field: function() { return createMockCollection() },
        get: function() { return Promise.resolve({ data: [] }) },
        count: function() { return Promise.resolve({ total: 0 }) },
        add: function() { return Promise.resolve({ _id: 'mock_' + Date.now() }) },
        update: function() { return Promise.resolve({ stats: { updated: 0 } }) },
        remove: function() { return Promise.resolve({ stats: { removed: 0 } }) }
      }
    }

    wx.cloud.database = function() {
      return {
        collection: function() { return createMockCollection() },
        command: self._originalDatabase().command,
        serverDate: function() { return new Date() }
      }
    }

    console.log('[reviewer] 审核模式已激活')
  },

  /**
   * 停用审核模式
   * 清除审核状态，恢复原始 wx.cloud.callFunction
   */
  deactivateReviewerMode() {
    this.globalData.isReviewer = false
    removeStorage(REVIEWER_SESSION_KEY)

    // 恢复原始 wx.cloud.callFunction
    if (this._originalCallFunction) {
      wx.cloud.callFunction = this._originalCallFunction
      this._originalCallFunction = null
    }

    // 恢复原始 wx.cloud.database
    if (this._originalDatabase) {
      wx.cloud.database = this._originalDatabase
      this._originalDatabase = null
    }

    console.log('[reviewer] 审核模式已停用')
  },

  restoreAuthState() {
    // 优先从新 key 恢复长期字段
    const coreCached = readStorage(AUTH_CORE_KEY)
    if (coreCached) {
      this.globalData.hasLogin = !!coreCached.hasLogin
      this.globalData.openid = coreCached.openid || null
    }

    // 恢复 profile（只要缓存存在就使用，由 updatedAt 版本比对保证一致性）
    const profileCached = readStorage(PROFILE_CACHE_KEY)
    if (profileCached && profileCached.data) {
      this.globalData.userProfile = profileCached.data
      this.globalData._profileUpdatedAt = profileCached.updatedAt || null
    }
  },

  persistAuthState() {
    // 长期缓存：身份标识（仅 openid + hasLogin）
    writeStorage(AUTH_CORE_KEY, {
      hasLogin: this.globalData.hasLogin,
      openid: this.globalData.openid
    })

    // 短期缓存：用户资料（带服务端 updatedAt 版本号）
    if (this.globalData.userProfile) {
      writeStorage(PROFILE_CACHE_KEY, {
        data: this.globalData.userProfile,
        updatedAt: this.globalData._profileUpdatedAt || null
      })
    }
  },

  setAuthState(payload) {
    Object.assign(this.globalData, payload)
    this.persistAuthState()
    return this.globalData
  },

  /* 
   *清除登录状态（用户信息缓存（内存+本地存储））
   */
  clearAuthState() {
    const defaults = getDefaultAuthState()
    this.globalData.hasLogin = defaults.hasLogin
    this.globalData.openid = defaults.openid
    this.globalData.userProfile = defaults.userProfile
    this.globalData._profileUpdatedAt = null
    // 显式清除身份与资料缓存
    removeStorage(AUTH_CORE_KEY)
    removeStorage(PROFILE_CACHE_KEY)
  },

  /* 
   *清除全部内存、缓存
   */
  clearOverallState() {
    //清除用户信息缓存（内存+本地存储）
    this.clearAuthState()
    //清除常量缓存、权限缓存（内存+本地存储）
    this.clearConstantsCache()
    this.clearPermissionCache()
  },

  getUserOpenId(callback) {
    this.getUserOpenIdViaCloud()
      .then((openid) => {
        if (callback) {
          callback(null, openid)
        }
      })
      .catch((error) => {
        if (callback) {
          callback(error)
        }
      })
  },

  getUserOpenIdViaCloud() {
    return wx.cloud.callFunction({
      name: 'wxContext',
      data: {}
    }).then((res) => {
      this.globalData.openid = res.result.openid
      this.persistAuthState()
      return res.result.openid
    })
  },

  callOfficeAuth(action, payload) {
    return wx.cloud.callFunction({
      name: 'officeAuth',
      data: Object.assign({
        action
      }, payload || {})
    }).then((res) => {
      const result = res.result || {}
      if (result.code !== 0) {
        const error = new Error(result.message || '请求失败')
        error.code = result.code || -1
        error.data = result.data || null
        throw error
      }
      return result.data || {}
    })
  },

  /**
   * 检查用户注册状态（支持 updatedAt 版本比对缓存）
   *
   * AUTH_CORE_KEY 与 PROFILE_CACHE_KEY 完全分离处理：
   * - Phase 1：AUTH_CORE_KEY（身份标识，简单）独立判断是否需要网络
   * - Phase 2：PROFILE_CACHE_KEY（用户资料，涉及 updatedAt 比对）独立判断是否需要网络
   * - Phase 3：任一 key 需要网络 → 发起请求；两者均有效 → 后台静默刷新
   * - Phase 4：响应处理时两个 key 各自独立写入
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.forceRefresh - 是否强制刷新（跳过缓存），默认 false
   * @returns {Promise<Object>} 用户注册信息
   */
  checkUserRegistration(options = {}) {
    const {
      forceRefresh = false
    } = options

    // 审核模式：直接返回 mock 注册用户信息
    if (this.globalData.isReviewer) {
      return Promise.resolve({
        registered: true,
        openid: '__reviewer__',
        user: reviewerMock.mockReviewerProfile,
        request: null,
        _fromCache: true
      })
    }

    // Phase 1：AUTH_CORE_KEY 独立处理（身份标识，简单）
    let authReady = false
    if (!forceRefresh) {
      const coreCached = readStorage(AUTH_CORE_KEY)
      if (coreCached && coreCached.hasLogin) {
        this.globalData.hasLogin = true
        this.globalData.openid = coreCached.openid
        authReady = true
      }
    }
    const authNeedsNetwork = forceRefresh || !authReady

    // Phase 2：PROFILE_CACHE_KEY 独立处理（用户资料，涉及 updatedAt 比对）
    // 注意：缓存读取始终执行——cachedUpdatedAt 用于服务端比对，
    // globalData.userProfile 用于网络失败降级。forceRefresh 只控制
    // 是否"认为 profile 已就绪可提前返回"，不跳过缓存恢复。
    let profileReady = false
    let cachedUpdatedAt = null
    const profileCached = readStorage(PROFILE_CACHE_KEY)
    if (profileCached && profileCached.data) {
      // 即使 forceRefresh，也恢复内存（网络失败时作为降级数据）
      if (!this.globalData.userProfile) {
        this.globalData.userProfile = profileCached.data
        this.globalData._profileUpdatedAt = profileCached.updatedAt || null
      }
      cachedUpdatedAt = profileCached.updatedAt
      // forceRefresh 时不认为 profile "ready"（仍需网络确认），但 cachedUpdatedAt 已就绪
      profileReady = !forceRefresh
    }
    const profileNeedsNetwork = forceRefresh || !profileReady

    // Phase 3：合并决策（任一 key 需要网络 → 发起请求）
    const needNetwork = authNeedsNetwork || profileNeedsNetwork
    if (!needNetwork) {
      // 两个 key 都有效，后台静默比对 updatedAt（不阻塞当前操作）
      console.log('用户信息缓存有效，后台静默刷新 profile')
      this._refreshProfileSilently()
      return Promise.resolve({
        registered: this.globalData.hasLogin,
        openid: this.globalData.openid,
        user: this.globalData.userProfile,
        request: null,
        _fromCache: true
      })
    }

    // 需要网络请求
    wx.showToast({
      title: '加载用户信息',
      icon: 'loading',
      duration: 2000
    })

    return this.callOfficeAuth('checkRegistration', {
      cachedUpdatedAt: cachedUpdatedAt
    }).then((data) => {
      // Phase 4a：处理 AUTH_CORE_KEY 响应（独立写）
      // openid 是微信身份标识，无论是否已注册都需要保存
      // （未注册用户也需要 openid 用于订阅消息授权记录等场景）
      if (data.openid) {
        this.globalData.openid = data.openid
      }
      if (data.registered) {
        writeStorage(AUTH_CORE_KEY, {
          hasLogin: true,
          openid: data.openid
        })
        this.globalData.hasLogin = true
      } else {
        // 用户未注册或已被删除，清除旧的身份和资料缓存
        // 防止 doLogin 命中旧缓存导致"已删除用户还能登录一次"
        // 注意：openid 保留（未注册用户也需要 openid 用于订阅消息授权等场景）
        this.globalData.hasLogin = false
        this.globalData.userProfile = null
        this.globalData._profileUpdatedAt = null
        removeStorage(AUTH_CORE_KEY)
        removeStorage(PROFILE_CACHE_KEY)
        // 重置静默刷新节流，允许后续 checkUserRegistration 正常走网络流程
        this._silentRefreshAt = 0
        this._silentRefreshPromise = null
        console.log('用户未注册或已被删除，已清除旧的身份和资料缓存')
      }

      // Phase 4b：处理 PROFILE_CACHE_KEY 响应（独立写）
      if (data.profileNotModified) {
        // 服务端确认 profile 未变化，使用内存缓存，仅同步 updatedAt
        console.log('用户 profile 未变化，使用缓存')
        if (data.updatedAt) {
          this.globalData._profileUpdatedAt = data.updatedAt
        }
      } else if (data.user) {
        // profile 有变化，更新内存和缓存
        this.globalData.userProfile = data.user
        this.globalData._profileUpdatedAt = data.updatedAt || null
        writeStorage(PROFILE_CACHE_KEY, {
          data: data.user,
          updatedAt: this.globalData._profileUpdatedAt
        })
        console.log('用户信息缓存加载成功')
      }

      wx.hideToast()
      return {
        registered: data.registered,
        openid: data.openid,
        user: this.globalData.userProfile,
        request: data.request || null,
        _fromCache: false
      }
    }).catch((error) => {
      wx.hideToast()
      // 网络失败：回退到内存数据（Phase 1/2 已恢复），保证数据一致性
      if (this.globalData.userProfile) {
        console.log('网络异常，降级使用内存数据')
        return Promise.resolve({
          registered: this.globalData.hasLogin,
          openid: this.globalData.openid,
          user: this.globalData.userProfile,
          request: null,
          _fromCache: true
        })
      }
      throw error
    })
  },

  /**
   * 后台静默刷新 profile（仅比对 updatedAt，不碰 AUTH_CORE_KEY）
   *
   * 当本地两个 key 缓存均有效时，异步向服务端确认 profile 是否变化。
   * 发现变化时更新内存和 PROFILE_CACHE_KEY；AUTH_CORE_KEY 不受影响。
   * 静默失败，不影响主流程。
   */
  _refreshProfileSilently() {
    const now = Date.now()

    // 节流：30 秒内不重复请求（登录后多次命中缓存的场景）
    if (this._silentRefreshAt && now - this._silentRefreshAt < 30000) {
      console.log('后台静默刷新跳过：30 秒内不重复请求')
      return
    }
    // 去重：已有请求在飞行中，跳过
    if (this._silentRefreshPromise) {
      console.log('后台静默刷新跳过：已有请求在飞行中')
      return
    }

    const profileCached = readStorage(PROFILE_CACHE_KEY)
    const cachedUpdatedAt = profileCached ? profileCached.updatedAt : null
    if (!cachedUpdatedAt) {
      return
    }

    this._silentRefreshAt = now
    this._silentRefreshPromise = this.callOfficeAuth('checkRegistration', {
      cachedUpdatedAt: cachedUpdatedAt
    }).then((data) => {
      if (data.profileNotModified) {
        console.log('后台静默刷新：profile 未变化')
        return
      }
      // profile 有变化，更新内存和缓存（不碰 AUTH_CORE_KEY）
      if (data.user) {
        this.globalData.userProfile = data.user
        this.globalData._profileUpdatedAt = data.updatedAt || null
        writeStorage(PROFILE_CACHE_KEY, {
          data: data.user,
          updatedAt: this.globalData._profileUpdatedAt
        })
        console.log('后台静默刷新：profile有变化，已更新')
      }
    }).catch(() => {
      // 静默失败，重置时间戳允许下次重试
      this._silentRefreshAt = 0
    }).then(() => {
      this._silentRefreshPromise = null
    })
  },

  submitRegistration(formData) {
    return this.callOfficeAuth('submitRegistration', {
      formData
    }).then((data) => {
      this.setAuthState({
        hasLogin: false,
        openid: data.openid || this.globalData.openid,
        userProfile: null
      })
      return data
    })
  },

  submitProfileUpdate(formData) {
    return this.callOfficeAuth('submitProfileUpdate', {
      formData
    }).then((data) => {
      return data
    })
  },

  submitDetailInfo(formData) {
    return this.callOfficeAuth('submitDetailInfo', {
      formData
    }).then((data) => {
      // 彻底清除 profile 缓存（内存 + 本地存储），使下次 checkUserRegistration 强制走网络获取最新数据
      this.globalData.userProfile = null
      this.globalData._profileUpdatedAt = null
      removeStorage(PROFILE_CACHE_KEY)
      // 重置静默刷新节流，允许 home 页 checkUserRegistration 正常走网络流程
      this._silentRefreshAt = 0
      this._silentRefreshPromise = null
      return data
    })
  },

  ensureApprovedUser() {
    return this.checkUserRegistration().then((data) => {
      if (data.registered && data.user) {
        return data.user
      }
      const error = new Error('当前用户尚未完成注册审批')
      error.code = 'UNAUTHORIZED'
      error.data = data
      throw error
    })
  },

  logout() {
    // 审核模式：停用审核模式并恢复原始 wx.cloud.callFunction
    if (this.globalData.isReviewer) {
      this.deactivateReviewerMode()
    }
    this.clearAuthState()
  },

  /**
   * 请求注册审批结果订阅（模板1）
   * 用户提交注册申请时调用，弹窗询问是否订阅
   * @returns {Promise<boolean>}
   */
  async requestRegistrationResultSubscribe() {
    const templateId = config.SUBSCRIBE_TEMPLATES.UNREAD_MESSAGE

    // 确保 openid 已获取（新用户首次注册时 globalData.openid 可能为空）
    if (!this.globalData.openid) {
      try {
        await this.getUserOpenIdViaCloud()
      } catch (e) {
        console.error('[订阅] 获取 openid 失败:', e)
      }
    }

    return wx.requestSubscribeMessage({
      tmplIds: [templateId]
    }).then((res) => {
      const subscribed = res[templateId] === 'accept'
      if (subscribed) {
        // 注册结果为一次性通知，微信侧自动管理额度，无需记账
      }
      return subscribed
    }).catch(() => {
      return false
    })
  },

  /**
   * 刷新微信侧订阅状态到本地缓存（onShow 时调用）
   * 读取 wx.getSetting 的 itemSettings，将每个模板的 accept/reject 状态缓存到 sub_status_
   * 供 subscribeOnTap 在 tap 手势上下文中同步读取（getSetting 异步，不能在 tap 中调用）
   */
  syncSubStatus() {
    const templates = [
      config.SUBSCRIBE_TEMPLATES.PENDING_APPROVAL,
      config.SUBSCRIBE_TEMPLATES.TRIP_REPORT,
      config.SUBSCRIBE_TEMPLATES.UNREAD_MESSAGE
    ]
    wx.getSetting({
      withSubscriptions: true,
      success: (settingRes) => {
        const itemSettings = settingRes.subscriptionsSetting && settingRes.subscriptionsSetting.itemSettings
        templates.forEach(id => {
          const status = (itemSettings && itemSettings[id]) || ''
          wx.setStorageSync(`sub_status_${id}`, status)
        })
      },
      fail: (err) => {
        console.error('[订阅] syncSubStatus getSetting 失败:', err)
      }
    })
  },

  /**
   * 功能面板 tap 时同步调用（必须在用户手势上下文中执行）
   * 根据本地缓存的 sub_status_ 决定行为：
   * - 'accept'  → 加入请求列表（微信静默自动同意，+1 额度）
   * - 'reject'  → 跳过
   * - ''        → 未设"总是"，检查 1 天节流后加入列表（弹微信原生订阅窗）
   * 调用成功后刷新 sub_status_（用户可能在此期间勾选了"总是"）
   * @param {string[]} types - 订阅类型数组（如 ['unread_message', 'pending_approval', 'trip_report']）
   */
  subscribeOnTap(types) {
    if (this.globalData.isReviewer) return
    if (!types || types.length === 0) return

    const typeToTemplate = {
      'pending_approval': config.SUBSCRIBE_TEMPLATES.PENDING_APPROVAL,
      'trip_report': config.SUBSCRIBE_TEMPLATES.TRIP_REPORT,
      'unread_message': config.SUBSCRIBE_TEMPLATES.UNREAD_MESSAGE
    }

    const now = Date.now()
    const ONE_DAY = 24 * 60 * 60 * 1000
    const toRequest = []

    types.forEach(type => {
      const id = typeToTemplate[type]
      if (!id) return

      const status = wx.getStorageSync(`sub_status_${id}`)

      if (status === 'reject') return

      if (status === 'accept') {
        // 总是接受 → 每次进面板静默充值额度
        toRequest.push(id)
        return
      }

      // 未设"总是" → 1 天节流，避免频繁弹窗
      const lastPrompt = wx.getStorageSync(`sub_last_prompt_${id}`)
      if (lastPrompt && now - lastPrompt < ONE_DAY) return
      wx.setStorageSync(`sub_last_prompt_${id}`, now)
      toRequest.push(id)
    })

    if (toRequest.length === 0) return

    // 防止并发
    if (this._subscribing) return
    this._subscribing = true

    wx.requestSubscribeMessage({
      tmplIds: toRequest,
      success: () => {
        // 刷新 sub_status_（用户可能在此期间勾选了"总是保持"）
        this.syncSubStatus()
      },
      fail: (err) => {
        console.error('[订阅] subscribeOnTap 失败:', err.errMsg || err)
      },
      complete: () => {
        this._subscribing = false
      }
    })
  },

  /**
   * 根据用户角色返回应订阅的消息类型
   * @param {Object} user - 用户对象
   * @returns {string[]} 订阅类型数组
   */
  getSubscribeTypesForUser(user) {
    if (!user) return []
    const types = ['unread_message']
    if (user.isAdmin) types.push('pending_approval')
    const isReceiver = (user.role === '馆员' && user.department === '无')
      || user.isDepartmentHead
      || user.isAreaManager
    if (isReceiver) types.push('trip_report')
    return types
  },

  addApprovalNotification(type, content) {
    const openid = this.globalData.openid
    if (!openid) {
      return
    }

    const db = wx.cloud.database()
    db.collection('notifications').add({
      data: {
        openid: openid,
        type: 'approval',
        title: `新的${type}`,
        content: content,
        read: false,
        createdAt: Date.now()
      }
    }).catch(error => {
      // 静默失败
    })
  },

  getNotifications(options, callback) {
    const openid = this.globalData.openid
    if (!openid) {
      callback([])
      return
    }

    const {
      page = 1, pageSize = 20
    } = options || {}

    const db = wx.cloud.database()
    db.collection('notifications')
      .where({
        openid: openid
      })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
      .then(res => {
        const data = res.data || []
        const result = {
          data: data,
          hasMore: data.length >= pageSize
        }

        if (callback && typeof callback === 'function') {
          callback(result)
        } else {
          return result
        }
      })
      .catch(error => {
        const errorResult = {
          data: [],
          hasMore: false
        }

        if (callback && typeof callback === 'function') {
          callback(errorResult)
        } else {
          return errorResult
        }
      })
  },

  markNotificationAsRead(id, callback) {
    wx.cloud.callFunction({
      name: 'notificationManager',
      data: {
        action: 'markAsRead',
        notificationId: id
      }
    }).then(res => {
      if (callback) callback(res.result.success)
    }).catch(error => {
      if (callback) callback(false)
    })
  },

  clearAllNotifications(callback) {
    wx.cloud.callFunction({
      name: 'notificationManager',
      data: {
        action: 'clearAll'
      }
    }).then(res => {
      if (callback) callback(res.result.success)
    }).catch(error => {
      if (callback) callback(false)
    })
  },

  // ========== 权限管理相关方法 ==========

  /**
 * 功能：直接调用云函数检查用户是否有指定功能的访问权限
 * 注意：该函数不应为外部调用。外部检查权限应统一调用navigateWithPermission()方法
 * @param {string} featureKey - 功能标识，如 'medical_application'
 * @returns {Promise<boolean>} 是否有权限
 */
  checkPermission(featureKey) {
    // 审核模式：所有权限直接放行
    if (this.globalData.isReviewer) {
      return Promise.resolve(true)
    }

    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'checkPermission',
        featureKey: featureKey
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        return false
      }
      return result.data ? result.data.allowed : false
    }).catch(error => {
      console.error('权限检查失败:', error)
      return false
    })
  },

  /**
   * 带权限检查的页面跳转
   * 优先使用缓存，无缓存时实时检查，开发/体验版无权限可跳过
   * @param {string} featureKey 功能权限key
   * @param {string} url 目标页面路径
   * @param {string} featureName 功能名称（用于提示）
   */
  navigateWithPermission(featureKey, url, featureName) {
    // 审核模式：直接放行
    if (this.globalData.isReviewer) {
      wx.navigateTo({ url })
      return
    }

    // 优先使用缓存权限
    const cache = this.getPermissionCache()
    const cachedValue = cache ? cache[featureKey] : undefined

    if (cachedValue === true) {
      wx.navigateTo({ url })
      return
    }

    if (cachedValue === false) {
      if (this._checkDevTrial(featureName, url)) return
      wx.showModal({
        title: '权限提示',
        content: `您没有权限使用「${featureName}」功能`,
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    // 缓存未命中，实时检查
    wx.showLoading({ title: '检查权限...', mask: true })
    this.checkPermission(featureKey).then(allowed => {
      wx.hideLoading()
      // 更新缓存（写入 app 全局缓存）
      const newCache = { ...(this.getPermissionCache() || {}), [featureKey]: allowed }
      this.persistPermissionCache(newCache)

      if (allowed) {
        wx.navigateTo({ url })
        return
      }
      if (this._checkDevTrial(featureName, url)) return
      wx.showModal({
        title: '权限提示',
        content: `您没有权限使用「${featureName}」功能`,
        showCancel: false,
        confirmText: '我知道了'
      })
    }).catch(() => {
      wx.hideLoading()
      if (this._checkDevTrial(featureName, url)) return
      wx.showToast({ title: '权限检查失败', icon: 'none' })
    })
  },

  /**
   * 带权限检查的 TabBar 页面守卫（用于已通过 switchTab 进入的 TabBar 页）
   * 优先使用缓存，无缓存时实时检查，开发/体验版无权限可跳过
   * @param {string} featureKey 功能权限key
   * @param {string} featureName 功能名称（用于提示）
   * @returns {Promise<boolean>} 是否允许继续
   */
  switchTabWithPermission(featureKey, featureName) {
    // 审核模式：直接放行
    if (this.globalData.isReviewer) {
      return Promise.resolve(true)
    }

    return new Promise((resolve) => {
      // 优先使用缓存权限
      const cache = this.getPermissionCache()
      const cachedValue = cache ? cache[featureKey] : undefined

      if (cachedValue === true) {
        resolve(true)
        return
      }

      if (cachedValue === false) {
        if (this._checkDevTrialForTab(featureName, resolve)) return
        wx.showModal({
          title: '权限提示',
          content: `您没有权限使用「${featureName}」功能`,
          showCancel: false,
          confirmText: '我知道了',
          success: () => {
            wx.switchTab({ url: '/pages/office/home/home' })
            resolve(false)
          }
        })
        return
      }

      // 缓存未命中，实时检查
      wx.showLoading({ title: '检查权限...', mask: true })
      this.checkPermission(featureKey).then(allowed => {
        wx.hideLoading()
        // 更新缓存
        const newCache = { ...(this.getPermissionCache() || {}), [featureKey]: allowed }
        this.persistPermissionCache(newCache)

        if (allowed) {
          resolve(true)
          return
        }
        if (this._checkDevTrialForTab(featureName, resolve)) return
        wx.showModal({
          title: '权限提示',
          content: `您没有权限使用「${featureName}」功能`,
          showCancel: false,
          confirmText: '我知道了',
          success: () => {
            wx.switchTab({ url: '/pages/office/home/home' })
            resolve(false)
          }
        })
      }).catch(() => {
        wx.hideLoading()
        if (this._checkDevTrialForTab(featureName, resolve)) return
        wx.showToast({ title: '权限检查失败', icon: 'none' })
        resolve(false)
      })
    })
  },

  /**
   * 检查当前是否为开发版或体验版，是则弹窗允许跳过权限
   * @param {string} featureName 功能名称
   * @param {string} url 目标页面路径
   * @returns {boolean} 是否已处理（弹窗）
   */
  _checkDevTrial(featureName, url) {
    try {
      const info = wx.getAccountInfoSync()
      const env = info.miniProgram.envVersion
      if (env === 'develop' || env === 'trial') {
        wx.showModal({
          title: '权限提示',
          content: `您没有权限使用「${featureName}」功能，但当前小程序为体验版，可以体验测试。`,
          confirmText: '继续体验',
          cancelText: '返回',
          success: (res) => { if (res.confirm) wx.navigateTo({ url }) }
        })
        return true
      }
    } catch (e) { }
    return false
  },

  /**
   * TabBar 版本的开发/体验版跳过权限检查
   * @param {string} featureName 功能名称
   * @param {Function} resolve Promise resolve 回调
   * @returns {boolean} 是否已处理（弹窗）
   */
  _checkDevTrialForTab(featureName, resolve) {
    try {
      const info = wx.getAccountInfoSync()
      const env = info.miniProgram.envVersion
      if (env === 'develop' || env === 'trial') {
        wx.showModal({
          title: '权限提示',
          content: `您没有权限使用「${featureName}」功能，但当前小程序为体验版，可以体验测试。`,
          confirmText: '继续体验',
          cancelText: '返回',
          success: (res) => { resolve(res.confirm) }
        })
        return true
      }
    } catch (e) { }
    return false
  },

  /**
   * 获取权限详细信息
   * @param {string} featureKey - 功能标识
   * @returns {Promise<Object>} 权限信息
   */
  getPermissionInfo(featureKey) {
    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'checkPermission',
        featureKey: featureKey
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '权限检查失败')
      }
      return result.data || {}
    })
  },

  /**
   * 批量检查多个功能的权限
   * @param {string[]} featureKeys - 功能标识数组
   * @returns {Promise<Object>} 权限检查结果
   */
  batchCheckPermissions(featureKeys) {
    // 审核模式：所有权限直接放行
    if (this.globalData.isReviewer) {
      const permissions = {}
      ;(featureKeys || []).forEach(key => {
        permissions[key] = { allowed: true }
      })
      return Promise.resolve({ permissions })
    }

    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'batchCheckPermissions',
        featureKeys: featureKeys
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '批量权限检查失败')
      }
      return result.data || {}
    })
  },

  /**
   * 初始化权限配置（仅管理员可调用）
   * @returns {Promise<Object>} 初始化结果
   */
  initPermissions() {
    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'initPermissions'
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '权限初始化失败')
      }
      return result.data || {}
    })
  },

  /**
   * 获取所有权限配置（仅管理员）
   * @returns {Promise<Object>} 权限配置列表
   */
  listPermissions() {
    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'listPermissions'
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '获取权限配置失败')
      }
      return result.data || {}
    })
  },

  /**
   * 更新权限配置（仅管理员）
   * @param {string} featureKey - 功能标识
   * @param {Object} config - 配置信息
   * @returns {Promise<Object>} 更新结果
   */
  updatePermission(featureKey, config) {
    return wx.cloud.callFunction({
      name: 'permissionManager',
      data: {
        action: 'updatePermission',
        featureKey: featureKey,
        config: config
      }
    }).then(res => {
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '更新权限配置失败')
      }
      return result.data || {}
    })
  },

  // ========== 常量缓存相关方法 ==========

  /**
   * 从本地存储恢复常量缓存
   */
  restoreConstantsCache() {
    const cached = readStorage(CONSTANTS_CACHE_KEY)
    if (!cached || !cached.version) {
      return null
    }

    this.globalData.constantsCache = cached.data
    return cached.data
  },

  /**
   * 持久化常量缓存到本地存储
   */
  persistConstantsCache(data) {
    this.globalData.constantsCache = data
    writeStorage(CONSTANTS_CACHE_KEY, {
      data: data,
      version: config.CACHE_VERSION
    })
  },

  /**
   * 获取常量缓存（同步）
   * @returns {Object|null} 常量缓存数据
   */
  getConstantsCache() {
    // 优先从内存获取
    if (this.globalData.constantsCache) {
      return this.globalData.constantsCache
    }
    // 尝试从本地存储恢复
    return this.restoreConstantsCache()
  },

  /**
   * 预加载常量到缓存
   * 在登录成功后调用，提前加载常量避免后续页面重复请求
   * @returns {Promise<Object>} 常量数据
   */
  loadConstants() {
    // 先检查是否已有有效缓存
    const cached = this.getConstantsCache()
    if (cached) {
      console.log('常量缓存已存在，跳过加载')
      return Promise.resolve(cached)
    }

    // 调用云函数获取配置
    return wx.cloud.callFunction({
      name: 'getSystemConfig'
    }).then(res => {
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '获取配置失败')
      }

      const configs = res.result.data || {}

      // 将按类型分组的配置转换为键值对
      const constants = {}
      for (const type in configs) {
        for (const key in configs[type]) {
          constants[key] = configs[type][key]
        }
      }

      // 持久化缓存
      this.persistConstantsCache(constants)
      console.log('常量缓存加载成功')
      return constants
    }).catch(error => {
      console.error('加载常量缓存失败:', error)
      throw error
    })
  },

  /**
   * 清除常量缓存
   */
  clearConstantsCache() {
    this.globalData.constantsCache = null
    removeStorage(CONSTANTS_CACHE_KEY)
  },



  /**
   * 获取单个常量值（异步）
   * @param {string} key - 常量键名
   * @returns {Promise<any>} 常量值
   */
  getConstant(key) {
    return this.getAllConstants().then(constants => constants[key])
  },

  /**
   * 同步获取单个常量值（从缓存或默认值）
   * @param {string} key - 常量键名
   * @returns {any} 常量值
   */
  getConstantSync(key) {
    // 优先从缓存获取
    const cached = this.getConstantsCache()
    if (cached && cached[key] !== undefined) {
      return cached[key]
    }
    // 缓存未命中，返回 undefined（调用方自行处理）
    return undefined
  },

  /**
   * 获取所有常量（异步，带缓存）
   * @returns {Promise<Object>} 所有常量的键值对
   */
  getAllConstants() {
    // 检查缓存
    const cached = this.getConstantsCache()
    if (cached) {
      return Promise.resolve(cached)
    }
    // 加载常量
    return this.loadConstants()
  },

  // ========== 权限缓存相关方法 ==========

  /**
   * 从本地存储恢复权限缓存
   */
  restorePermissionCache() {
    const cached = readStorage(PERMISSION_CACHE_KEY)
    if (!cached || !cached.permissions) {
      return null
    }

    this.globalData.permissionCache = cached.permissions
    return cached.permissions
  },

  /**
   * 持久化权限缓存到本地存储
   */
  persistPermissionCache(permissions) {
    this.globalData.permissionCache = permissions
    writeStorage(PERMISSION_CACHE_KEY, {
      permissions: permissions
    })
  },

  /**
   * 获取权限缓存（同步）
   * @returns {Object|null} 权限缓存数据
   */
  getPermissionCache() {
    // 优先从内存获取
    if (this.globalData.permissionCache) {
      return this.globalData.permissionCache
    }
    // 尝试从本地存储恢复
    return this.restorePermissionCache()
  },

  /**
   * 批量加载权限并缓存
   * @param {string[]} featureKeys - 功能标识数组
   * @returns {Promise<Object>} 权限数据
   */
  loadPermissionCache(featureKeys) {
    // 不传或传空数组则自动加载所有权限
    featureKeys = featureKeys || []

    // 先检查是否已有有效缓存
    const cached = this.getPermissionCache()
    if (cached) {
      console.log('权限缓存已存在，跳过加载')
      return Promise.resolve(cached)
    }

    return this.batchCheckPermissions(featureKeys).then(result => {
      const perms = result.permissions || {}
      // 使用云函数返回的所有权限键构建缓存（云函数内部会处理空 key 自动查询）
      const permissions = {}
      Object.keys(perms).forEach(key => {
        permissions[key] = perms[key].allowed
      })

      // 持久化缓存
      this.persistPermissionCache(permissions)
      console.log('权限缓存加载成功')
      return permissions
    }).catch(error => {
      console.error('加载权限缓存失败:', error)
      throw error
    })
  },

  /**
   * 清除权限缓存
   */
  clearPermissionCache() {
    this.globalData.permissionCache = null
    removeStorage(PERMISSION_CACHE_KEY)
  }
})