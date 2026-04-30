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
    const hasPermission = await this.checkPermission()
    if (!hasPermission) return
    await this.loadData()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  /**
   * 权限检查：使用系统权限配置
   */
  async checkPermission() {
    try {
      const hasPermission = await app.checkPermission('manage_positions')
      if (!hasPermission) {
        wx.showModal({ title: '权限不足', content: '您没有岗位配置权限', showCancel: false, success: () => wx.navigateBack() })
        return false
      }
      return true
    } catch (error) {
      wx.showModal({ title: '错误', content: error.message || '权限检查失败', showCancel: false, success: () => wx.navigateBack() })
      return false
    }
  },

  /**
   * 加载岗位和用户数据
   */
  async loadData() {
    this.setData({ loading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'positionManager',
        data: { action: 'getPositionConfig' }
      })
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '加载失败')
      }

      const { positionGroups, allUsers } = res.result.data
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
      const res = await wx.cloud.callFunction({
        name: 'positionManager',
        data: { action: 'assignPosition', targetOpenid: openid, position }
      })
      if (res.result.code !== 0) {
        throw new Error(res.result.message || '分配失败')
      }

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
          const res = await wx.cloud.callFunction({
            name: 'positionManager',
            data: { action: 'removePosition', targetOpenid: openid, position }
          })
          if (res.result.code !== 0) {
            throw new Error(res.result.message || '移除失败')
          }

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
