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
   * 获取默认常量（降级方案）
   * 当云函数不可用时使用硬编码默认值
   * @returns {Object} 默认常量
   */
  getDefaultConstants() {
    return {
      // 角色相关
      ROLE_OPTIONS: ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属'],
      ROLE_POSITION_MAP: {
        '馆领导': ['无', '人事主管', '会计主管'],
        '部门负责人': ['无', '人事主管', '会计主管', '会计', '出纳', '俱乐部', '阳光课堂'],
        '馆员': ['无', '礼宾', '会计', '出纳', '俱乐部', '阳光课堂'],
        '工勤': ['招待员', '厨师'],
        '配偶': ['无', '出纳', '内聘']
      },
      NEED_RELATIVE_ROLES: ['配偶', '家属'],
      DEFAULT_ROLE: '',

      // 岗位相关
      POSITION_OPTIONS: ['无', '人事主管', '会计主管', '礼宾', '会计', '出纳', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘'],
      DEFAULT_POSITION: '',

      // 部门相关
      DEPARTMENT_OPTIONS: ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', 'DW办'],
      DEFAULT_DEPARTMENT: '',

      // 角色-字段显示映射关系
      ROLE_FIELD_VISIBILITY: {
        '馆领导': {
          showPosition: true,
          showDepartment: false,
          fixedDepartment: null
        },
        '部门负责人': {
          showPosition: true,
          showDepartment: true,
          fixedDepartment: null
        },
        '馆员': {
          showPosition: true,
          showDepartment: true,
          fixedDepartment: null
        },
        '工勤': {
          showPosition: true,
          showDepartment: true,
          fixedDepartment: '办公室'
        },
        '物业': {
          showPosition: false,
          showDepartment: true,
          fixedDepartment: '办公室'
        },
        '配偶': {
          showPosition: true,
          showDepartment: false,
          fixedDepartment: null
        },
        '家属': {
          showPosition: false,
          showDepartment: false,
          fixedDepartment: null
        }
      },

      // 性别相关
      GENDER_OPTIONS: ['男', '女'],
      DEFAULT_GENDER: '男',

      // 请求状态
      REQUEST_STATUS: {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        TERMINATED: 'terminated'
      },
      REQUEST_STATUS_TEXT: {
        pending: '待审批',
        approved: '已通过',
        rejected: '已驳回',
        terminated: '已中止'
      },
      REQUEST_STATUS_STYLE: {
        pending: {
          color: '#D97706',
          bg: '#FEF3C7'
        },
        approved: {
          color: '#16A34A',
          bg: '#DCFCE7'
        },
        rejected: {
          color: '#DC2626',
          bg: '#FEE2E2'
        },
        terminated: {
          color: '#DC2626',
          bg: '#FEE2E2'
        }
      },

      // 工作流状态
      TASK_STATUS: {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        CANCELLED: 'cancelled',
        RETURNED: 'returned'
      },
      ORDER_STATUS: {
        PENDING: 'pending',
        SUPPLEMENT: 'supplement',
        COMPLETED: 'completed',
        REJECTED: 'rejected',
        CANCELLED: 'cancelled',
        TERMINATED: 'terminated'
      },

      // 工作流步骤类型
      STEP_TYPE: {
        SERIAL: 'serial',
        PARALLEL: 'parallel',
        CONDITION: 'condition'
      },

      // 审批人类型
      APPROVER_TYPE: {
        USER: 'user',
        ROLE: 'role',
        DEPT: 'dept',
        EXPRESSION: 'expression'
      },

      // 超时处理动作
      TIMEOUT_ACTION: {
        AUTO_APPROVE: 'auto_approve',
        AUTO_REJECT: 'auto_reject',
        ESCALATE: 'escalate',
        REMIND: 'remind'
      },

      // 工作流操作类型枚举
      WORKFLOW_ACTION: {
        START: 'start',
        APPROVE: 'approve',
        REJECT: 'reject',
        RETURN: 'return',
        COMPLETE: 'complete',
        CANCEL: 'cancel',
        TERMINATE: 'terminate',
        SUPPLEMENT: 'supplement'
      },

      // 工作流操作类型中文映射
      WORKFLOW_ACTION_TEXT: {
        start: '提交工单',
        approve: '审批通过',
        reject: '审批驳回',
        return: '退回补充',
        complete: '流程完成',
        cancel: '撤回工单',
        terminate: '中止工单',
        supplement: '补充资料'
      },

      // 时区配置
      TIMEZONE_OFFSET: -3,
      TIMEZONE_NAME: 'America/Sao_Paulo',

      // 就医申请相关
      RELATION_OPTIONS: ['本人', '配偶', '子女', '父母', '其他'],
      MEDICAL_INSTITUTIONS: [
        'Hospital Sírio-Libanês（私立综合性医院）',
        'DF Star-Rede D\'OR（私立综合性医院）',
        'Hospital Brasília（私立综合性医院）',
        'Hospital Daher（私立综合性医院）',
        'Hospital Santa Lúcia（私立综合性医院）',
        'Hospital Santa Luzia（私立综合性医院）',
        'Hospital Home（私立综合性医院，骨科专长）',
        'Sarah Kubitschek（公立医院 – 残障人士友好）',
        'Hospital das Forças Armadas （公立综合性医院）',
        'Rita Trindade（牙科）',
        'Clínica Implanto Odontologia Especializada（牙科）',
        'CBV（眼科）',
        'Laboratório Sabin（巴西临床医学典范）',
        'Cote Brasília（骨科）',
        'Aluma Dermatologia e Laser（皮肤科）',
        'Rheos. Reumatologia e Clínica Médica（风湿科）',
        'Prodigest（消化科）',
        'CEOL ENT-Otorhinolaryngology Clinic（耳鼻喉科）',
        'Centro de Acupuntura Shen（针灸、艾灸）',
        'Consultório Natasha Ferraroni（过敏）',
        'Hospital Materno Infantil de Brasília（妇幼专科）',
        '其他'
      ],

      // 通知消息类型
      NOTIFICATION_TYPES: {
        MENU: 'menu',
        NEW_REGISTRATION: 'new_registration',
        TASK_ASSIGNED: 'task_assigned',
        TASK_COMPLETED: 'task_completed',
        PROCESS_RETURNED: 'process_returned',
        WORKFLOW_COMPLETED: 'workflow_completed',
        ORDER_TERMINATED: 'order_terminated'
      },

      // 通知消息类型与跳转tab映射
      NOTIFICATION_TARGET_TAB: {
        menu: 'none',
        new_registration: 'pending',
        task_assigned: 'pending',
        task_completed: 'mine',
        process_returned: 'mine',
        workflow_completed: 'mine',
        order_terminated: 'mine'
      },

      // 审批中心配置
      APPROVAL_REVIEWER_ROLES: ['馆领导', '部门负责人'],
      APPROVAL_TABS: [{
          key: 'pending',
          label: '待审批'
        },
        {
          key: 'mine',
          label: '我发起的'
        },
        {
          key: 'done',
          label: '已处理'
        }
      ],
      APPROVAL_TAB_PERMISSION: {
        withReview: ['pending', 'mine', 'done'],
        withoutReview: ['mine']
      },

      // 物业报修相关
      REPAIR_LIVING_AREAS: ['本部', '馆周边', '5号院', '8号院', '湖畔'],

      // 外出报备相关
      TRAVEL_MODES: ['自驾', '搭车', '打车', '步行'],
      TRIP_STATUS: {
        OUT: 'out',
        RETURNED: 'returned',
        OVERTIME: 'overtime'
      },
      TRIP_STATUS_TEXT: {
        out: '外出中',
        returned: '已返回',
        overtime: '超时未归'
      },
      TRIP_STATUS_STYLE: {
        out: {
          color: '#2563EB',
          bg: '#EFF6FF',
          icon: '🚗'
        },
        returned: {
          color: '#16A34A',
          bg: '#DCFCE7',
          icon: '✓'
        },
        overtime: {
          color: '#DC2626',
          bg: '#FEE2E2',
          icon: '⚠'
        }
      },
      TRIP_OVERTIME_HOURS: 1,
      TRIP_DASHBOARD_ROLES: ['馆领导', '部门负责人', 'admin']
    }
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
    // 返回默认值
    const defaults = this.getDefaultConstants()
    return defaults[key]
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
    // 先检查是否已有有效缓存
    const cached = this.getPermissionCache()
    if (cached) {
      console.log('权限缓存已存在，跳过加载')
      return Promise.resolve(cached)
    }

    return this.batchCheckPermissions(featureKeys).then(result => {
      const permissions = {}
      const perms = result.permissions || {}
      featureKeys.forEach(key => {
        permissions[key] = perms[key] ? perms[key].allowed : false
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