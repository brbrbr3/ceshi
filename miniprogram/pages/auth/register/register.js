const app = getApp()
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']

Page({
  data: {
    loading: false,
    mode: 'create',
    roleOptions: ROLE_OPTIONS,
    roleIndex: -1,
    reviewRemark: '',
    form: {
      name: '',
      gender: '男',
      birthday: '',
      role: '',
      isAdmin: false
    }
  },

  onLoad(options) {
    this.setData({
      mode: options && options.mode === 'reapply' ? 'reapply' : 'create'
    })
    this.prefillForm()
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

        const roleIndex = result.request.role ? ROLE_OPTIONS.indexOf(result.request.role) : -1
        this.setData({
          roleIndex,
          reviewRemark: result.request.status === 'rejected'
            ? (result.request.reviewRemark || '管理员已退回该申请，请修改后重新提交。')
            : '',
          mode: result.request.status === 'rejected' ? 'reapply' : this.data.mode,
          form: {
            name: result.request.name || '',
            gender: result.request.gender || '男',
            birthday: result.request.birthday || '',
            role: result.request.role || '',
            isAdmin: !!result.request.isAdmin
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

  selectGender(e) {
    this.setData({
      'form.gender': e.currentTarget.dataset.value
    })
  },

  handleBirthdayChange(e) {
    this.setData({
      'form.birthday': e.detail.value
    })
  },

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    this.setData({
      roleIndex,
      'form.role': ROLE_OPTIONS[roleIndex]
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
      wx.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!form.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' })
      return
    }
    if (!form.birthday) {
      wx.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }
    if (!form.role) {
      wx.showToast({ title: '请选择角色', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    app.submitRegistration(form)
      .then(() => {
        wx.showModal({
          title: '提交成功',
          content: '注册申请已提交，请等待管理员审批。审批通过后即可使用首页与业务功能。',
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
})
