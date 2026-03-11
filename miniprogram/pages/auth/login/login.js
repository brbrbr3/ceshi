const app = getApp()

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
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
    desc: '您已通过管理员审批，点击下方按钮进入首页。',
    tag: '已通过',
    extra: '',
    time: ''
  }
}

Page({
  data: {
    loading: false,
    statusCard: null,
    showRegisterLink: true
  },

  onShow() {
    this.refreshStatus()
  },

  refreshStatus() {
    app.checkUserRegistration()
      .then((result) => {
        const statusCard = result.registered
          ? buildStatusCard({ status: 'approved' })
          : buildStatusCard(result.request)

        this.setData({
          statusCard,
          showRegisterLink: !result.request || result.request.status === 'rejected'
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

    wx.login({
      success: () => {
        app.checkUserRegistration()
          .then((result) => {
            if (result.registered) {
              wx.showToast({
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

            if (result.request && result.request.status === 'pending') {
              this.setData({
                statusCard: buildStatusCard(result.request),
                showRegisterLink: false
              })
              wx.showToast({
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
            wx.showToast({
              title: error.message || '登录失败',
              icon: 'none'
            })
          })
          .then(() => {
            this.setData({ loading: false })
            this.refreshStatus()
          })
      },
      fail: (error) => {
        console.error('微信登录失败', error)
        this.setData({ loading: false })
        wx.showToast({
          title: '微信登录失败',
          icon: 'none'
        })
      }
    })
  },

  goRegister() {
    wx.navigateTo({
      url: '/pages/auth/register/register'
    })
  }
})
