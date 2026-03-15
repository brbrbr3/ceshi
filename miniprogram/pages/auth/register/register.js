const app = getApp()
const util = require('../../../util/util.js')
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
const POSITION_OPTIONS = ['无', '会计主管', '会计', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘' ]

// 独立函数，用于获取今天的日期（使用巴西利亚时间 GMT-3）
function getTodayDate() {
  const now = new Date()
  // 转换为巴西利亚时间 (GMT-3)
  const braziliaOffset = -3
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  const braziliaTime = new Date(utc + (3600000 * braziliaOffset))
  const year = braziliaTime.getFullYear()
  const month = String(braziliaTime.getMonth() + 1).padStart(2, '0')
  const day = String(braziliaTime.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

Page({
  data: {
    loading: false,
    mode: 'create',
    roleOptions: ROLE_OPTIONS,
    positionOptions: POSITION_OPTIONS,
    roleIndex: -1,
    positionIndex: 0,
    showRelativeField: false,
    reviewRemark: '',
    today: getTodayDate(),
    form: {
      name: '',
      gender: '男',
      birthday: '',
      role: '',
      isAdmin: false,
      relativeName: '',
      position: '无'
    }
  },

  onLoad(options) {
    // 设置今天的日期作为最大可选日期
    const today = getTodayDate()
    this.setData({
      today: today,
      mode: options && options.mode === 'reapply' ? 'reapply' : 'create'
    })
    this.prefillForm()
  },

  onShow() {
    // 每次显示时更新今天的日期
    this.setData({ today: getTodayDate() })
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
        const role = result.request.role || ''
        const showRelativeField = role === '配偶' || role === '家属'
        const positionIndex = result.request.position ? POSITION_OPTIONS.indexOf(result.request.position) : 0
        this.setData({
          roleIndex,
          positionIndex,
          showRelativeField,
          reviewRemark: result.request.status === 'rejected'
            ? (result.request.reviewRemark || '管理员已退回该申请，请修改后重新提交。')
            : '',
          mode: result.request.status === 'rejected' ? 'reapply' : this.data.mode,
          form: {
            name: result.request.name || '',
            gender: result.request.gender || '男',
            birthday: result.request.birthday || '',
            role: role,
            isAdmin: !!result.request.isAdmin,
            relativeName: result.request.relativeName || '',
            position: result.request.position || '无'
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
    const selectedDate = e.detail.value
    const today = getTodayDate()

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

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const role = ROLE_OPTIONS[roleIndex]
    const showRelativeField = role === '配偶' || role === '家属'
    this.setData({
      roleIndex,
      'form.role': role,
      showRelativeField,
      'form.relativeName': showRelativeField ? this.data.form.relativeName : ''
    })
  },

  handleRelativeNameInput(e) {
    this.setData({
      'form.relativeName': e.detail.value
    })
  },

  handlePositionChange(e) {
    const positionIndex = Number(e.detail.value)
    this.setData({
      positionIndex,
      'form.position': POSITION_OPTIONS[positionIndex]
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
      util.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!form.gender) {
      util.showToast({ title: '请选择性别', icon: 'none' })
      return
    }
    if (!form.birthday) {
      util.showToast({ title: '请选择出生日期', icon: 'none' })
      return
    }
    if (!form.role) {
      util.showToast({ title: '请选择角色', icon: 'none' })
      return
    }
    if ((form.role === '配偶' || form.role === '家属') && !String(form.relativeName || '').trim()) {
      util.showToast({ title: '请填写亲属姓名', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    // 请求订阅消息权限（模板ID需要在微信后台配置）
    // 如果模板ID还未配置，可以跳过此步骤，或者使用临时的模板ID测试
    const templateIds = [
      // '你的模板ID_1',  // 任务完成通知
      // '你的模板ID_2'   // 流程退回通知
    ]

    // 如果配置了模板ID，请求订阅权限
    if (templateIds.length > 0 && templateIds[0]) {
      wx.requestSubscribeMessage({
        tmplIds: templateIds,
        success: () => {
          // 继续提交注册
          this.doSubmit(form)
        },
        fail: () => {
          // 即使授权失败也允许提交
          this.doSubmit(form)
        }
      })
    } else {
      // 未配置模板ID，直接提交
      this.doSubmit(form)
    }
  },

  doSubmit(form) {
    app.submitRegistration(form)
      .then(() => {
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
})
