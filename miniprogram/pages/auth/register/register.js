const app = getApp()
const constants = require('../../../common/constants.js')
const utils = require('../../../common/utils.js')

Page({
  data: {
    loading: false,
    mode: 'create',
    constants: {}, // 从数据库加载的常量
    roleOptions: [],
    positionOptions: [],
    departmentOptions: [],
    roleIndex: -1,
    positionIndex: 0,
    departmentIndex: 0,
    showRelativeField: false,
    showDepartmentField: false,
    showPositionField: true,
    reviewRemark: '',
    today: '',
    form: {
      name: '',
      gender: '男',
      birthday: '',
      role: '',
      isAdmin: false,
      relativeName: '',
      position: '无',
      department: ''
    }
  },

  async onLoad(options) {
    // 加载常量
    await this.loadConstants()

    // 设置今天的日期作为最大可选日期
    const today = await utils.getTodayDate()
    this.setData({
      today: today,
      mode: options && options.mode === 'reapply' ? 'reapply' : 'create'
    })
    this.prefillForm()
  },

  async onShow() {
    // 每次显示时更新今天的日期
    const today = await utils.getTodayDate()
    this.setData({ today })
  },

  // 加载常量
  async loadConstants() {
    try {
      const allConstants = await constants.getAllConstants()

      this.setData({
        constants: allConstants,
        roleOptions: allConstants.ROLE_OPTIONS || [],
        positionOptions: allConstants.POSITION_OPTIONS || [],
        departmentOptions: allConstants.DEPARTMENT_OPTIONS || []
      })
    } catch (error) {
      console.error('加载常量失败:', error)
      wx.showToast({
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

        const { roleOptions, positionOptions, departmentOptions, constants } = this.data
        const roleIndex = result.request.role ? roleOptions.indexOf(result.request.role) : -1
        const role = result.request.role || ''

        // 使用常量判断
        const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
        const needDepartmentRoles = constants.NEED_DEPARTMENT_ROLES || ['部门负责人', '馆员', '工勤']
        const rolePositionMap = constants.ROLE_POSITION_MAP || {}

        // 使用新的角色字段配置
        const roleConfig = this.getRoleFieldConfig(role)

        const showRelativeField = needRelativeRoles.includes(role)
        const showDepartmentField = needDepartmentRoles.includes(role)
        const showPositionField = roleConfig.showPosition

        // 根据角色设置岗位选项和显示状态
        let rolePositionOptions = positionOptions
        let positionIndex = 0

        if (rolePositionMap[role]) {
          rolePositionOptions = rolePositionMap[role]
          positionIndex = result.request.position ? rolePositionOptions.indexOf(result.request.position) : -1
        } else {
          positionIndex = result.request.position ? positionOptions.indexOf(result.request.position) : 0
        }

        let department = result.request.department || ''
        let departmentIndex = 0
        let roleDepartmentOptions = departmentOptions

        // 使用配置中的固定部门
        if (roleConfig.fixedDepartment) {
          department = roleConfig.fixedDepartment
          departmentIndex = departmentOptions.indexOf(roleConfig.fixedDepartment)
          roleDepartmentOptions = [roleConfig.fixedDepartment]
        } else if (department) {
          departmentIndex = departmentOptions.indexOf(department)
          if (departmentIndex === -1) {
            departmentIndex = 0
            department = ''
          }
        }

        this.setData({
          roleIndex,
          positionOptions: rolePositionOptions,
          positionIndex,
          showRelativeField,
          showDepartmentField,
          showPositionField,
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
            position: result.request.position || '无',
            department: department
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
    const { roleOptions, departmentOptions, constants, positionOptions } = this.data
    const role = roleOptions[roleIndex]

    // 使用常量判断
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
    const needDepartmentRoles = constants.NEED_DEPARTMENT_ROLES || ['部门负责人', '馆员', '工勤']
    const rolePositionMap = constants.ROLE_POSITION_MAP || {}

    // 使用新的角色字段配置
    const roleConfig = this.getRoleFieldConfig(role)

    const showRelativeField = needRelativeRoles.includes(role)
    const showDepartmentField = needDepartmentRoles.includes(role)
    const showPositionField = roleConfig.showPosition

    let department = ''
    let departmentIndex = 0
    let roleDepartmentOptions = departmentOptions

    // 根据角色设置岗位选项和显示状态
    let rolePositionOptions = rolePositionMap[role] || positionOptions
    let positionIndex = 0

    // 使用配置中的固定部门
    if (roleConfig.fixedDepartment) {
      department = roleConfig.fixedDepartment
      departmentIndex = departmentOptions.indexOf(roleConfig.fixedDepartment)
      roleDepartmentOptions = [roleConfig.fixedDepartment]
    }

    // 根据角色设置岗位选项
    if (rolePositionMap[role]) {
      positionIndex = role === '工勤' ? -1 : 0 // 工勤默认不选择
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

  submitRegistration() {
    if (this.data.loading) {
      return
    }

    const form = this.data.form
    const { constants, positionIndex } = this.data
    const needRelativeRoles = constants.NEED_RELATIVE_ROLES || ['配偶', '家属']
    const needDepartmentRoles = constants.NEED_DEPARTMENT_ROLES || ['部门负责人', '馆员', '工勤']
    
    if (!String(form.name || '').trim()) {
      utils.showToast({ title: '请输入姓名', icon: 'none' })
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
    if (needDepartmentRoles.includes(form.role) && !form.department) {
      utils.showToast({ title: '请选择部门', icon: 'none' })
      return
    }
    if (form.role === '工勤' && positionIndex < 0) {
      utils.showToast({ title: '请选择岗位', icon: 'none' })
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
