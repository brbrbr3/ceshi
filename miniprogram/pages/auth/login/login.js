const app = getApp()
const utils = require('../../../common/utils.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  // 使用统一的时间处理函数
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
    avatarUrl: '',
    tempAvatarUrl: '',
    // 调试模式相关
    isAdmin: false,
    showPasswordModal: false,
    debugPassword: '',
    showDebugPanel: false,
    debugResults: []
  },

  onShow() {
    this.refreshStatus()
    this.loadUserAvatar()
  },

  // 处理头像选择
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      tempAvatarUrl: avatarUrl,
      avatarUrl: avatarUrl
    })
  },

  // 加载用户头像
  loadUserAvatar() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered && result.user && result.user.avatarUrl) {
          this.setData({
            avatarUrl: result.user.avatarUrl
          })
        }
      })
      .catch(() => {
        // 忽略错误
      })
  },

  // 上传头像到云存储
  uploadAvatar(avatarPath) {
    return new Promise((resolve, reject) => {
      const openid = app.globalData.openid
      if (!openid) {
        reject(new Error('未获取到用户身份'))
        return
      }

      // 生成唯一文件名
      const fileName = `avatars/${openid}_${Date.now()}.jpg`

      wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: avatarPath,
        success: (res) => {
          resolve(res.fileID)
        },
        fail: (error) => {
          reject(error)
        }
      })
    })
  },

  refreshStatus() {
    app.checkUserRegistration()
      .then((result) => {
        const statusCard = result.registered
          ? buildStatusCard({ status: 'approved' })
          : buildStatusCard(result.request)

        // 已注册用户不显示注册链接
        // 未注册用户：没有申请或申请被驳回时显示注册链接，申请审核中不显示
        // 检查是否为管理员
        const isAdmin = result.registered && result.user && result.user.isAdmin === true

        this.setData({
          statusCard,
          showRegisterLink: !result.registered && (!result.request || result.request.status === 'rejected'),
          isAdmin
        })
      })
      .catch((error) => {
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

  handleWxLogin() {
    if (this.data.loading) {
      return
    }


    this.setData({ loading: true })

    // 直接检查用户注册状态，不再需要 wx.login
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered === true) {
          // 已注册用户，跳转主页
          utils.showToast({
            title: '登录成功',
            icon: 'success'
          })
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/office/home/home'
            })
          }, 200)
          return
        }

        // 检查是否有待审核的申请
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

        // 未注册或申请被退回，跳转注册页面
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

  // ========== 调试模式相关方法 ==========

  showDebugPassword() {
    this.setData({
      showPasswordModal: true,
      debugPassword: ''
    })
  },

  hideDebugPassword() {
    this.setData({
      showPasswordModal: false,
      debugPassword: ''
    })
  },

  onDebugPasswordInput(e) {
    this.setData({
      debugPassword: e.detail.value
    })
  },

  verifyDebugPassword() {
    if (this.data.debugPassword === '0802') {
      this.setData({
        showPasswordModal: false,
        debugPassword: '',
        showDebugPanel: true,
        debugResults: []
      })
    } else {
      utils.showToast({
        title: '密码错误',
        icon: 'none'
      })
    }
  },

  hideDebugPanel() {
    this.setData({
      showDebugPanel: false,
      debugResults: []
    })
  },

  // 添加调试结果
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

  // 调用初始化数据库
  callInitDatabase() {
    wx.showLoading({ title: '执行中...', mask: true })
    wx.cloud.callFunction({
      name: 'initDatabase',
      data: {}
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      this.addDebugResult(
        '初始化数据库',
        result.code === 0,
        result.message || (result.code === 0 ? '执行成功' : '执行失败'),
        result.data
      )
    }).catch(error => {
      wx.hideLoading()
      this.addDebugResult('初始化数据库', false, error.message || '执行失败')
    })
  },

  // 调用初始化系统配置
  callInitSystemConfig() {
    wx.showLoading({ title: '执行中...', mask: true })
    wx.cloud.callFunction({
      name: 'initSystemConfig',
      data: {}
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      this.addDebugResult(
        '初始化系统配置',
        result.code === 0,
        result.message || (result.code === 0 ? '执行成功' : '执行失败'),
        result.data
      )
    }).catch(error => {
      wx.hideLoading()
      this.addDebugResult('初始化系统配置', false, error.message || '执行失败')
    })
  },

  // 调用初始化工作流
  callInitWorkflowDB() {
    wx.showLoading({ title: '执行中...', mask: true })
    wx.cloud.callFunction({
      name: 'initWorkflowDB',
      data: {}
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      this.addDebugResult(
        '初始化工作流',
        result.code === 0,
        result.message || (result.code === 0 ? '执行成功' : '执行失败'),
        result.data
      )
    }).catch(error => {
      wx.hideLoading()
      this.addDebugResult('初始化工作流', false, error.message || '执行失败')
    })
  }
})
