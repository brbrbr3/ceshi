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
    allUsers: [],
    showAddUser: false,
    modalAnimating: false,
    addMode: '',              // 'area' | 'leader'
    currentArea: '',
    currentLeaderOpenid: '',
    addTitle: '',
    searchKeyword: '',
    availableUsers: []
  },

  async onLoad() {
    await this.loadData()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
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
      const { livingAreas, areaManagerGroups, leaderNotifierGroups, allUsers } = res.result.data
      this.setData({
        livingAreas,
        areaManagerGroups,
        leaderNotifierGroups,
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
    const area = e.currentTarget.dataset.area
    const availableUsers = this.data.allUsers.filter(u => !(Array.isArray(u.areaManagerOf) && u.areaManagerOf.includes(area)))
    this.setData({
      showAddUser: true,
      addMode: 'area',
      currentArea: area,
      currentLeaderOpenid: '',
      addTitle: '添加片长到「' + area + '」',
      searchKeyword: '',
      availableUsers
    })
  },

  /**
   * 显示添加馆领导报备人弹窗
   */
  handleShowAddLeaderNotifier(e) {
    const { leaderOpenid, leaderName } = e.currentTarget.dataset
    const group = this.data.leaderNotifierGroups.find(g => g.leader.openid === leaderOpenid)
    const existingOpenids = group ? group.notifiers.map(u => u.openid) : []
    const availableUsers = this.data.allUsers.filter(u => u.openid !== leaderOpenid && !existingOpenids.includes(u.openid))
    this.setData({
      showAddUser: true,
      addMode: 'leader',
      currentLeaderOpenid: leaderOpenid,
      currentArea: '',
      addTitle: '为「' + leaderName + '」添加报备人',
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
  }
})
