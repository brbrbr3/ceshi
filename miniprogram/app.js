const config = require('./config')
const themeListeners = []
const AUTH_STORAGE_KEY = 'office-auth-cache'
const SUBSCRIBE_REQUEST_KEY = 'office-subscribe-requested'

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
    console.error('读取本地缓存失败', error)
    return null
  }
}

function writeStorage(key, value) {
  try {
    wx.setStorageSync(key, value)
  } catch (error) {
    console.error('写入本地缓存失败', error)
  }
}

function removeStorage(key) {
  try {
    wx.removeStorageSync(key)
  } catch (error) {
    console.error('清理本地缓存失败', error)
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
    console.error('保存订阅请求状态失败', error)
  }
}

App({
  onLaunch(opts, data) {
    console.log('App Launch', opts)
    if (data && data.path) {
      wx.navigateTo({
        url: data.path,
      })
    }
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: config.envId,
        traceUser: true,
      })
    }
    this.restoreAuthState()
  },

  onShow(opts) {
    console.log('App Show', opts)
  },

  onHide() {
    console.log('App Hide')
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
    theme: wx.getSystemInfoSync().theme,
    iconTabbar: '/page/weui/example/images/icon_tabbar.png',
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

  checkUserRegistration() {
    return this.callOfficeAuth('checkRegistration').then((data) => {
      this.setAuthState({
        hasLogin: !!data.registered,
        openid: data.openid || this.globalData.openid,
        userProfile: data.user || null,
        registrationRequest: data.request || null,
        authStatus: data.authStatus || 'anonymous'
      })
      return data
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
    }).catch((error) => {
      console.error('订阅消息失败', error)
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
      console.error('保存订阅记录失败', error)
    })
  },

  addApprovalNotification(type, content) {
    const openid = this.globalData.openid
    if (!openid) {
      console.warn('无法添加通知：未获取到 openid')
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
      console.error('添加通知失败', error)
    })
  },

  getNotifications(callback) {
    const openid = this.globalData.openid
    if (!openid) {
      callback([])
      return
    }

    const db = wx.cloud.database()
    db.collection('notifications')
      .where({
        openid: openid
      })
      .orderBy('createdAt', 'desc')
      .get()
      .then(res => {
        callback(res.data || [])
      })
      .catch(error => {
        console.error('获取通知列表失败', error)
        callback([])
      })
  },

  markNotificationAsRead(id, callback) {
    const openid = this.globalData.openid
    if (!openid) {
      if (callback) callback(false)
      return
    }

    const db = wx.cloud.database()
    db.collection('notifications')
      .doc(id)
      .update({
        data: {
          read: true
        }
      })
      .then(() => {
        if (callback) callback(true)
      })
      .catch(error => {
        console.error('标记通知已读失败', error)
        if (callback) callback(false)
      })
  },

  clearAllNotifications(callback) {
    const openid = this.globalData.openid
    if (!openid) {
      if (callback) callback(false)
      return
    }

    const db = wx.cloud.database()
    db.collection('notifications')
      .where({
        openid: openid
      })
      .remove()
      .then(() => {
        if (callback) callback(true)
      })
      .catch(error => {
        console.error('清空通知失败', error)
        if (callback) callback(false)
      })
  }
})
