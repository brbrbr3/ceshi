const app = getApp()
const util = require('../../../../util/util.js')
const ROLE_OPTIONS = ['馆领导', '部门负责人', '馆员', '工勤', '物业', '配偶', '家属']
const POSITION_OPTIONS = ['无', '会计主管', '会计', '俱乐部', '阳光课堂', '招待员', '厨师', '内聘']
const DEPARTMENT_OPTIONS = ['政治处', '新公处', '经商处', '科技处', '武官处', '领侨处', '文化处', '办公室', '党委办']

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
    roleOptions: ROLE_OPTIONS,
    positionOptions: POSITION_OPTIONS,
    departmentOptions: DEPARTMENT_OPTIONS,
    roleIndex: -1,
    positionIndex: 0,
    departmentIndex: 0,
    showRelativeField: false,
    showDepartmentField: false,
    reviewRemark: '',
    today: getTodayDate(),
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

  onLoad(options) {
    // 设置今天的日期作为最大可选日期
    const today = getTodayDate()
    this.setData({
      today: today
    })
    this.loadUserProfile()
  },

  onShow() {
    // 每次显示时更新今天的日期
    this.setData({ today: getTodayDate() })
  },

  loadUserProfile() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          util.showToast({
            title: '请先完成注册',
            icon: 'none'
          })
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
          return
        }

        const user = result.user
        const roleIndex = user.role ? ROLE_OPTIONS.indexOf(user.role) : -1
        const role = user.role || ''
        const showRelativeField = role === '配偶' || role === '家属'
        const showDepartmentField = role === '部门负责人' || role === '馆员' || role === '工勤'
        
        // 根据角色设置岗位选项和显示状态
        let showPositionField = true
        let positionOptions = POSITION_OPTIONS
        let positionIndex = 0
        
        if (role === '工勤') {
          positionOptions = ['厨师', '招待员']
          positionIndex = user.position ? positionOptions.indexOf(user.position) : -1
        } else if (role === '配偶') {
          positionOptions = ['无', '内聘']
          positionIndex = user.position ? positionOptions.indexOf(user.position) : 0
        } else if (role === '物业' || role === '家属') {
          showPositionField = false
          positionIndex = user.position ? POSITION_OPTIONS.indexOf(user.position) : 0
        } else {
          positionIndex = user.position ? POSITION_OPTIONS.indexOf(user.position) : 0
        }

        let department = user.department || ''
        let departmentIndex = 0
        let departmentOptions = DEPARTMENT_OPTIONS

        // 如果是工勤角色，部门固定为"办公室"
        if (role === '工勤') {
          department = '办公室'
          departmentIndex = 7
          departmentOptions = ['办公室']
        } else if (department) {
          departmentIndex = DEPARTMENT_OPTIONS.indexOf(department)
          if (departmentIndex === -1) {
            departmentIndex = 0
            department = ''
          }
        }

        this.setData({
          roleIndex,
          positionIndex,
          showPositionField,
          positionOptions,
          showRelativeField,
          showDepartmentField,
          departmentIndex,
          departmentOptions,
          form: {
            name: user.name || '',
            gender: user.gender || '男',
            birthday: user.birthday || '',
            role: role,
            isAdmin: !!user.isAdmin,
            relativeName: user.relativeName || '',
            position: user.position || '无',
            department: department
          }
        })
      })
      .catch((error) => {
        util.showToast({
          title: error.message || '加载失败',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
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

  handleRoleChange(e) {
    const roleIndex = Number(e.detail.value)
    const role = ROLE_OPTIONS[roleIndex]
    const showRelativeField = role === '配偶' || role === '家属'
    const showDepartmentField = role === '部门负责人' || role === '馆员' || role === '工勤'
    const isWorker = role === '工勤'

    let department = ''
    let departmentIndex = 0
    let departmentOptions = DEPARTMENT_OPTIONS
    
    // 根据角色设置岗位选项和显示状态
    let showPositionField = true
    let positionOptions = POSITION_OPTIONS
    let positionIndex = 0

    // 如果是工勤角色，部门固定为"办公室"
    if (isWorker) {
      department = '办公室'
      departmentIndex = 7
      departmentOptions = ['办公室']
    }
    
    // 根据角色设置岗位选项
    if (role === '工勤') {
      positionOptions = ['厨师', '招待员']
      positionIndex = -1  // 默认不选择，显示空白状态
    } else if (role === '配偶') {
      positionOptions = ['无', '内聘']
      positionIndex = 0
    } else if (role === '物业' || role === '家属') {
      showPositionField = false
      positionIndex = 0
    } else {
      positionIndex = 0
    }

    this.setData({
      roleIndex,
      positionOptions,
      positionIndex,
      'form.role': role,
      showRelativeField,
      showDepartmentField,
      showPositionField,
      'form.relativeName': showRelativeField ? this.data.form.relativeName : '',
      'form.position': positionIndex >= 0 ? positionOptions[positionIndex] : '',
      'form.department': department,
      departmentIndex,
      departmentOptions
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
    if ((form.role === '部门负责人' || form.role === '馆员' || form.role === '工勤') && !form.department) {
      util.showToast({ title: '请选择部门', icon: 'none' })
      return
    }
    if (form.role === '工勤' && this.data.positionIndex < 0) {
      util.showToast({ title: '请选择岗位', icon: 'none' })
      return
    }

    this.setData({ loading: true })

    app.submitProfileUpdate(form)
      .then(() => {
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
        util.showToast({
          title: error.message || '提交失败',
          icon: 'none'
        })
      })
      .then(() => {
        this.setData({ loading: false })
      })
  }
})
