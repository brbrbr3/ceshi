/**
 * 小绿书 - 帖子列表页
 */
const app = getApp()

const CATEGORIES = ['推荐', '最新', '美食', '生活', '出行', '运动', '学习', '分享']

Page({
  data: {
    categories: CATEGORIES,
    activeCategory: '推荐',

    list: [],
    cardWidth: 0,
    gap: 8,

    page: 1,
    hasMore: true,
    loading: false,

    searchKeyword: '',

    statusBarHeight: 0,
    navBarHeight: 44,
    contentTop: 0,

    safeBottom: 0,

    ready: false
  },

  onLoad() {
    const { screenWidth, statusBarHeight, safeArea } = wx.getWindowInfo()
    const gap = 8
    const padding = gap * 2
    const cardWidth = (screenWidth - padding - gap) / 2

    this.setData({
      cardWidth,
      gap,
      statusBarHeight,
      contentTop: statusBarHeight + 44,
      safeBottom: safeArea?.bottom ? 0 : 20,
      ready: true
    })

    this.loadPosts()
  },

  onShow() {},

  onPullDownRefresh() {
    this.refreshPosts()
  },

  onReachBottom() {
    this.loadMore()
  },

  /**
   * 加载帖子列表
   */
  async loadPosts(append = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const { activeCategory, page } = this.data
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: {
          action: 'list',
          page: append ? page : 1,
          pageSize: 20,
          category: activeCategory === '推荐' ? '' : activeCategory,
          sortBy: activeCategory === '最新' ? 'latest' : 'hot'
        }
      })

      if (res.result.code === 0) {
        const { list, hasMore } = res.result.data
        this.setData({
          list: append ? [...this.data.list, ...list] : list,
          page: append ? page + 1 : 2,
          hasMore,
          loading: false
        })
      }
    } catch (e) {
      console.error('加载帖子失败:', e)
      this.setData({ loading: false })
    }
  },

  refreshPosts() {
    this.setData({ page: 1, hasMore: true })
    this.loadPosts(false)
  },

  loadMore() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadPosts(true)
    }
  },

  handleCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    if (category === this.data.activeCategory) return
    this.setData({ activeCategory: category, page: 1, hasMore: true, list: [] })
    this.loadPosts(false)
  },

  handleSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  handleSearchConfirm() {},

  handleCreate() {
    wx.navigateTo({ url: '/pages/office/greenbook-create/greenbook-create' })
  },

  handleRefresh() {
    this.refreshPosts()
  },

  handleScrollToLower() {
    this.loadMore()
  },

  async handleCardLike(e) {
    const { postId, isLiked } = e.detail
    const { list } = this.data
    const index = list.findIndex(item => item._id === postId)
    if (index === -1) return

    const item = list[index]
    const newIsLiked = !item.isLiked
    this.setData({
      [`list[${index}].isLiked`]: newIsLiked,
      [`list[${index}].likeCount`]: newIsLiked ? (item.likeCount || 0) + 1 : Math.max(0, (item.likeCount || 1) - 1)
    })

    try {
      await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'toggleLike', targetId: postId, targetType: 'post' }
      })
    } catch (e) {
      this.setData({
        [`list[${index}].isLiked`]: item.isLiked,
        [`list[${index}].likeCount`]: item.likeCount
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
