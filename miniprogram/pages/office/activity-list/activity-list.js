const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

const formatTime = (timestamp) => utils.formatRelativeTime(timestamp)

Page({
  behaviors: [paginationBehavior],

  data: {
    list: [],
    filterStatus: 'all',
    showCreateButton: false,
    swipeItem: null,
    swipeX: {}
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 15,
      loadMorePageSize: 15
    })
    this.loadActivities()
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
  if (this.data.fontStyle !== fontStyle) {
    this.setData({ fontStyle })
  }
    this.resetPagination()
    this.loadActivities()
    this.checkPermission()
  },

  checkPermission() {
    app.checkUserRegistration().then((result) => {
      if (!result.registered || !result.user) {
        this.setData({ showCreateButton: false, isAdmin: false })
        return
      }
      // 所有登录用户可创建活动
      this.setData({
        showCreateButton: true,
        isAdmin: !!result.user.isAdmin
      })
    }).catch(() => {
      this.setData({ showCreateButton: false, isAdmin: false })
    })
  },

  loadData(params) {
    const { page, pageSize } = params

    return new Promise((resolve, reject) => {
      // 始终拉全量数据，不依赖后端的 status 字段筛选；由前端按截止日期分 tab
      wx.cloud.callFunction({
        name: 'activityManager',
        data: {
          action: 'list',
          params: { page, pageSize }
        }
      }).then(res => {
        const result = res.result
        if (result && result.code === 0) {
          const resData = result.data || {}
          // 前端过滤：根据当前用户角色隐藏不可见的活动
          const rawList = resData.list || []
          const currentUser = app.globalData && app.globalData.userProfile
          const filteredRawList = rawList.filter(item => {
            if (!item.isTargetOnlyVisible) return true
            if (!item.isTargetRoleEnabled) return true
            if (!item.targetRoles || item.targetRoles.length === 0) return true
            if (!currentUser || !currentUser.role) return false
            return item.targetRoles.includes(currentUser.role)
          })

          const now = Date.now()
          // 状态完全由截止日期决定
          const mappedList = filteredRawList.map(item => {
            const isEnded = !!(item.registrationDeadline && item.registrationDeadline < now)
            return {
              ...item,
              status: isEnded ? 'ended' : item.status,
              timeText: formatTime(item.createdAt)
            }
          })

          // 按 tab 前端筛选（不再依赖后端 status）
          const { filterStatus } = this.data
          const list = filterStatus === 'all'
            ? mappedList
            : mappedList.filter(item => item.status === filterStatus)

          this.setData({
            list: page === 1 ? list : [...this.data.list, ...list]
          })

          resolve({ data: list, hasMore: resData.hasMore })
        } else {
          reject(new Error(result.message || '加载失败'))
        }
      }).catch(error => {
        reject(error)
      })
    })
  },

  loadActivities(loadMore = false) {
    this.loadListData(loadMore)
  },

  handleFilterChange(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.filterStatus) return
    this.setData({ filterStatus: status })
    this.resetPagination()
    this.loadActivities()
  },

  handleItemTap(e) {
    if (this.data.swipeItem) {
      const id = e.currentTarget.dataset.id
      this.setData({ [`swipeX.${id}`]: 0, swipeItem: null })
      return
    }
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/office/activity-detail/activity-detail?id=${id}` })
  },

  handleCreate() {
    wx.navigateTo({ url: '/pages/office/activity-create/activity-create' })
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
    if (Math.abs(deltaY) > Math.abs(deltaX)) return
    if (deltaX < 0) {
      const offset = Math.max(deltaX, -70)
      this.setData({ [`swipeX.${id}`]: offset, swipeItem: id })
    }
  },

  handleTouchEnd(e) {
    const id = e.currentTarget.dataset.id
    const currentX = this.data.swipeX[id] || 0
    if (currentX < -40) {
      this.setData({ [`swipeX.${id}`]: -70, swipeItem: id })
    } else {
      this.setData({ [`swipeX.${id}`]: 0 })
    }
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
            name: 'activityManager',
            data: { action: 'delete', activityId: id }
          })
          wx.hideLoading()
          if (result.result && result.result.code === 0) {
            utils.showToast({ title: '已删除', icon: 'success' })
            this.resetPagination()
            this.loadActivities()
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
