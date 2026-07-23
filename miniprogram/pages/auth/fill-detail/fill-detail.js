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
            showDepartment: true,
            fixedDepartment: null
        }
    },

    handleRoleChange(e) {
        const roleIndex = Number(e.detail.value)
        const { roleOptions, allDepartmentOptions, constants } = this.data
        const role = roleOptions[roleIndex]

        const needRelativeRoles = constants.NEED_RELATIVE_ROLES || []
        const roleConfig = this.getRoleFieldConfig(role)

        const showRelativeField = needRelativeRoles.includes(role)
        const showDepartmentField = roleConfig.showDepartment
        // 待赴任馆员尚未到任，无需填写居住区域
        const showLivingArea = role !== '待赴任馆员'

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
            showLivingArea,
            'form.relativeName': showRelativeField ? this.data.form.relativeName : '',
            'form.department': department,
            'form.isDepartmentHead': isDepartmentHead,
            // 切换角色时，待赴任馆员清空居住区域；其他角色保留原值
            'form.livingArea': showLivingArea ? this.data.form.livingArea : '',
            livingAreaIndex: showLivingArea ? this.data.livingAreaIndex : -1,
            departmentIndex,
            departmentOptions: roleDepartmentOptions
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
        const { constants, showLivingArea } = this.data
        const needRelativeRoles = constants.NEED_RELATIVE_ROLES || []
        const roleConfig = this.getRoleFieldConfig(form.role)

        if (!form.role) {
            wx.showToast({ title: '请选择角色', icon: 'none' })
            return
        }
        if (needRelativeRoles.includes(form.role) && !String(form.relativeName || '').trim()) {
            wx.showToast({ title: '请填写亲属姓名', icon: 'none' })
            return
        }
        if (roleConfig.showDepartment && this.data.departmentIndex < 0) {
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
                    wx.reLaunch({
                        url: '/pages/office/arrival-guide/arrival-guide'
                    })
                } else {
                    wx.switchTab({
                        url: '/pages/office/home/home'
                    })
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
