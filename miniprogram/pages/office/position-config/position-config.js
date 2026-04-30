const app = getApp()
const utils = require('../../../common/utils.js')
const modalAnimation = require('../../../behaviors/modalAnimation.js')

Page({
  behaviors: [modalAnimation],

  data: {
    loading: true,
    positionGroups: [], // [{position, users: [{openid, name, role, department, avatarText}]}]
    allUsers: [],       // 所有用户
    currentUser: null,
    showAddUser: false,
    currentPosition: '',
    searchKeyword: '',
    availableUsers: [],
    modalAnimating: false
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
   * 权限检查：馆领导 / 部门负责人+办公室 / 管理员
   */
  async checkPermission() {
    try {
      const result = await app.checkUserRegistration()
      if (!result.registered || !result.user) {
        wx.showModal({ title: '提示', content: '请先完成注册', showCancel: false, success: () => wx.navigateBack() })
        return
      }

      const user = result.user
      const hasPermission = user.isAdmin || user.role === '馆领导' || (user.role === '部门负责人' && user.department === '办公室')

      if (!hasPermission) {
        wx.showModal({ title: '权限不足', content: '您没有岗位配置权限', showCancel: false, success: () => wx.navigateBack() })
        return
      }

      this.setData({ currentUser: user })
    } catch (error) {
      wx.showModal({ title: '错误', content: error.message || '权限检查失败', showCancel: false, success: () => wx.navigateBack() })
    }
  },

  /**
   * 加载岗位和用户数据
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      // 获取岗位选项
      const positionOptions = app.getConstantSync('POSITION_OPTIONS') || []

      // 获取所有用户
      const res = await app.callOfficeAuth('getContactsList')
      const allUsers = (res.contacts || []).map(u => ({
        ...u,
        avatarText: u.avatarText || (u.name ? u.name.slice(0, 1) : '智')
      }))

      // 按岗位分组
      const positionGroups = positionOptions.map(position => {
        const users = allUsers.filter(u => Array.isArray(u.position) && u.position.includes(position))
        return { position, users }
      })

      this.setData({ positionGroups, allUsers, loading: false })
    } catch (error) {
      this.setData({ loading: false })
      utils.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  /**
   * 显示添加人员弹窗
   */
  handleShowAddUser(e) {
    const position = e.currentTarget.dataset.position
    const allUsers = this.data.allUsers

    // 过滤：不在该岗位的用户
    const availableUsers = allUsers.filter(u => !(Array.isArray(u.position) && u.position.includes(position)))

    this.setData({
      showAddUser: true,
      currentPosition: position,
      searchKeyword: '',
      availableUsers
    })
  },

  /**
   * 关闭添加人员弹窗
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
    const position = this.data.currentPosition
    const allUsers = this.data.allUsers

    let availableUsers = allUsers.filter(u => !(Array.isArray(u.position) && u.position.includes(position)))

    if (keyword) {
      availableUsers = availableUsers.filter(u => (u.name || '').indexOf(keyword) > -1)
    }

    this.setData({ searchKeyword: keyword, availableUsers })
  },

  /**
   * 为用户分配岗位
   */
  async handleAssignPosition(e) {
    const { openid, name } = e.currentTarget.dataset
    const position = this.data.currentPosition

    wx.showLoading({ title: '分配中...', mask: true })
    try {
      await wx.cloud.callFunction({
        name: 'positionManager',
        data: { action: 'assignPosition', targetOpenid: openid, position }
      })

      wx.hideLoading()
      utils.showToast({ title: `已将「${name}」分配到「${position}」`, icon: 'success' })

      // 刷新数据
      await this.loadData()
      this._closeModal('showAddUser')
    } catch (error) {
      wx.hideLoading()
      utils.showToast({ title: error.message || '分配失败', icon: 'none' })
    }
  },

  /**
   * 移除用户岗位
   */
  handleRemovePosition(e) {
    const { openid, position } = e.currentTarget.dataset

    wx.showModal({
      title: '确认移除',
      content: `确认将该用户从「${position}」岗位移除？`,
      success: async (res) => {
        if (!res.confirm) return

        wx.showLoading({ title: '移除中...', mask: true })
        try {
          await wx.cloud.callFunction({
            name: 'positionManager',
            data: { action: 'removePosition', targetOpenid: openid, position }
          })

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
