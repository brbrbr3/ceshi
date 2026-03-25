const config = require('./config')
const themeListeners = []
const AUTH_STORAGE_KEY = 'office-auth-cache'
const USER_CACHE_EXPIRE = 30 * 60 * 1000 // 用户信息缓存30分钟
const SUBSCRIBE_REQUEST_KEY = 'office-subscribe-requested'
const SYS_CONFIG_INIT_KEY = 'office-sys-config-initialized'
const WORKFLOW_INIT_KEY = 'office-workflow-initialized'

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
    this.restoreAuthState()
    // 初始化函数改为手动调用（通过 login 页面的调试模式）
  },

  onShow(opts) {
    // App 显示
  },

  onHide() {
    // App 隐藏
  },

  onThemeChange({ theme }) {
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
  }, getDefaultAuthState()),

  restoreAuthState() {
    const cached = readStorage(AUTH_STORAGE_KEY)
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
    writeStorage(AUTH_STORAGE_KEY, {
      hasLogin: this.globalData.hasLogin,
      openid: this.globalData.openid,
      userProfile: this.globalData.userProfile,
      registrationRequest: this.globalData.registrationRequest,
      authStatus: this.globalData.authStatus,
      timestamp: Date.now() // 添加时间戳用于缓存过期判断
    })
  },

  setAuthState(payload) {
    Object.assign(this.globalData, payload)
    this.persistAuthState()
    return this.globalData
  },

  clearAuthState() {
    const defaults = getDefaultAuthState()
    this.globalData.hasLogin = defaults.hasLogin
    this.globalData.openid = defaults.openid
    this.globalData.userProfile = defaults.userProfile
    this.globalData.registrationRequest = defaults.registrationRequest
    this.globalData.authStatus = defaults.authStatus
    removeStorage(AUTH_STORAGE_KEY)
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
      data: Object.assign({ action }, payload || {})
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
    const { forceRefresh = false } = options

    // 非强制刷新时，先检查缓存
    if (!forceRefresh) {
      const cached = readStorage(AUTH_STORAGE_KEY)
      if (cached && cached.timestamp && (Date.now() - cached.timestamp < USER_CACHE_EXPIRE)) {
        // 缓存有效，直接返回
        console.log('使用缓存的用户信息')
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
      wx.hideToast()
      return data
    }).catch((error) => {
      wx.hideToast()
      throw error
    })
  },

  submitRegistration(formData) {
    return this.callOfficeAuth('submitRegistration', { formData }).then((data) => {
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
    return this.callOfficeAuth('submitProfileUpdate', { formData }).then((data) => {
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

    const { page = 1, pageSize = 20 } = options || {}

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
   * 检查用户是否有权限访问指定功能
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

  // ========== 数据库初始化相关方法 ==========

  /**
   * 初始化系统配置（将常量写入数据库）
   * 使用本地存储标记避免重复初始化
   */
  initSystemConfig() {
    const initialized = readStorage(SYS_CONFIG_INIT_KEY)

    // 如果已经初始化过，则跳过
    if (initialized) {
      // 即使跳过，也要继续执行后续初始化
      this.initWorkflowTemplates()
      return
    }

    // 调用云函数初始化系统配置
    wx.cloud.callFunction({
      name: 'initSystemConfig',
      data: {}
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0) {
        console.log('系统配置初始化成功:', result.data)
        // 标记为已初始化
        writeStorage(SYS_CONFIG_INIT_KEY, {
          initialized: true,
          timestamp: Date.now(),
          data: result.data
        })
      } else {
        console.warn('系统配置初始化失败:', result.message)
      }
    }).catch(error => {
      console.error('系统配置初始化异常:', error)
      // 静默失败，不影响用户使用
    }).finally(() => {
      // 无论成功失败，都继续执行后续初始化
      this.initWorkflowTemplates()
    })
  },

  /**
   * 重新初始化系统配置（用于强制刷新配置）
   * @returns {Promise<Object>} 初始化结果
   */
  reinitSystemConfig() {
    return wx.cloud.callFunction({
      name: 'initSystemConfig',
      data: {}
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0) {
        console.log('系统配置重新初始化成功:', result.data)
        // 更新初始化标记
        writeStorage(SYS_CONFIG_INIT_KEY, {
          initialized: true,
          timestamp: Date.now(),
          data: result.data
        })
        return result.data
      } else {
        throw new Error(result.message || '重新初始化失败')
      }
    })
  },

  /**
   * 初始化工作流模板（确保必需的工作流模板已导入）
   * 使用本地存储标记避免重复初始化
   */
  initWorkflowTemplates() {
    const initialized = readStorage(WORKFLOW_INIT_KEY)

    // 如果已经初始化过，则跳过
    if (initialized) {
      return
    }

    // 调用云函数初始化工作流模板
    wx.cloud.callFunction({
      name: 'initWorkflowDB',
      data: {}
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0) {
        console.log('工作流模板初始化成功:', result.data)
        // 标记为已初始化
        writeStorage(WORKFLOW_INIT_KEY, {
          initialized: true,
          timestamp: Date.now(),
          data: result.data
        })
      } else {
        console.warn('工作流模板初始化失败:', result.message)
      }
    }).catch(error => {
      console.error('工作流模板初始化异常:', error)
      // 静默失败，不影响用户使用
    })
  },

  /**
   * 重新初始化工作流模板（用于强制刷新模板）
   * @returns {Promise<Object>} 初始化结果
   */
  reinitWorkflowTemplates() {
    return wx.cloud.callFunction({
      name: 'initWorkflowDB',
      data: {}
    }).then(res => {
      const result = res.result || {}
      if (result.code === 0) {
        console.log('工作流模板重新初始化成功:', result.data)
        // 更新初始化标记
        writeStorage(WORKFLOW_INIT_KEY, {
          initialized: true,
          timestamp: Date.now(),
          data: result.data
        })
        return result.data
      } else {
        throw new Error(result.message || '重新初始化失败')
      }
    })
  }
})
