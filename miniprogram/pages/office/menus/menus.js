const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')
const customToast = require('../../../behaviors/customToast.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  // 使用统一的时间处理函数
  return utils.formatDate(timestamp)
}

Page({
  behaviors: [paginationBehavior, customToast],

  data: {
    menuList: [],
    showAddButton: false,
    canExportRatings: false,
    exportMode: false,
    selectedMenuIds: [],
    exporting: false,
    guardReady: false
  },

  onLoad() {
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    this.setData({ themeClass: app.getThemeClass(), pageStyle: app.getPageStyle() })
    app.applySystemUITheme(app.globalData.theme)
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
    // 每次显示页面时刷新数据（从编辑页返回时自动更新）
    app.guardRegistered().then((user) => {
      if (!user) return
      this.setData({ guardReady: true })
      this.refreshList()
      this.applyPermission(user)
    })
  },

  applyPermission(user) {
    //管理员、厨师、办公室内聘可添加菜单
    const isAdmin = user.isAdmin
    const isChef = Array.isArray(user.position) && user.position.includes('厨师')
    const isOfficeServant = Array.isArray(user.position) && user.position.includes('办公室内聘')

    // 导出评分权限：管理员 / 领导（馆员+部门无，排除限制权限）/ 办部门负责人
    const isLeader = user.role === '馆员' && user.department === '无' && !user.isRestrictedLeader
    const isBanHead = user.role === '馆员' && user.department === '办' && user.isDepartmentHead
    const canExportRatings = !!isAdmin || isLeader || isBanHead

    this.setData({
      showAddButton: isAdmin || isChef || isOfficeServant,
      canExportRatings
    })
  },

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  async loadData(params) {
    const { page, pageSize } = params
    const skipCount = (page - 1) * pageSize

    return new Promise((resolve, reject) => {
      const db = wx.cloud.database()
      const _ = db.command
      db.collection('menus')
        .where({ createdAt: _.gte(0) })
        .orderBy('createdAt', 'desc')
        .skip(skipCount)
        .limit(pageSize)
        .get()
        .then(res => {
          const menuList = (res.data || []).map(item => ({
            ...item,
            timeText: formatTime(item.createdAt)
          }))

          // 同步到 menuList
          this.setData({
            menuList: page === 1 ? menuList : [...this.data.menuList, ...menuList]
          })

          resolve({
            data: menuList,
            hasMore: menuList.length >= pageSize
          })
        })
        .catch(error => {
          console.error('加载菜单失败', error)
          utils.showToast({
            title: '加载失败',
            icon: 'none'
          })
          reject(error)
        })
    })
  },

  loadMenus(loadMore = false) {
    this.loadListData(loadMore)
  },

  goMenuDetail(e) {
    app.subscribeOnTap(app.getSubscribeTypesForUser(app.globalData.userProfile))
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/office/menu-detail/menu-detail?id=${id}`
    })
  },

  goAddMenu() {
    app.subscribeOnTap(app.getSubscribeTypesForUser(app.globalData.userProfile))
    wx.navigateTo({
      url: '/pages/office/menu-edit/menu-edit'
    })
  },

  // ===== 评分导出 =====
  handleStartExport() {
    app.subscribeOnTap(app.getSubscribeTypesForUser(app.globalData.userProfile))
    // WXML 不支持数组 indexOf 调用，预计算每项 checked
    const list = this.data.list.map(item => ({ ...item, checked: false }))
    this.setData({ exportMode: true, selectedMenuIds: [], list })
    this._showCustomToast('请选择您想导出评分的菜单，可多选', { duration: 2500, fadeOutMs: 400 })
  },

  handleCancelExport() {
    const list = this.data.list.map(item => ({ ...item, checked: false }))
    this.setData({ exportMode: false, selectedMenuIds: [], list })
  },

  toggleMenuSelect(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const selected = [...this.data.selectedMenuIds]
    const idx = selected.indexOf(id)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      selected.push(id)
    }
    // 预计算 list 每项 checked，避免 WXML 调用 indexOf
    const list = this.data.list.map(item => ({
      ...item,
      checked: selected.indexOf(item._id) >= 0
    }))
    this.setData({ selectedMenuIds: selected, list })
  },

  async handleExportRatings() {
    if (this.data.exporting) return
    const { selectedMenuIds } = this.data
    if (!selectedMenuIds.length) {
      this._showCustomToast('请先选择至少一个菜单', { duration: 1800, fadeOutMs: 400 })
      return
    }
    this.setData({ exporting: true })
    wx.showLoading({ title: '生成中...', mask: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateOrderPdf',
        data: { type: 'menuRatings', menuIds: selectedMenuIds }
      })
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '生成失败')
      }
      const fileID = result.data && result.data.fileID
      if (!fileID) throw new Error('未获取到文件')
      // 下载并打开 PDF
      const dl = await wx.cloud.downloadFile({ fileID })
      wx.openDocument({
        filePath: dl.tempFilePath,
        fileType: 'pdf',
        showMenu: true,
        success: () => {
          this.setData({ exportMode: false, selectedMenuIds: [], exporting: false })
        },
        fail: () => {
          this.setData({ exporting: false })
          utils.showToast({ title: '打开失败', icon: 'none' })
        }
      })
    } catch (err) {
      wx.hideLoading()
      this.setData({ exporting: false })
      utils.showToast({ title: err.message || '导出失败', icon: 'none' })
    }
  },

  /**
   * 重写 onReachBottom 方法
   */
  onReachBottom() {
    this.loadMore()
  },

  /**
   * 重写 onPullDownRefresh 方法
   */
  async onPullDownRefresh() {
    await this.refreshList()
    wx.stopPullDownRefresh()
  }
})
