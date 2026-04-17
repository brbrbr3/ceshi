/**
 * 新闻 - 列表页
 * 展示从巴西主流媒体网站爬取的最新新闻
 */
const app = getApp()

// ===== 来源配置（与云函数 SOURCES_REGISTRY 对应） =====
const SOURCES = [
  { id: '', name: '全部' },
  { id: 'globo', name: 'Globo' },
  { id: 'folha', name: 'Folha' },
  { id: 'estadao', name: 'Estadão' }
]

// ===== 缓存配置 =====
const CACHE_PREFIX = 'news_list_'
const CACHE_EXPIRE = 5 * 60 * 1000 // 5分钟

function getListCacheKey(source) {
  return `${CACHE_PREFIX}${source || 'all'}`
}

function readListCache(source) {
  try {
    const key = getListCacheKey(source)
    const cached = wx.getStorageSync(key)
    if (cached && cached.data && Date.now() - cached.time < CACHE_EXPIRE) {
      return cached.data
    }
  } catch (e) {
    console.warn('读取新闻缓存失败:', e)
  }
  return null
}

function writeListCache(source, list) {
  try {
    const key = getListCacheKey(source)
    wx.setStorageSync(key, { data: list, time: Date.now() })
  } catch (e) {
    console.warn('写入新闻缓存失败:', e)
  }
}

function clearListCache(source) {
  if (source) {
    try { wx.removeStorageSync(getListCacheKey(source)) } catch (e) {}
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
    sources: SOURCES,
    activeSource: '',
    activeSourceName: '全部',

    list: [],
    page: 1,
    hasMore: true,
    loading: false,
    refreshing: false,

    statusBarHeight: 0,
    navBarHeight: 44,

    ready: false
  },

  onLoad() {
    const { statusBarHeight } = wx.getWindowInfo()
    this.setData({
      statusBarHeight,
      navBarHeight: statusBarHeight + 44,
      ready: true
    })
    this.loadNews()
  },

  /**
   * 加载新闻列表（带缓存）
   */
  async loadNews(append = false) {
    if (this.data.loading) return
    this.setData({ loading: true })

    const { activeSource, page } = this.data

    // 仅首页非追加时尝试读取缓存
    if (!append) {
      const cached = readListCache(activeSource)
      if (cached && cached.list && cached.list.length > 0) {
        this.setData({
          list: cached.list,
          page: 2,
          hasMore: cached.hasMore,
          loading: false
        })
        this._silentRefresh()
        return
      }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'newsFetcher',
        data: {
          action: 'list',
          page: append ? page : 1,
          pageSize: 15,
          source: activeSource
        }
      })

      if (res.result.code === 0) {
        const { list, hasMore, total } = res.result.data
        this.setData({
          list: append ? [...this.data.list, ...list] : list,
          page: append ? page + 1 : 2,
          hasMore,
          loading: false
        })

        if (!append) {
          writeListCache(activeSource, { list, hasMore })
        }
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('加载新闻失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 后台静默刷新
   */
  async _silentRefresh() {
    const { activeSource } = this.data
    try {
      const res = await wx.cloud.callFunction({
        name: 'newsFetcher',
        data: {
          action: 'list',
          page: 1,
          pageSize: 15,
          source: activeSource
        }
      })

      if (res.result.code === 0) {
        const { list, hasMore } = res.result.data
        this.setData({
          list,
          page: 2,
          hasMore
        })
        writeListCache(activeSource, { list, hasMore })
      }
    } catch (e) {
      console.warn('新闻静默刷新失败:', e)
    }
  },

  refreshNews() {
    clearListCache(this.data.activeSource)
    this.setData({ page: 1, hasMore: true })
    this.loadNews(false)
  },

  loadMore() {
    if (this.data.loading) return
    if (!this.data.hasMore) return
    this.loadNews(true)
  },

  handleSourceTap(e) {
    const { id, name } = e.currentTarget.dataset
    if (id === this.data.activeSource) return
    this.setData({
      activeSource: id,
      activeSourceName: name,
      page: 1,
      hasMore: true,
      list: []
    })
    this.loadNews(false)
  },

  onRefresh() {
    if (this.data.refreshing) return
    this.setData({ refreshing: true })
    clearListCache(this.data.activeSource)
    this.setData({ page: 1, hasMore: true })
    this.loadNews(false).finally(() => {
      this.setData({ refreshing: false })
    })
  },

  handleScrollToLower() {
    this.loadMore()
  },

  handleNewsTap(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/office/news-detail/news-detail?articleId=${id}`
    })
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`

    const date = new Date(timestamp)
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${m}月${d}日`
  }
})
