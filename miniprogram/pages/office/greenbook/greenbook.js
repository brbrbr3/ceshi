/**
 * 小绿书 - 帖子列表页
 */
const app = getApp()

const CATEGORIES = ['推荐', '最新', '美食', '生活', '出行', '运动', '学习', '分享']

// ===== 缓存配置 =====
const CACHE_PREFIX = 'gb_list_'
const CACHE_EXPIRE = 5 * 60 * 1000 // 5分钟

function getListCacheKey(category) {
  return `${CACHE_PREFIX}${category}`
}

function readListCache(category) {
  try {
    const key = getListCacheKey(category)
    const cached = wx.getStorageSync(key)
    if (cached && cached.data && Date.now() - cached.time < CACHE_EXPIRE) {
      return cached.data
    }
  } catch (e) {
    console.warn('读取列表缓存失败:', e)
  }
  return null
}

function writeListCache(category, list) {
  try {
    const key = getListCacheKey(category)
    wx.setStorageSync(key, { data: list, time: Date.now() })
  } catch (e) {
    console.warn('写入列表缓存失败:', e)
  }
}

function clearListCache(category) {
  if (category) {
    try { wx.removeStorageSync(getListCacheKey(category)) } catch (e) {}
    return
  }
  try {
    const res = wx.getStorageInfoSync()
    res.keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (e) {}
}

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

  onShow() {
    // 字体缩放
    const fontScale = app.globalData.fontScale || 1
    if (this.data.fontScale !== fontScale) {
      this.setData({
        fontScale,
        pageStyle: `--font-scale: ${fontScale}`
      })
    }
    // 从发帖页返回时，清除当前分类缓存并刷新
    if (this._needRefresh) {
      this._needRefresh = false
      clearListCache(this.data.activeCategory)
      this.refreshPosts()
    }
  },

  onPullDownRefresh() {
    clearListCache(this.data.activeCategory)
    this.refreshPosts()
  },

  onReachBottom() {
    this.loadMore()
  },

  /**
   * 加载帖子列表（带缓存）
   */
  async loadPosts(append = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const { activeCategory, page } = this.data

    // 仅首页非追加时尝试读取缓存
    if (!append) {
      const cached = readListCache(activeCategory)
      if (cached) {
        this.setData({
          list: cached,
          page: 2,
          hasMore: true,
          loading: false
        })
        // 后台静默刷新
        this._silentRefresh()
        return
      }
    }

    try {
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

        // 仅首页写入缓存
        if (!append) {
          writeListCache(activeCategory, list)
        }
      }
    } catch (e) {
      console.error('加载帖子失败:', e)
      this.setData({ loading: false })
    }
  },

  /**
   * 后台静默刷新（不显示 loading）
   */
  async _silentRefresh() {
    const { activeCategory } = this.data
    try {
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: {
          action: 'list',
          page: 1,
          pageSize: 20,
          category: activeCategory === '推荐' ? '' : activeCategory,
          sortBy: activeCategory === '最新' ? 'latest' : 'hot'
        }
      })

      if (res.result.code === 0) {
        const { list, hasMore } = res.result.data
        this.setData({
          list,
          page: 2,
          hasMore
        })
        writeListCache(activeCategory, list)
      }
    } catch (e) {
      // 静默刷新失败，不影响用户体验
      console.warn('静默刷新失败:', e)
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
    wx.navigateTo({
      url: '/pages/office/greenbook-create/greenbook-create',
      events: {
        // 监听发帖成功事件
        publishSuccess: () => {
          this._needRefresh = true
        }
      }
    })
  },

  handleRefresh() {
    clearListCache(this.data.activeCategory)
    this.refreshPosts()
  },

  handleScrollToLower() {
    this.loadMore()
  },

  async handleCardLike(e) {
    const { postId, isLiked } = e.detail
    const { list, activeCategory } = this.data
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
      // 点赞后清除缓存（数据已变化）
      clearListCache(activeCategory)
    } catch (e) {
      this.setData({
        [`list[${index}].isLiked`]: item.isLiked,
        [`list[${index}].likeCount`]: item.likeCount
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  }
})
