const app = getApp()
const utils = require('../../../common/utils.js')
const constants = require('../../../common/constants.js')

Page({
  data: {
    loading: false,
    submitting: false, // 防止重复提交
    roleOptions: [],           // 从数据库加载
    relationOptions: [],       // 从数据库加载
    medicalInstitutions: [],   // 从数据库加载
    relationIndex: -1,
    institutionIndex: -1,
    form: {
      patientName: '',
      relation: '',
      medicalDate: '',
      institution: '',
      otherInstitution: '',
      reasonForSelection: '',
      reason: ''
    },
    currentUser: null,
    mode: 'create' // create 或 copy
  },

  async onLoad(options) {
    // 先加载常量配置
    await this.loadConstants()

    // 获取当前用户信息
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          wx.reLaunch({
            url: '/pages/auth/login/login'
          })
          return
        }

        const user = result.user

        // 使用统一的权限检查
        return app.checkPermission('medical_application')
          .then((hasPermission) => {
            if (!hasPermission) {
              // 获取详细的权限信息
              return app.getPermissionInfo('medical_application')
                .then((permInfo) => {
                  const message = permInfo.feature ? permInfo.feature.message : '您没有权限使用此功能'
                  wx.showModal({
                    title: '权限提示',
                    content: message,
                    showCancel: false,
                    confirmText: '我知道了'
                  })
                  setTimeout(() => {
                    wx.navigateBack()
                  }, 2000)
                })
            }

            // 有权限，设置用户信息
            this.setData({
              currentUser: user,
              mode: options.mode === 'copy' ? 'copy' : 'create'
            })

            // 如果是复制模式，从 options 中加载数据
            if (options.mode === 'copy') {
              this.loadCopyData(options)
            }
          })
      })
      .catch((error) => {
        console.error('权限检查失败:', error)
        wx.showToast({
          title: error.message || '获取用户信息失败',
          icon: 'none'
        })
      })
  },

  /**
   * 加载常量配置
   */
  async loadConstants() {
    try {
      const [roleOptions, relationOptions, medicalInstitutions] = await Promise.all([
        constants.getConstant('ROLE_OPTIONS'),
        constants.getConstant('RELATION_OPTIONS'),
        constants.getConstant('MEDICAL_INSTITUTIONS')
      ])

      this.setData({
        roleOptions: roleOptions || [],
        relationOptions: relationOptions || [],
        medicalInstitutions: medicalInstitutions || []
      })
    } catch (error) {
      console.error('加载常量配置失败:', error)
      // 使用默认值
      const defaults = constants.getDefaultConstants()
      this.setData({
        roleOptions: defaults.ROLE_OPTIONS || [],
        relationOptions: defaults.RELATION_OPTIONS || [],
        medicalInstitutions: defaults.MEDICAL_INSTITUTIONS || []
      })
    }
  },

  loadCopyData(options) {
    // 从 URL 参数中解析复制的申请数据
    try {
      const copyData = JSON.parse(decodeURIComponent(options.data || '{}'))
      this.setData({
        form: {
          patientName: copyData.patientName || '',
          relation: copyData.relation || '',
          medicalDate: copyData.medicalDate || '',
          institution: copyData.institution || '',
          otherInstitution: copyData.otherInstitution || '',
          reasonForSelection: copyData.reasonForSelection || '',
          reason: copyData.reason || ''
        }
      })
    } catch (error) {
      console.error('加载复制数据失败:', error)
    }
  },

  handlePatientNameInput(e) {
    this.setData({
      'form.patientName': e.detail.value
    })
  },

  handleRelationChange(e) {
    const index = Number(e.detail.value)
    const relation = this.data.relationOptions[index]
    this.setData({
      relationIndex: index,
      'form.relation': relation
    })
  },

  handleMedicalDateChange(e) {
    this.setData({
      'form.medicalDate': e.detail.value
    })
  },

  handleInstitutionChange(e) {
    const index = Number(e.detail.value)
    const institution = this.data.medicalInstitutions[index]
    this.setData({
      institutionIndex: index,
      'form.institution': institution
    })
  },

  handleOtherInstitutionInput(e) {
    this.setData({
      'form.otherInstitution': e.detail.value
    })
  },

  handleReasonForSelectionInput(e) {
    this.setData({
      'form.reasonForSelection': e.detail.value
    })
  },

  handleReasonInput(e) {
    this.setData({
      'form.reason': e.detail.value
    })
  },

  validateForm() {
    const form = this.data.form

    if (!String(form.patientName || '').trim()) {
      utils.showToast({ title: '请填写就医人姓名', icon: 'none' })
      return false
    }

    if (!form.relation) {
      utils.showToast({ title: '请选择与申请人关系', icon: 'none' })
      return false
    }

    if (!form.medicalDate) {
      utils.showToast({ title: '请选择就医时间', icon: 'none' })
      return false
    }

    if (!form.institution) {
      utils.showToast({ title: '请选择就医机构', icon: 'none' })
      return false
    }

    // 如果选择了"其他"，必须填写机构名称
    if (form.institution === '其他' && !String(form.otherInstitution || '').trim()) {
      utils.showToast({ title: '请填写就医机构名称', icon: 'none' })
      return false
    }

    // 如果选择了"其他"，必须填写选择原因
    if (form.institution === '其他' && !String(form.reasonForSelection || '').trim()) {
      utils.showToast({ title: '请填写选择此机构的原因', icon: 'none' })
      return false
    }

    if (!String(form.reason || '').trim()) {
      utils.showToast({ title: '请填写就医原因', icon: 'none' })
      return false
    }

    return true
  },

  submitApplication() {
    // 防止重复提交 - 使用本地变量立即阻止
    if (this._isSubmitting || this.data.loading) {
      return
    }

    // 立即设置本地标记，防止重复点击
    this._isSubmitting = true

    if (!this.validateForm()) {
      this._isSubmitting = false
      return
    }

    // 立即设置提交状态
    this.setData({
      loading: true
    })

    const form = this.data.form
    const businessData = {
      patientName: form.patientName.trim(),
      relation: form.relation,
      medicalDate: form.medicalDate,
      institution: form.institution,
      otherInstitution: form.institution === '其他' ? form.otherInstitution.trim() : '',
      reasonForSelection: form.institution === '其他' ? form.reasonForSelection.trim() : '',
      reason: form.reason.trim()
    }

    // 调用云函数提交就医申请
    wx.cloud.callFunction({
      name: 'medicalApplication',
      data: {
        action: 'submit',
        businessData: businessData
      }
    }).then((res) => {
      if (res.result.code === 0) {
        wx.showModal({
          title: '提交成功',
          content: '就医申请已提交，请等待审批。',
          showCancel: false,
          success: () => {
            wx.switchTab({
              url: '/pages/office/approval/approval'
            })
          }
        })
      } else {
        wx.showToast({
          title: res.result.message || '提交失败',
          icon: 'none'
        })
      }
    }).catch((error) => {
      console.error('提交就医申请失败:', error)
      wx.showToast({
        title: error.message || '提交失败，请稍后重试',
        icon: 'none'
      })
    }).finally(() => {
      // 清理状态
      this.setData({
        loading: false
      })
      // 延迟清理本地标记，防止快速重复点击
      setTimeout(() => {
        this._isSubmitting = false
      }, 1000)
    })
  }
})
