const app = getApp()
const utils = require('../../../../common/utils.js')

Page({
  data: {
    loading: false,
    constants: {}, // 从数据库加载的常量
    roleOptions: [],
    positionOptions: [],
    departmentOptions: [],
    allDepartmentOptions: [], // 保存完整的部门列表，用于切换角色时恢复
    roleIndex: -1,
    positionIndex: -1,
    departmentIndex: -1,
    showRelativeField: false,
    showDepartmentField: false,
    showPositionField: false,
    reviewRemark: '',
    today: '',
    form: {
      name: '',
      gender: '男',
      birthday: '',
      role: '',
      isAdmin: false,
      relativeName: '',
      position: '',
      department: ''
    }
  },

  async onLoad(options) {
    // 显示加载中
    wx.showLoading({
      title: '加载中',
      mask: true
    })

    try {
      // 加载常量
      await this.loadConstants()

      // 设置今天的日期作为最大可选日期
      const today = await utils.getTodayDate()
      this.setData({ today })

      // 加载用户信息
      await this.loadUserProfile()
    } finally {
      // 隐藏加载中
      wx.hideLoading()
    }
  },

  async onShow() {
    // 每次显示时更新今天的日期
    const today = await utils.getTodayDate()
    this.setData({ today })
  },

  // 加载常量
  async loadConstants() {
    try {
      const allConstants = await app.getAllConstants()

      this.setData({
        constants: allConstants,
        roleOptions: allConstants.ROLE_OPTIONS || [],
        positionOptions: allConstants.POSITION_OPTIONS || [],
        departmentOptions: allConstants.DEPARTMENT_OPTIONS || [],
        allDepartmentOptions: allConstants.DEPARTMENT_OPTIONS || [] // 保存完整列表
      })
    } catch (error) {
      console.error('加载常量失败:', error)
      utils.showToast({
        title: '加载配置失败',
        icon: 'none'
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
      showPosition: true,
      showDepartment: true,
      fixedDepartment: null
    }
    return defaults
  },

  loadUserProfile() {
    return app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          utils.showToast({
            title: '请先完成注册',
            icon: 'none'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
          return
        }

        const user = result.user
        const { roleOptions, positionOptions, departmentOptions, constants } = this.data
        const roleIndex = user.role ? roleOptions.indexOf(user.role) : -1
        const role = user.role || ''

        // 使用常量判断
        const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
        const rolePositionMap = constants.ROLE_POSITION_MAP || {}

        // 使用新的角色字段配置
        const roleConfig = this.getRoleFieldConfig(role)

        const showRelativeField = needRelativeRoles.includes(role)
        const showDepartmentField = roleConfig.showDepartment
        const showPositionField = roleConfig.showPosition

        // 根据角色设置岗位选项和显示状态
        let rolePositionOptions = positionOptions
        let positionIndex = -1

        if (rolePositionMap[role]) {
          rolePositionOptions = rolePositionMap[role]
          positionIndex = user.position ? rolePositionOptions.indexOf(user.position) : -1
        } else {
          positionIndex = user.position ? positionOptions.indexOf(user.position) : -1
        }

        let department = user.department || ''
        let departmentIndex = -1
        let roleDepartmentOptions = departmentOptions

        // 使用配置中的固定部门
        if (roleConfig.fixedDepartment) {
          department = roleConfig.fixedDepartment
          departmentIndex = departmentOptions.indexOf(roleConfig.fixedDepartment)
          roleDepartmentOptions = [roleConfig.fixedDepartment]
        } else if (department) {
          departmentIndex = departmentOptions.indexOf(department)
          if (departmentIndex === -1) {
            departmentIndex = -1
            department = ''
          }
        }

        this.setData({
          roleIndex,
          positionIndex,
          showPositionField,
          positionOptions: rolePositionOptions,
          showRelativeField,
          showDepartmentField,
          departmentIndex,
          departmentOptions: roleDepartmentOptions,
          form: {
            name: user.name || '',
            gender: user.gender || '男',
            birthday: user.birthday || '',
            role: role,
            isAdmin: !!user.isAdmin,
            relativeName: user.relativeName || '',
            position: user.position || '',
            department: department
          }
        })
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
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

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const { roleOptions, allDepartmentOptions, constants, positionOptions } = this.data
    const role = roleOptions[roleIndex]

    // 使用常量判断
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
    const rolePositionMap = constants.ROLE_POSITION_MAP || {}

    // 使用新的角色字段配置
    const roleConfig = this.getRoleFieldConfig(role)

    const showRelativeField = needRelativeRoles.includes(role)
    const showDepartmentField = roleConfig.showDepartment
    const showPositionField = roleConfig.showPosition

    let department = ''
    let departmentIndex = -1
    let roleDepartmentOptions = allDepartmentOptions // 使用完整部门列表

    // 根据角色设置岗位选项和显示状态
    let rolePositionOptions = rolePositionMap[role] || positionOptions
    let positionIndex = -1

    // 使用配置中的固定部门
    if (roleConfig.fixedDepartment) {
      department = roleConfig.fixedDepartment
      departmentIndex = allDepartmentOptions.indexOf(roleConfig.fixedDepartment)
      roleDepartmentOptions = [roleConfig.fixedDepartment]
    }

    // 根据角色设置岗位选项
    if (rolePositionMap[role]) {
      positionIndex = role === '工勤' ? -1 : -1 // 默认都不选择
    }

    this.setData({
      roleIndex,
      positionOptions: rolePositionOptions,
      positionIndex,
      'form.role': role,
      showRelativeField,
      showDepartmentField,
      showPositionField,
      'form.relativeName': showRelativeField ? this.data.form.relativeName : '',
      'form.position': positionIndex >= 0 ? rolePositionOptions[positionIndex] : '',
      'form.department': department,
      departmentIndex,
      departmentOptions: roleDepartmentOptions
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
      'form.position': this.data.positionOptions[positionIndex]
    })
  },

  handleDepartmentChange(e) {
    const departmentIndex = Number(e.detail.value)
    this.setData({
      departmentIndex,
      'form.department': this.data.departmentOptions[departmentIndex]
    })
  },

  selectAdmin(e) {
    this.setData({
      'form.isAdmin': e.currentTarget.dataset.value === 'true'
    })
  },

  submitUpdate() {
    if (this.data.loading) {
      return
    }

    const form = this.data.form
    const { constants, positionIndex } = this.data
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
    const roleConfig = this.getRoleFieldConfig(form.role)
    
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
    if (roleConfig.showDepartment && !form.department) {
      utils.showToast({ title: '请选择部门', icon: 'none' })
      return
    }
    if (form.role === '工勤' && positionIndex < 0) {
      utils.showToast({ title: '请选择岗位', icon: 'none' })
      return
    }
console.log('提交的表单数据:', JSON.stringify(this.data.form))
    this.setData({ loading: true })

    app.submitProfileUpdate(form)
      .then(() => {
        // 清除缓存，让返回后的页面重新拉取最新状态
        app.clearAuthState()

        wx.showModal({
          title: '提交成功',
          content: '修改申请已提交，请等待管理员审批。审批通过后信息将自动更新。',
          showCancel: false,
          success: () => {
            wx.navigateBack()
          }
        })
      })
      .catch((error) => {
        utils.showToast({
          title: error.message || '提交失败',
          icon: 'none'
        })
      })
      .then(() => {
        this.setData({ loading: false })
      })
  }
})
