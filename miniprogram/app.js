const config = require('./config')
const themeListeners = []
const USER_INFO_CACHE_KEY = 'app-user-info-cache'
const CONSTANTS_CACHE_KEY = 'app-constants-cache'
const PERMISSION_CACHE_KEY = 'app-permission-cache'
const SUBSCRIBE_REQUEST_KEY = 'office-subscribe-requested'
const VERSION_CACHE_KEY = 'app-cache-version'
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

global.isDemo = true

function getDefaultAuthState() {
  return {
    hasLogin: false,
    openid: null,
    userProfile: null,
    registrationRequest: null,
    authStatus: 'anonymous'
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

function hasRequestedSubscribe() {
  try {
    return wx.getStorageSync(SUBSCRIBE_REQUEST_KEY) || false
  } catch (error) {
    return false
  }
}

function setSubscribeRequested() {
  try {
    wx.setStorageSync(SUBSCRIBE_REQUEST_KEY, true)
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
  },

  // 读取字体缩放缓存并设置
  readAndSetFontScale() {
    const cached = readStorage(FONTSIZE_CACHE_KEY)
    const scale = cached ? cached.scale : 1.1
    this.globalData.fontScale = scale
    this.globalData.fontStyle = this.generateFontStyle(scale)
  },

  // 根据 fontScale 生成所有令牌的 CSS 变量字符串
  generateFontStyle(scale) {
    const vars = Object.entries(FONT_TOKENS)
      .map(([key, baseRpx]) => {
        const scaled = Math.round(baseRpx * scale * 100) / 100
        return `--fs-${key}: ${scaled}rpx`
      })
      .join('; ')
    return vars
  },

  /**
   * 检查缓存版本号，版本变化时清除常量、权限的内存、缓存
   * （但不更新缓存版本号，后续在updateCacheVersionAndShowWhatsNew函数更新缓存版本号并showModal）
   */
  checkCacheVersion() {
    const storedVersion = readStorage(VERSION_CACHE_KEY)
    if (storedVersion !== config.CACHE_VERSION) {
      //清除常量、权限的内存、缓存
      this.clearConstantsCache()
      this.clearPermissionCache()
      console.log('新版缓存为' + config.CACHE_VERSION + '，现已清除旧内存、缓存（PERMISSION_CACHE_KEY, CONSTANTS_CACHE_KEY）')
    } else {
      console.log('缓存版本未变，为' + storedVersion)
    }
  },

  //登录后调用，更新缓存版本号，展示更新说明modal
  updateCacheVersionAndShowWhatsNew() {
    const storedVersion = readStorage(VERSION_CACHE_KEY)
    if (storedVersion !== config.CACHE_VERSION) {
      writeStorage(VERSION_CACHE_KEY, config.CACHE_VERSION)
      console.log('缓存版本已更新为' + config.CACHE_VERSION)
      wx.showModal({
        title: '版本' + config.CACHE_VERSION + '更新说明',
        content: config.VERSION_DESCRIPTION,
        showCancel: false,
        confirmText: '我知道了'
      })
    } else {
      console.log('缓存版本未变，为' + storedVersion)
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
    iconTabbar: '/page/weui/example/images/icon_tabbar.png',
    targetApprovalTab: null, // 目标审批tab（用于消息跳转：'pending'=待审批, 'mine'=我的发起）
    constantsCache: null, // 常量缓存
    permissionCache: null, // 权限缓存
    fontScale: 1.1, // ← 新增，字体缩放默认值
    fontStyle: '', // ← 新增
    isDevEnv: false, // 是否为开发环境（开发者工具），onLaunch 时计算一次
  }, getDefaultAuthState()),

  restoreAuthState() {
    const cached = readStorage(USER_INFO_CACHE_KEY)
    if (!cached) {
      return
    }

    this.globalData.hasLogin = !!cached.hasLogin
    this.globalData.openid = cached.openid || null
    this.globalData.userProfile = cached.userProfile || null
    this.globalData.registrationRequest = cached.registrationRequest || null
    this.globalData.authStatus = cached.authStatus || 'anonymous'
  },

  persistAuthState() {
    writeStorage(USER_INFO_CACHE_KEY, {
      hasLogin: this.globalData.hasLogin,
      openid: this.globalData.openid,
      userProfile: this.globalData.userProfile,
      registrationRequest: this.globalData.registrationRequest,
      authStatus: this.globalData.authStatus
    })
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
    //清除用户信息内存
    const defaults = getDefaultAuthState()
    this.globalData.hasLogin = defaults.hasLogin
    this.globalData.openid = defaults.openid
    this.globalData.userProfile = defaults.userProfile
    this.globalData.registrationRequest = defaults.registrationRequest
    this.globalData.authStatus = defaults.authStatus
    // 清除用户信息本地存储
    this.clearUserInfoCache()
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
   * 检查用户注册状态
   * @param {Object} options - 配置选项
   * @param {boolean} options.forceRefresh - 是否强制刷新（跳过缓存），默认 false
   * @returns {Promise<Object>} 用户注册信息
   */
  checkUserRegistration(options = {}) {
    const {
      forceRefresh = false
    } = options

    // 非强制刷新时，先检查缓存
    if (!forceRefresh) {
      const cached = readStorage(USER_INFO_CACHE_KEY)
      if (cached && cached.hasLogin) {
        // 缓存有效，直接返回
        console.log('用户信息缓存已存在，跳过加载')
        return Promise.resolve({
          registered: cached.hasLogin,
          openid: cached.openid,
          user: cached.userProfile,
          request: cached.registrationRequest,
          authStatus: cached.authStatus,
          _fromCache: true
        })
      }
    }

    // 显示加载提示
    wx.showToast({
      title: '缓存用户信息中',
      icon: 'loading',
      duration: 2000
    })

    // 调用云函数获取最新数据
    return this.callOfficeAuth('checkRegistration').then((data) => {
      this.setAuthState({
        hasLogin: !!data.registered,
        openid: data.openid || this.globalData.openid,
        userProfile: data.user || null,
        registrationRequest: data.request || null,
        authStatus: data.authStatus || 'anonymous'
      })
      console.log('用户信息缓存加载成功')
      wx.hideToast()
      return data
    }).catch((error) => {
      wx.hideToast()
      throw error
    })
  },

  submitRegistration(formData) {
    return this.callOfficeAuth('submitRegistration', {
      formData
    }).then((data) => {
      this.setAuthState({
        hasLogin: false,
        openid: data.openid || this.globalData.openid,
        userProfile: null,
        registrationRequest: data.request || null,
        authStatus: data.authStatus || 'pending'
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
    this.clearAuthState()
  },

  requestSubscribeMessage() {
    if (hasRequestedSubscribe()) {
      return Promise.resolve(false)
    }

    return wx.requestSubscribeMessage({
      tmplIds: ['y1bXHAg_oDuvrQ3pHgcODcMPl-2hZHenWugsqdB2CXY']
    }).then((res) => {
      const subscribed = res['y1bXHAg_oDuvrQ3pHgcODcMPl-2hZHenWugsqdB2CXY'] === 'accept'
      if (subscribed) {
        setSubscribeRequested()
        this.saveSubscriptionRecord()
      }
      return subscribed
    }).catch(() => {
      return false
    })
  },

  saveSubscriptionRecord() {
    const openid = this.globalData.openid
    if (!openid) {
      return
    }

    const db = wx.cloud.database()
    db.collection('subscriptions').add({
      data: {
        openid: openid,
        templateId: 'y1bXHAg_oDuvrQ3pHgcODcMPl-2hZHenWugsqdB2CXY',
        createdAt: new Date(),
        status: 'subscribed'
      }
    }).catch(error => {
      // 静默失败
    })
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
    } catch (e) {}
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
    } catch (e) {}
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

    // 检查版本号是否匹配
    if (cached.version !== config.CACHE_VERSION) {
      removeStorage(CONSTANTS_CACHE_KEY)
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
  },

  /**
   * 清除用户信息缓存
   */
  clearUserInfoCache() {
    removeStorage(USER_INFO_CACHE_KEY)
  }
})