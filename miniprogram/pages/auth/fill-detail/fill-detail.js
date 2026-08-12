const app = getApp()

Page({
  data: {
    loading: false,
    constants: {},
    roleOptions: [],
    departmentOptions: [],
    allDepartmentOptions: [],
    roleIndex: -1,
    departmentIndex: -1,
    livingAreaOptions: [],
    livingAreaIndex: -1,
    showRelativeField: false,
    showDepartmentField: false,
    showDeptHeadCheckbox: false,
    showLivingArea: true,
    fontStyle: '',
    form: {
      role: '',
      department: '',
      isDepartmentHead: false,
      relativeName: '',
      livingArea: ''
    }
  },

  async onLoad() {
    await this.loadConstants()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }

    // 页面守卫：未注册→login；已填写详细信息→home/arrival-guide
    app.checkUserRegistration().then((result) => {
      if (!result.registered) {
        wx.reLaunch({ url: '/pages/auth/login/login' })
        return
      }
      if (result.user && result.user.role) {
        // 已填写详细信息，直接跳走
        if (result.user.role === '待赴任馆员') {
          wx.reLaunch({ url: '/pages/office/arrival-guide/arrival-guide' })
        } else {
          wx.switchTab({ url: '/pages/office/home/home' })
        }
        return
      }
      // role 为空，留在本页填写
    }).catch(() => {
      // 静默失败，允许用户在页面上填写
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

    if (roleFieldVisibility[role]) {
      return roleFieldVisibility[role]
    }

    return {
      showPosition: false,
      showDepartment: role === '馆员',
      showLivingArea: true,
      fixedDepartment: null
    }
  },

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const { roleOptions, allDepartmentOptions } = this.data
    const role = roleOptions[roleIndex]

    const fieldConfig = this.getRoleFieldConfig(role)
    const showDepartmentField = fieldConfig.showDepartment === true
    const showLivingArea = fieldConfig.showLivingArea !== false

    this.setData({
      roleIndex,
      'form.role': role,
      showDepartmentField,
      showRelativeField: false,
      showDeptHeadCheckbox: false,
      showLivingArea,
      'form.department': '',
      'form.isDepartmentHead': false,
      'form.relativeName': '',
      departmentIndex: -1,
      departmentOptions: showDepartmentField ? allDepartmentOptions : []
    })
  },

  handleDepartmentChange(e) {
    const departmentIndex = Number(e.detail.value)
    const selectedDept = this.data.departmentOptions[departmentIndex]
    const role = this.data.form.role

    let showDeptHeadCheckbox = false
    let isDepartmentHead = false

    if (role === '馆员' && selectedDept && selectedDept !== '无') {
      // 馆员选具体部门：显示「是否部门负责人」checkbox
      showDeptHeadCheckbox = true
      isDepartmentHead = this.data.form.isDepartmentHead || false
    }

    this.setData({
      departmentIndex,
      'form.department': selectedDept,
      'form.isDepartmentHead': isDepartmentHead,
      showDeptHeadCheckbox
    })
  },

  handleDeptHeadChange(e) {
    this.setData({
      'form.isDepartmentHead': e.detail.value.includes('true')
    })
  },

  handleRelativeNameInput(e) {
    this.setData({
      'form.relativeName': e.detail.value
    })
  },

  handleLivingAreaChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      livingAreaIndex: index,
      'form.livingArea': this.data.livingAreaOptions[index] || ''
    })
  },

  submitDetail() {
    if (this.data.loading) {
      return
    }

    const form = this.data.form
    const { showLivingArea } = this.data

    if (!form.role) {
      wx.showToast({ title: '请选择角色', icon: 'none' })
      return
    }
    if (this.data.showDepartmentField && this.data.departmentIndex < 0) {
      wx.showToast({ title: '请选择部门', icon: 'none' })
      return
    }
    if (showLivingArea && !form.livingArea) {
      wx.showToast({ title: '请选择居住区域', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    app.submitDetailInfo({
      role: form.role,
      department: form.department,
      isDepartmentHead: form.isDepartmentHead,
      relativeName: String(form.relativeName || '').trim(),
      livingArea: form.livingArea
    }).then(() => {
      wx.showToast({ title: '提交成功', icon: 'success' })
      // 角色刚填写，权限缓存可能基于"无角色"判定为无权限，需清除以便首页重新加载
      app.clearPermissionCache()
      setTimeout(() => {
        if (form.role === '待赴任馆员') {
          wx.reLaunch({ url: '/pages/office/arrival-guide/arrival-guide' })
        } else {
          wx.switchTab({ url: '/pages/office/home/home' })
        }
      }, 200)
    }).catch((error) => {
      wx.showToast({
        title: error.message || '提交失败',
        icon: 'none'
      })
    }).then(() => {
      this.setData({ loading: false })
    })
  }
})
