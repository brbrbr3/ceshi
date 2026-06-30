const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    loading: false,
    mode: 'create',
    constants: {}, // 从数据库加载的常量
    roleOptions: [],
    departmentOptions: [],
    allDepartmentOptions: [], // 保存完整的部门列表，用于切换角色时恢复
    roleIndex: -1,
    departmentIndex: -1,
    livingAreaOptions: [],
    livingAreaIndex: -1,
    showRelativeField: false,
    showDepartmentField: false,
    showDeptHeadCheckbox: false,
    reviewRemark: '',
    today: '',
    isDevEnv: false,
    form: {
      name: '',
      gender: '男',
      birthday: '',
      role: '',
      isAdmin: false,
      relativeName: '',
      department: '',
      isDepartmentHead: false,
      mobile: '+55 61 ',
      landline: '+55 61 ',
      livingArea: '',
      avatarUrl: '',
      nickName: ''
    }
  },

  async onLoad(options) {
    // 加载常量
    await this.loadConstants()

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

  // 加载常量
  async loadConstants() {
    try {
      const allConstants = await app.getAllConstants()

      // 过滤掉"部门负责人"角色（已改为 isDepartmentHead 字段）
      const filteredRoles = (allConstants.ROLE_OPTIONS || []).filter(r => r !== '部门负责人')

      this.setData({
        constants: allConstants,
        roleOptions: filteredRoles,
        departmentOptions: allConstants.DEPARTMENT_OPTIONS || [],
        allDepartmentOptions: allConstants.DEPARTMENT_OPTIONS || [],
        livingAreaOptions: allConstants.REPAIR_LIVING_AREAS || []
      })
    } catch (error) {
      console.error('加载常量失败:', error)
      this.setData({
        constants: {},
        roleOptions: [],
        departmentOptions: [],
        allDepartmentOptions: [],
        livingAreaOptions: []
      })
    }
  },

  /**
   * 获取角色的字段显示配置
   * @param {string} role - 角色名称
   * @returns {Object} 字段显示配置 { showPosition, showDepartment, fixedDepartment }
   */
  getRoleFieldConfig(role) {
    const { constants } = this.data
    const roleFieldVisibility = constants.ROLE_FIELD_VISIBILITY || {}

    // 优先使用数据库配置
    if (roleFieldVisibility[role]) {
      return roleFieldVisibility[role]
    }

    // 降级：使用默认配置
    const defaults = {
      showPosition: false,
      showDepartment: true,
      fixedDepartment: null
    }
    return defaults
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

        const { roleOptions, departmentOptions, constants } = this.data
        const roleIndex = result.request.role ? roleOptions.indexOf(result.request.role) : -1
        const role = result.request.role || ''

        // 居住区域回填
        const livingArea = result.request.livingArea || ''
        const livingAreaIndex = livingArea ? this.data.livingAreaOptions.indexOf(livingArea) : -1

        // 使用常量判断
        const needRelativeRoles = constants.NEED_RELATIVE_ROLES || []

        // 使用新的角色字段配置
        const roleConfig = this.getRoleFieldConfig(role)

        const showRelativeField = needRelativeRoles.includes(role)
        const showDepartmentField = roleConfig.showDepartment

        let department = result.request.department || ''
        let departmentIndex = -1
        let roleDepartmentOptions = departmentOptions
        let showDeptHeadCheckbox = false
        let isDepartmentHead = result.request.isDepartmentHead || false

        if (role === '馆领导') {
          // 馆领导：部门选项前加"无"
          roleDepartmentOptions = ['无', ...departmentOptions]
          if (!department) {
            department = '无'
            departmentIndex = 0
            isDepartmentHead = false
          } else {
            departmentIndex = roleDepartmentOptions.indexOf(department)
            if (departmentIndex < 0) departmentIndex = -1
          }
        } else if (roleConfig.fixedDepartment) {
          // 使用配置中的固定部门
          department = roleConfig.fixedDepartment
          departmentIndex = 0
          roleDepartmentOptions = [roleConfig.fixedDepartment]
        } else if (department) {
          departmentIndex = departmentOptions.indexOf(department)
          if (departmentIndex === -1) {
            departmentIndex = -1
            department = ''
          }
          // 馆员有部门时显示checkbox
          if (role === '馆员' && department) {
            showDeptHeadCheckbox = true
          }
        }

        this.setData({
          roleIndex,
          livingAreaIndex,
          showRelativeField,
          showDepartmentField,
          showDeptHeadCheckbox,
          departmentIndex,
          departmentOptions: roleDepartmentOptions,
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
            department: department,
            isDepartmentHead: isDepartmentHead,
            mobile: result.request.mobile || '+55 61 ',
            landline: result.request.landline || '+55 61 ',
            livingArea: livingArea,
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
    // bindinput 在选择微信昵称时可能不触发，但手动输入时同步暂存值
    this._pendingNickValue = (e.detail.value || '').trim()
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

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const { roleOptions, allDepartmentOptions, constants } = this.data
    const role = roleOptions[roleIndex]

    // 使用常量判断
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || []

    // 使用新的角色字段配置
    const roleConfig = this.getRoleFieldConfig(role)

    const showRelativeField = needRelativeRoles.includes(role)
    const showDepartmentField = roleConfig.showDepartment

    let department = ''
    let departmentIndex = -1
    let roleDepartmentOptions
    let showDeptHeadCheckbox = false
    let isDepartmentHead = false

    if (role === '馆领导') {
      // 馆领导：部门选项前加"无"
      roleDepartmentOptions = ['无', ...allDepartmentOptions]
    } else if (roleConfig.fixedDepartment) {
      // 使用配置中的固定部门
      department = roleConfig.fixedDepartment
      departmentIndex = 0
      roleDepartmentOptions = [roleConfig.fixedDepartment]
    } else {
      // 其他角色（馆员等）：完整部门列表
      roleDepartmentOptions = allDepartmentOptions
    }

    this.setData({
      roleIndex,
      'form.role': role,
      showRelativeField,
      showDepartmentField,
      showDeptHeadCheckbox,
      'form.relativeName': showRelativeField ? this.data.form.relativeName : '',
      'form.department': department,
      'form.isDepartmentHead': isDepartmentHead,
      departmentIndex,
      departmentOptions: roleDepartmentOptions
    })
  },

  handleRelativeNameInput(e) {
    this.setData({
      'form.relativeName': e.detail.value
    })
  },

  handleDepartmentChange(e) {
    const departmentIndex = Number(e.detail.value)
    const selectedDept = this.data.departmentOptions[departmentIndex]
    const role = this.data.form.role

    let showDeptHeadCheckbox = false
    let isDepartmentHead = false

    if (role === '馆领导') {
      if (selectedDept === '无') {
        // 馆领导选"无"：清空部门，不是部门负责人
        isDepartmentHead = false
      } else {
        // 馆领导选具体部门：自动成为部门负责人
        isDepartmentHead = true
      }
    } else if (role === '馆员' && selectedDept) {
      // 馆员选具体部门：显示checkbox（保持上次打勾状态）
      showDeptHeadCheckbox = true
      isDepartmentHead = this.data.form.isDepartmentHead || false
    }

    this.setData({
      departmentIndex,
      'form.department': selectedDept === '无' ? '' : selectedDept,
      'form.isDepartmentHead': isDepartmentHead,
      showDeptHeadCheckbox
    })
  },

  handleDeptHeadChange(e) {
    this.setData({
      'form.isDepartmentHead': e.detail.value.includes('true')
    })
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

  handleLivingAreaChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      livingAreaIndex: index,
      'form.livingArea': this.data.livingAreaOptions[index] || ''
    })
  },

  submitRegistration() {
    if (this.data.loading) {
      return
    }

    const form = this.data.form
    const { constants } = this.data
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || []
    const roleConfig = this.getRoleFieldConfig(form.role)
    
    if (!String(form.name || '').trim()) {
      utils.showToast({ title: '请输入姓名', icon: 'none' })
      return
    }
    if (!form.avatarUrl) {
      utils.showToast({ title: '请点击获取微信头像', icon: 'none' })
      return
    }
    if (!String(form.nickName || '').trim()) {
      utils.showToast({ title: '请点击获取微信昵称', icon: 'none' })
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
    if (!form.role) {
      utils.showToast({ title: '请选择角色', icon: 'none' })
      return
    }
    if (needRelativeRoles.includes(form.role) && !String(form.relativeName || '').trim()) {
      utils.showToast({ title: '请填写亲属姓名', icon: 'none' })
      return
    }
    if (roleConfig.showDepartment && !form.department && form.role !== '馆领导') {
      utils.showToast({ title: '请选择部门', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    // 请求订阅消息权限（模板ID需要在微信后台配置）
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
