const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')

Page({
  behaviors: [modalAnimation],

  data: {
    loading: true,
    livingAreas: [],
    areaManagerGroups: [],   // [{ area, managers: [{openid,name,role,department,avatarText,...}] }]
    leaderNotifierGroups: [], // [{ leader, notifiers: [...] }]
    deptNotifierGroups: [],   // [{ department, heads: [...], extraNotifiers: [...] }]
    allUsers: [],
    showAddUser: false,
    modalAnimating: false,
    addMode: '',              // 'area' | 'leader' | 'dept'
    currentArea: '',
    currentLeaderOpenid: '',
    currentDepartment: '',
    addTitle: '',
    searchKeyword: '',
    availableUsers: [],
    canEdit: false
  },

  async onLoad() {
    await this.checkPermission()
    await this.loadData()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  /**
   * 检查当前用户是否为管理员（决定可编辑权限）
   */
  checkPermission() {
    return app.checkUserRegistration().then((result) => {
      if (result.registered && result.user) {
        const isAdmin = result.user.isAdmin || result.user.role === 'admin'
        this.setData({ canEdit: !!isAdmin })
      }
    }).catch(() => {})
  },

  /**
   * 加载报备配置数据
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'reportNotifierManager',
        data: { action: 'getReportConfig' }
      })
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '加载失败')
      }
      const { livingAreas, areaManagerGroups, leaderNotifierGroups, deptNotifierGroups, allUsers } = res.result.data
      this.setData({
        livingAreas,
        areaManagerGroups,
        leaderNotifierGroups,
        deptNotifierGroups,
        allUsers,
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false })
      utils.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  /**
   * 显示添加片长弹窗
   */
  handleShowAddAreaManager(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const area = e.currentTarget.dataset.area
    const availableUsers = this.data.allUsers.filter(u => !(Array.isArray(u.areaManagerOf) && u.areaManagerOf.includes(area)))
    this.setData({
      showAddUser: true,
      addMode: 'area',
      currentArea: area,
      currentLeaderOpenid: '',
      currentDepartment: '',
      addTitle: '添加片长到「' + area + '」',
      searchKeyword: '',
      availableUsers
    })
  },

  /**
   * 显示添加馆领导报备人弹窗
   */
  handleShowAddLeaderNotifier(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { leaderOpenid, leaderName } = e.currentTarget.dataset
    const group = this.data.leaderNotifierGroups.find(g => g.leader.openid === leaderOpenid)
    const existingOpenids = group ? group.notifiers.map(u => u.openid) : []
    const availableUsers = this.data.allUsers.filter(u => u.openid !== leaderOpenid && !existingOpenids.includes(u.openid))
    this.setData({
      showAddUser: true,
      addMode: 'leader',
      currentLeaderOpenid: leaderOpenid,
      currentArea: '',
      currentDepartment: '',
      addTitle: '为「' + leaderName + '」添加报备人',
      searchKeyword: '',
      availableUsers
    })
  },

  /**
   * 显示添加部门额外报备人弹窗
   */
  handleShowAddDeptNotifier(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const department = e.currentTarget.dataset.department
    const group = this.data.deptNotifierGroups.find(g => g.department === department)
    const existingOpenids = group ? group.extraNotifiers.map(u => u.openid) : []
    const availableUsers = this.data.allUsers.filter(u => !existingOpenids.includes(u.openid))
    this.setData({
      showAddUser: true,
      addMode: 'dept',
      currentDepartment: department,
      currentArea: '',
      currentLeaderOpenid: '',
      addTitle: '为「' + department + '」添加额外报备人',
      searchKeyword: '',
      availableUsers
    })
  },

  /**
   * 关闭弹窗（带退出动画）
   */
  handleCloseAddUser() {
    this._closeModal('showAddUser')
  },

  stopPropagation() {},

  /**
   * 搜索用户
   */
  handleSearchInput(e) {
    const keyword = e.detail.value.trim()
    let availableUsers = []
    if (this.data.addMode === 'area') {
      const area = this.data.currentArea
      availableUsers = this.data.allUsers.filter(u => !(Array.isArray(u.areaManagerOf) && u.areaManagerOf.includes(area)))
    } else if (this.data.addMode === 'leader') {
      const leaderOpenid = this.data.currentLeaderOpenid
      const group = this.data.leaderNotifierGroups.find(g => g.leader.openid === leaderOpenid)
      const existingOpenids = group ? group.notifiers.map(u => u.openid) : []
      availableUsers = this.data.allUsers.filter(u => u.openid !== leaderOpenid && !existingOpenids.includes(u.openid))
    } else if (this.data.addMode === 'dept') {
      const department = this.data.currentDepartment
      const group = this.data.deptNotifierGroups.find(g => g.department === department)
      const existingOpenids = group ? group.extraNotifiers.map(u => u.openid) : []
      availableUsers = this.data.allUsers.filter(u => !existingOpenids.includes(u.openid))
    }
    if (keyword) {
      availableUsers = availableUsers.filter(u => (u.name || '').indexOf(keyword) > -1)
    }
    this.setData({ searchKeyword: keyword, availableUsers })
  },

  /**
   * 确认添加（按 addMode 调用不同云函数 action）
   */
  async handleConfirmAdd(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { openid } = e.currentTarget.dataset
    wx.showLoading({ title: '添加中...', mask: true })
    try {
      let res = null
      if (this.data.addMode === 'area') {
        res = await wx.cloud.callFunction({
          name: 'reportNotifierManager',
          data: { action: 'setAreaManager', targetOpenid: openid, area: this.data.currentArea }
        })
      } else if (this.data.addMode === 'leader') {
        res = await wx.cloud.callFunction({
          name: 'reportNotifierManager',
          data: { action: 'setLeaderNotifier', leaderOpenid: this.data.currentLeaderOpenid, notifierOpenid: openid }
        })
      } else if (this.data.addMode === 'dept') {
        res = await wx.cloud.callFunction({
          name: 'reportNotifierManager',
          data: { action: 'setDeptExtraNotifier', targetOpenid: openid, department: this.data.currentDepartment }
        })
      }
      if (!res || res.result.code !== 0) {
        throw new Error((res && res.result.message) || '添加失败')
      }
      wx.hideLoading()
      utils.showToast({ title: '添加成功', icon: 'success' })
      await this.loadData()
      this._closeModal('showAddUser')
    } catch (error) {
      wx.hideLoading()
      utils.showToast({ title: error.message || '添加失败', icon: 'none' })
    }
  },

  /**
   * 移除片长
   */
  handleRemoveAreaManager(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { openid, area } = e.currentTarget.dataset
    wx.showModal({
      title: '确认移除',
      content: '确认将该用户从「' + area + '」片长移除？',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '移除中...', mask: true })
        try {
          const res = await wx.cloud.callFunction({
            name: 'reportNotifierManager',
            data: { action: 'removeAreaManager', targetOpenid: openid, area }
          })
          if (res.result.code !== 0) throw new Error(res.result.message || '移除失败')
          wx.hideLoading()
          utils.showToast({ title: '已移除', icon: 'success' })
          await this.loadData()
        } catch (error) {
          wx.hideLoading()
          utils.showToast({ title: error.message || '移除失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 移除馆领导报备人
   */
  handleRemoveLeaderNotifier(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { leaderOpenid, openid } = e.currentTarget.dataset
    wx.showModal({
      title: '确认移除',
      content: '确认移除该报备人？',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '移除中...', mask: true })
        try {
          const res = await wx.cloud.callFunction({
            name: 'reportNotifierManager',
            data: { action: 'removeLeaderNotifier', leaderOpenid, notifierOpenid: openid }
          })
          if (res.result.code !== 0) throw new Error(res.result.message || '移除失败')
          wx.hideLoading()
          utils.showToast({ title: '已移除', icon: 'success' })
          await this.loadData()
        } catch (error) {
          wx.hideLoading()
          utils.showToast({ title: error.message || '移除失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 切换部门负责人报备推送开关（暂停/恢复）
   */
  handleToggleDeptHeadNotify(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { openid, disabled } = e.currentTarget.dataset
    const isDisabled = disabled === true || disabled === 'true'
    const actionText = isDisabled ? '恢复接收' : '暂停接收'
    wx.showModal({
      title: '确认操作',
      content: '确认' + actionText + '该部门负责人的报备推送？',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          const res = await wx.cloud.callFunction({
            name: 'reportNotifierManager',
            data: { action: 'toggleDeptHeadNotify', targetOpenid: openid }
          })
          if (res.result.code !== 0) throw new Error(res.result.message || '操作失败')
          wx.hideLoading()
          utils.showToast({ title: res.result.message || '操作成功', icon: 'none' })
          await this.loadData()
        } catch (error) {
          wx.hideLoading()
          utils.showToast({ title: error.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  /**
   * 移除部门额外报备人
   */
  handleRemoveDeptExtraNotifier(e) {
    if (!this.data.canEdit) {
      utils.showToast({ title: '无权限操作', icon: 'none' })
      return
    }
    const { openid, department } = e.currentTarget.dataset
    wx.showModal({
      title: '确认移除',
      content: '确认将该用户从「' + department + '」额外报备人移除？',
      success: async (r) => {
        if (!r.confirm) return
        wx.showLoading({ title: '移除中...', mask: true })
        try {
          const res = await wx.cloud.callFunction({
            name: 'reportNotifierManager',
            data: { action: 'removeDeptExtraNotifier', targetOpenid: openid, department }
          })
          if (res.result.code !== 0) throw new Error(res.result.message || '移除失败')
          wx.hideLoading()
          utils.showToast({ title: '已移除', icon: 'success' })
          await this.loadData()
        } catch (error) {
          wx.hideLoading()
          utils.showToast({ title: error.message || '移除失败', icon: 'none' })
        }
      }
    })
  }
})
