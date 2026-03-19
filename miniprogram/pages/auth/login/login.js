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
    tempAvatarUrl: ''
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
        this.setData({
          statusCard,
          showRegisterLink: !result.registered && (!result.request || result.request.status === 'rejected')
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
  }
})
