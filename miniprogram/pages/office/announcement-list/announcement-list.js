const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 使用统一的时间格式化函数
const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  behaviors: [paginationBehavior],

  data: {
    list: [],
    filterType: 'all',
    showCreateButton: false,
    // 左划菜单状态
    swipeItem: null,      // 当前展开的公告 _id
    swipeX: {}            // { [id]: offset }
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })
    this.loadAnnouncements()
  },

  onShow() {
    // 每次显示页面时刷新列表（支持从详情页返回后刷新）
    this.resetPagination()
    this.loadAnnouncements()
    this.checkPermission()
  },

  checkPermission() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          this.setData({ showCreateButton: false, isAdmin: false })
          return
        }

        // 所有用户都可以发布通知公告
        this.setData({
          showCreateButton: true,
          isAdmin: !!result.user.isAdmin
        })
      })
      .catch((error) => {
        console.error('检查权限失败', error)
        this.setData({ showCreateButton: false, isAdmin: false })
      })
  },

  /**
   * 重写 loadData 方法，实现分页加载逻辑
   */
  loadData(params) {
    const { page, pageSize } = params

    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'announcementManager',
        data: {
          action: 'list',
          params: {
            page,
            pageSize,
            type: this.data.filterType
          }
        }
      }).then(res => {
        const result = res.result
        if (result && result.code === 0) {
          const data = result.data || {}
          const list = data.list || []

          // 格式化时间
          const formattedList = list.map(item => ({
            ...item,
            timeText: formatTime(item.publishedAt),
            // 通知类型对应的文本和样式
            typeText: this.getTypeText(item.type),
            typeClass: this.getTypeClass(item.type),
            unread: !item.readUsers || !item.readUsers.includes(app.globalData.openid)
          }))

          // 同步到 list
          this.setData({
            list: page === 1 ? formattedList : [...this.data.list, ...formattedList]
          })

          resolve({
            data: formattedList,
            hasMore: data.hasMore
          })
        } else {
          reject(new Error(result.message || '加载失败'))
        }
      }).catch(error => {
        reject(error)
      })
    })
  },

  loadAnnouncements(loadMore = false) {
    this.loadListData(loadMore)
  },

  /**
   * 筛选通知类型
   */
  handleFilterChange(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.filterType) {
      return
    }

    this.setData({ filterType: type })
    this.resetPagination()
    this.loadAnnouncements()
  },

  /**
   * 点击通知公告
   */
  handleAnnouncementTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/office/announcement-detail/announcement-detail?id=${id}`
    })
  },

  /**
   * 发布新通知
   */
  handleCreate() {
    wx.navigateTo({
      url: '/pages/office/announcement-create/announcement-create'
    })
  },

  /**
   * 获取通知类型文本
   */
  getTypeText(type) {
    const typeMap = {
      'urgent': '紧急',
      'important': '重要',
      'normal': '普通'
    }
    return typeMap[type] || '普通'
  },

  /**
   * 获取通知类型样式类
   */
  getTypeClass(type) {
    const classMap = {
      'urgent': 'tag-urgent',
      'important': 'tag-important',
      'normal': 'tag-normal'
    }
    return classMap[type] || 'tag-normal'
  },

  // ========== 左划菜单 ==========

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

    // 纵向滑动不处理
    if (Math.abs(deltaY) > Math.abs(deltaX)) return

    // 只允许左滑
    if (deltaX < 0) {
      const offset = Math.max(deltaX, -160) // 最大展开160rpx
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

  // 点击列表项时收起菜单（防止误触）
  handleItemTap(e) {
    if (this.data.swipeItem) {
      const id = e.currentTarget.dataset.id
      this.setData({ [`swipeX.${id}`]: 0, swipeItem: null })
      // 如果已展开，不执行跳转
      return
    }
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/office/announcement-detail/announcement-detail?id=${id}`
    })
  },

  // ========== 置顶 ==========

  handlePin(e) {
    if (!this.data.isAdmin) {
      wx.showModal({ title: '提示', content: '只有管理员可置顶公告', showCancel: false })
      return
    }
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i._id === id)
    if (!item) return

    const action = item.isPinned ? '取消置顶' : '置顶'

    wx.showModal({
      title: `确认${action}`,
      content: `${action}「${item.title}」？`,
      confirmText: '确定',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中...', mask: true })
        try {
          const result = await wx.cloud.callFunction({
            name: 'announcementManager',
            data: { action: 'pin', announcementId: id }
          })
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            utils.showToast({ title: result.result.message || '操作成功', icon: 'success' })
            this.resetPagination()
            this.loadAnnouncements()
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

  // ========== 删除 ==========

  handleDelete(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find(i => i._id === id)
    if (!item) return

    wx.showModal({
      title: '确认删除',
      content: `删除「${item.title}」？此操作不可恢复。`,
      confirmColor: '#EF4444',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...', mask: true })
        try {
          const result = await wx.cloud.callFunction({
            name: 'announcementManager',
            data: { action: 'delete', announcementId: id }
          })
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            utils.showToast({ title: '已删除', icon: 'success' })
            this.resetPagination()
            this.loadAnnouncements()
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
