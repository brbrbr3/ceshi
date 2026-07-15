const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    loading: false,
    mode: 'create',
    reviewRemark: '',
    today: '',
    isDevEnv: false,
    form: {
      name: '',
      gender: '男',
      birthday: '',
      isAdmin: false,
      // mobile: '+55 61 ',
      // landline: '+55 61 ',
      avatarUrl: '',
      nickName: ''
    }
  },

  async onLoad(options) {
    // 设置今天的日期作为最大可选日期
    const today = await utils.getTodayDate()
    this.setData({
      today: today,
      mode: options && options.mode === 'reapply' ? 'reapply' : 'create',
      isDevEnv: app.globalData.isDevEnv
    })
    this.prefillForm()
  },

  async onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 每次显示时更新今天的日期
    const today = await utils.getTodayDate()
    this.setData({
      today,
      isDevEnv: app.globalData.isDevEnv
    })
  },

  prefillForm() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered) {
          wx.switchTab({
            url: '/pages/office/home/home'
          })
          return
        }

        if (!result.request) {
          return
        }

        this.setData({
          reviewRemark: result.request.status === 'rejected'
            ? (result.request.reviewRemark || '管理员已退回该申请，请修改后重新提交。')
            : '',
          mode: result.request.status === 'rejected' ? 'reapply' : this.data.mode,
          form: {
            name: result.request.name || '',
            gender: result.request.gender || '男',
            birthday: result.request.birthday || '',
            isAdmin: !!result.request.isAdmin,
            // mobile: result.request.mobile || '+55 61 ',
            // landline: result.request.landline || '+55 61 ',
            avatarUrl: result.request.avatarUrl || '',
            nickName: result.request.nickName || ''
          }
        })
      })
      .catch((error) => {
        wx.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
      })
  },

  handleNameInput(e) {
    this.setData({
      'form.name': e.detail.value
    })
  },

  handleChooseAvatar(e) {
    const { avatarUrl } = e.detail
    this.setData({
      'form.avatarUrl': avatarUrl
    })
  },

  handleNickNameBlur(e) {
    // 选择微信昵称时 bindinput 可能不触发，bindblur 是可靠的值来源
    // bindblur 在 bindnicknamereview 之前触发，暂存值供 review 回调使用
    this._pendingNickValue = (e.detail.value || '').trim()
  },

  handleNickNameReview(e) {
    console.log('[nicknamereview] detail:', JSON.stringify(e.detail))
    if (e.detail && e.detail.pass) {
      // 审核通过，使用 blur/input 暂存的值
      if (this._pendingNickValue) {
        this.setData({ 'form.nickName': this._pendingNickValue })
      }
    } else {
      // 审核未通过，清空（微信会清空 input 内容，form.nickName 也需手动清）
      this.setData({ 'form.nickName': '' })
    }
    this._pendingNickValue = ''
  },

  handleNickNameInput(e) {
    // 手动输入时实时同步显示（选微信昵称时 bindinput 可能不触发，由 review 回调兜底）
    const val = (e.detail.value || '').trim()
    this._pendingNickValue = val
    this.setData({ 'form.nickName': val })
  },

  selectGender(e) {
    this.setData({
      'form.gender': e.currentTarget.dataset.value
    })
  },

  async handleBirthdayChange(e) {
    const selectedDate = e.detail.value
    const today = await utils.getTodayDate()

    // 验证选择的日期不能超过今天
    if (selectedDate > today) {
      wx.showToast({
        title: '出生日期不能超过今天',
        icon: 'none'
      })
      return
    }

    this.setData({
      'form.birthday': selectedDate
    })
  },

  handleBirthdayColumnChange() {
    // 暂时不需要处理列变化
  },

  handleMobileInput(e) {
    this.setData({
      'form.mobile': e.detail.value
    })
  },

  handleLandlineInput(e) {
    this.setData({
      'form.landline': e.detail.value
    })
  },

  selectAdmin(e) {
    this.setData({
      'form.isAdmin': e.currentTarget.dataset.value === 'true'
    })
  },

  submitRegistration() {
    if (this.data.loading) {
      return
    }

    const form = this.data.form

    if (!String(form.name || '').trim()) {
      utils.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!form.avatarUrl) {
      utils.showToast({ title: '请点击获取微信头像', icon: 'none' })
      return
    }
    if (!String(form.nickName || '').trim()) {
      utils.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!form.gender) {
      utils.showToast({ title: '请选择性别', icon: 'none' })
      return
    }
    if (!form.birthday) {
      utils.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    // 请求订阅消息（模板1：注册审批结果通知）
    // 无论授权与否都继续提交注册申请
    app.requestRegistrationResultSubscribe().finally(() => {
      this.doSubmit(form)
    })
  },

  doSubmit(form) {
    // 清理预填内容：若用户未修改 mobile/landline，不保存预填值
    const submitForm = { ...form }
    if ((submitForm.mobile || '').trim() === '+55 61') {
      submitForm.mobile = ''
    }
    if ((submitForm.landline || '').trim() === '+55 61') {
      submitForm.landline = ''
    }

    // 上传头像到云存储（chooseAvatar 返回的是临时本地路径）
    const doSubmitNow = (cloudAvatarUrl) => {
      if (cloudAvatarUrl) {
        submitForm.avatarUrl = cloudAvatarUrl
      }

      app.submitRegistration(submitForm)
        .then(() => {
          // 清除缓存，让 login 页面重新拉取最新状态
          app.clearAuthState()

          wx.showModal({
            title: '提交成功',
            content: '注册申请已提交，请等待管理员审批。审批通过后即可成为正式用户。',
            showCancel: false,
            success: () => {
              wx.reLaunch({
                url: '/pages/auth/login/login'
              })
            }
          })
        })
        .catch((error) => {
          wx.showToast({
            title: error.message || '提交失败',
            icon: 'none'
          })
        })
        .then(() => {
          this.setData({ loading: false })
        })
    }

    // 如果 avatarUrl 是云存储 fileID（如重新提交被驳回申请），直接使用
    if (submitForm.avatarUrl && submitForm.avatarUrl.startsWith('cloud://')) {
      doSubmitNow(submitForm.avatarUrl)
      return
    }

    // avatarUrl 是临时本地路径，需要上传到云存储
    if (submitForm.avatarUrl) {
      wx.showLoading({ title: '上传头像中...', mask: true })
      const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.png`
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: submitForm.avatarUrl
      }).then((uploadRes) => {
        wx.hideLoading()
        submitForm.avatarUrl = '' // 清空临时路径
        doSubmitNow(uploadRes.fileID)
      }).catch((err) => {
        wx.hideLoading()
        console.error('头像上传失败:', err)
        wx.showToast({ title: '头像上传失败，请重试', icon: 'none' })
        this.setData({ loading: false })
      })
      return
    }

    // 无头像，直接提交
    doSubmitNow('')
  }
})
