const app = getApp()
const util = require('../../../util/util.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

// 使用统一的时间格式化函数（GMT-3 巴西利亚时间）
const formatTime = util.formatTimeToGMT3

Page({
  behaviors: [paginationBehavior],

  data: {
    announcements: [],
    filterType: 'all'  // all, urgent, important, normal
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 20,
      loadMorePageSize: 10
    })
    this.loadAnnouncements()
  },

  onShow() {
    // 如果列表为空，重新加载
    if (this.data.list.length === 0) {
      this.loadAnnouncements()
    }
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
            typeClass: this.getTypeClass(item.type)
          }))

          // 同步到 announcements
          this.setData({
            announcements: this.data.page === 1 
              ? formattedList 
              : [...this.data.announcements, ...formattedList]
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
  }
})
