const app = getApp()
const util = require('../../../util/util.js')

const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
const RELATION_OPTIONS = ['本人', '配偶', '子女', '父母', '其他']
const MEDICAL_INSTITUTIONS = [
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
]

Page({
  data: {
    loading: false,
    submitting: false, // 防止重复提交
    roleOptions: ROLE_OPTIONS,
    relationOptions: RELATION_OPTIONS,
    medicalInstitutions: MEDICAL_INSTITUTIONS,
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

  onLoad(options) {
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
        const role = user.role || ''

        // 检查权限：物业、配偶、家属无权限
        if (role === '物业' || role === '配偶' || role === '家属') {
          wx.showModal({
            title: '权限提示',
            content: '您当前的角色（' + role + '）无权提交就医申请。请联系管理员或具有相应权限的用户。',
            showCancel: false,
            confirmText: '我知道了'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 2000)
          return
        }

        this.setData({
          currentUser: user,
          mode: options.mode === 'copy' ? 'copy' : 'create'
        })

        // 如果是复制模式，从 options 中加载数据
        if (options.mode === 'copy') {
          this.loadCopyData(options)
        }
      })
      .catch((error) => {
        wx.showToast({
          title: error.message || '获取用户信息失败',
          icon: 'none'
        })
      })
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
    const relation = RELATION_OPTIONS[index]
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
    const institution = MEDICAL_INSTITUTIONS[index]
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
      util.showToast({ title: '请填写就医人姓名', icon: 'none' })
      return false
    }

    if (!form.relation) {
      util.showToast({ title: '请选择与申请人关系', icon: 'none' })
      return false
    }

    if (!form.medicalDate) {
      util.showToast({ title: '请选择就医时间', icon: 'none' })
      return false
    }

    if (!form.institution) {
      util.showToast({ title: '请选择就医机构', icon: 'none' })
      return false
    }

    // 如果选择了"其他"，必须填写机构名称
    if (form.institution === '其他' && !String(form.otherInstitution || '').trim()) {
      util.showToast({ title: '请填写就医机构名称', icon: 'none' })
      return false
    }

    // 如果选择了"其他"，必须填写选择原因
    if (form.institution === '其他' && !String(form.reasonForSelection || '').trim()) {
      util.showToast({ title: '请填写选择此机构的原因', icon: 'none' })
      return false
    }

    if (!String(form.reason || '').trim()) {
      util.showToast({ title: '请填写就医原因', icon: 'none' })
      return false
    }

    return true
  },

  submitApplication() {
    // 防止重复提交
    if (this.data.submitting || this.data.loading) {
      return
    }

    if (!this.validateForm()) {
      return
    }

    // 立即设置提交状态，防止重复点击
    this.setData({
      submitting: true,
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
      this.setData({
        loading: false,
        submitting: false
      })
    })
  }
})
