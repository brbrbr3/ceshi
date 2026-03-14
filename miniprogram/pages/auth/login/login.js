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
    console.log('=== 开始登录流程 ===')

    // 直接检查用户注册状态，不再需要 wx.login
    app.checkUserRegistration()
      .then((result) => {
        console.log('登录检查结果:', JSON.stringify(result))
        console.log('registered值:', result.registered, '类型:', typeof result.registered)

        if (result.registered === true) {
          // 已注册用户，跳转主页
          console.log('用户已注册，准备跳转首页')
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
          setTimeout(() => {
            console.log('执行 wx.switchTab 到 /pages/office/home/home')
            wx.switchTab({
              url: '/pages/office/home/home',
              success: () => console.log('跳转成功'),
              fail: (err) => console.error('跳转失败:', err)
            })
          }, 200)
          return
        }

        // 检查是否有待审核的申请
        if (result.request && result.request.status === 'pending') {
          console.log('申请审核中')
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

        // 未注册或申请被退回，跳转注册页面
        console.log('未注册或已退回，跳转注册页')
        wx.navigateTo({
          url: result.request && result.request.status === 'rejected'
            ? '/pages/auth/register/register?mode=reapply'
            : '/pages/auth/register/register'
        })
      })
      .catch((error) => {
        console.error('登录错误:', error)
        wx.showToast({
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
