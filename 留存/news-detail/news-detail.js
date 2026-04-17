/**
 * 新闻 - 详情页
 * 展示新闻完整文章内容，支持阅读原文
 */
const app = getApp()

// ===== 详情页缓存 =====
const DETAIL_CACHE_PREFIX = 'news_detail_'
const DETAIL_EXPIRE = 3 * 60 * 1000 // 3分钟

function readDetailCache(articleId) {
  try {
    const key = `${DETAIL_CACHE_PREFIX}${articleId}`
    const cached = wx.getStorageSync(key)
    if (cached && cached.data && Date.now() - cached.time < DETAIL_EXPIRE) {
      return cached.data
    }
  } catch (e) {}
  return null
}

function writeDetailCache(articleId, data) {
  try {
    const key = `${DETAIL_CACHE_PREFIX}${articleId}`
    wx.setStorageSync(key, { data, time: Date.now() })
  } catch (e) {}
}

/**
 * 格式化文章 HTML 内容
 * - 为 <p> 标签添加首行缩进
 */
function formatContent(html) {
  if (!html) return html
  return html.replace(/<p[^>]*>/gi, (match) => {
    if (match.includes('style=')) {
      return match.replace(/style="([^"]*)"/, 'style="$1text-indent:2em;"')
    }
    return match.replace('>', ' style="text-indent:2em;">')
  })
}

function withFormattedContent(article) {
  if (!article || !article.content) return article
  return { ...article, content: formatContent(article.content) }
}

Page({
  data: {
    articleId: '',
    article: null,
    statusBarHeight: 0,
    navBarHeight: 0,
    loading: true
  },

  onLoad(options) {
    const { articleId } = options
    const { statusBarHeight } = wx.getWindowInfo()

    this.setData({
      articleId,
      statusBarHeight,
      navBarHeight: statusBarHeight + 44
    })

    this.loadDetail()
  },

  onShareAppMessage() {
    const { article } = this.data
    if (article) {
      return {
        title: article.title,
        path: `/pages/office/news-detail/news-detail?articleId=${article._id}`
      }
    }
    return {}
  },

  async loadDetail(forceRefresh = false) {
    const { articleId } = this.data
    if (!articleId) {
      this.setData({ loading: false })
      return
    }

    // 尝试读取缓存
    if (!forceRefresh) {
      const cached = readDetailCache(articleId)
      if (cached) {
        this.setData({ article: withFormattedContent(cached), loading: false })
        this._silentRefresh()
        return
      }
    }

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'newsFetcher',
        data: { action: 'detail', articleId }
      })

      if (res.result.code === 0) {
        const article = withFormattedContent(res.result.data)
        this.setData({ article, loading: false })
        writeDetailCache(articleId, article)
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: res.result.message || '加载失败', icon: 'none' })
      }
    } catch (e) {
      console.error('加载新闻详情失败:', e)
      this.setData({ loading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  async _silentRefresh() {
    const { articleId } = this.data
    if (!articleId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'newsFetcher',
        data: { action: 'detail', articleId }
      })
      if (res.result.code === 0) {
        const article = withFormattedContent(res.result.data)
        this.setData({ article })
        writeDetailCache(articleId, article)
      }
    } catch (e) {
      console.warn('详情静默刷新失败:', e)
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 })
  },

  handleOpenOriginal() {
    const { article } = this.data
    if (!article || !article.sourceUrl) {
      wx.showToast({ title: '原文链接不可用', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: ['在浏览器中打开', '复制链接'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 复制链接到剪贴板并提示用户在浏览器打开
          wx.setClipboardData({
            data: article.sourceUrl,
            success: () => {
              wx.showToast({
                title: '链接已复制，请在浏览器中打开',
                icon: 'none',
                duration: 2500
              })
            }
          })
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: article.sourceUrl,
            success: () => {
              wx.showToast({ title: '链接已复制', icon: 'success' })
            }
          })
        }
      }
    })
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  }
})
