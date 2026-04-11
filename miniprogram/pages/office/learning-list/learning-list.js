const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  behaviors: [paginationBehavior],

  data: {
    list: [],
    showCreateButton: true,
    isAdmin: false,
    swipeItem: null,
    swipeX: {}
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })
  },

  onShow() {
    // 字体缩放
    const fontScale = app.globalData.fontScale || 1
    if (this.data.fontScale !== fontScale) {
      this.setData({
        fontScale,
        pageStyle: `--font-scale: ${fontScale}`
      })
    }
    this.resetPagination()
    this.loadArticles()
    this.checkPermission()
  },

  checkPermission() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          this.setData({ showCreateButton: false, isAdmin: false })
          return
        }
        this.setData({
          showCreateButton: true,
          isAdmin: !!result.user.isAdmin
        })
      })
      .catch(() => {
        this.setData({ showCreateButton: false, isAdmin: false })
      })
  },

  loadData(params) {
    const { page, pageSize } = params

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'articleManager',
        data: {
          action: 'list',
          params: { page, pageSize }
        }
      }).then(res => {
        const result = res.result
        if (result && result.code === 0) {
          const list = (result.data.list || []).map(item => ({
            ...item,
            timeText: formatTime(item.createdAt)
          }))

          this.setData({
            list: page === 1 ? list : [...this.data.list, ...list]
          })

          resolve({
            data: list,
            hasMore: result.data.hasMore
          })
        } else {
          reject(new Error(result.message || '加载失败'))
        }
      }).catch(error => {
        reject(error)
      })
    })
  },

  loadArticles(loadMore = false) {
    this.loadListData(loadMore)
  },

  handleCreate() {
    wx.navigateTo({
      url: '/pages/office/learning-create/learning-create'
    })
  },

  handleItemTap(e) {
    if (this.data.swipeItem) {
      const id = e.currentTarget.dataset.id
      this.setData({ [`swipeX.${id}`]: 0, swipeItem: null })
      return
    }
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/office/learning-detail/learning-detail?id=${id}`
    })
  },

  // 左划菜单
  handleTouchStart(e) {
    const id = e.currentTarget.dataset.id
    const touch = e.touches[0]
    this.setData({
      [`touchStartX_${id}`]: touch.clientX,
      [`touchStartY_${id}`]: touch.clientY
    })
  },

  handleTouchMove(e) {
    const id = e.currentTarget.dataset.id
    const touch = e.touches[0]
    const startX = this.data[`touchStartX_${id}`]
    const startY = this.data[`touchStartY_${id}`]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY

    if (Math.abs(deltaY) > Math.abs(deltaX)) return

    if (deltaX < 0) {
      const offset = Math.max(deltaX, -160)
      this.setData({ [`swipeX.${id}`]: offset, swipeItem: id })
    }
  },

  handleTouchEnd(e) {
    const id = e.currentTarget.dataset.id
    const currentX = this.data.swipeX[id] || 0

    if (currentX < -60) {
      this.setData({ [`swipeX.${id}`]: -160, swipeItem: id })
    } else {
      this.setData({ [`swipeX.${id}`]: 0 })
    }
  },

  handlePin(e) {
    if (!this.data.isAdmin) {
      wx.showModal({ title: '提示', content: '只有管理员可置顶文章', showCancel: false })
      return
    }
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i._id === id)
    if (!item) return

    const action = item.isPinned ? '取消置顶' : '置顶'

    wx.showModal({
      title: `确认${action}`,
      content: `${action}「${item.title}」？`,
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          const result = await wx.cloud.callFunction({
            name: 'articleManager',
            data: { action: 'pin', articleId: id }
          })
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            utils.showToast({ title: result.result.message || '操作成功', icon: 'success' })
            this.resetPagination()
            this.loadArticles()
          } else {
            utils.showToast({ title: result.result.message || '操作失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          utils.showToast({ title: '操作失败', icon: 'none' })
        }
        this.setData({ [`swipeX.${id}`]: 0, swipeItem: null })
      }
    })
  },

  handleDelete(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i._id === id)
    if (!item) return

    wx.showModal({
      title: '确认删除',
      content: `删除「${item.title}」？此操作不可恢复。`,
      confirmColor: '#DC2626',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          const result = await wx.cloud.callFunction({
            name: 'articleManager',
            data: { action: 'delete', articleId: id }
          })
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            utils.showToast({ title: '已删除', icon: 'success' })
            this.resetPagination()
            this.loadArticles()
          } else {
            utils.showToast({ title: result.result.message || '删除失败', icon: 'none' })
          }
        } catch (err) {
          wx.hideLoading()
          utils.showToast({ title: '删除失败', icon: 'none' })
        }
        this.setData({ [`swipeX.${id}`]: 0, swipeItem: null })
      }
    })
  }
})
