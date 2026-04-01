/**
 * 小绿书 - 帖子详情页
 */
const app = getApp()
const utils = require('../../../common/utils.js')

// ===== 详情页缓存配置 =====
const DETAIL_CACHE_PREFIX = 'gb_detail_'
const DETAIL_EXPIRE = 3 * 60 * 1000 // 3分钟

// 页面级内存缓存
const detailMemoryCache = new Map()

function readDetailCache(postId) {
  // 1. 内存缓存
  const memCached = detailMemoryCache.get(postId)
  if (memCached && Date.now() - memCached.time < DETAIL_EXPIRE) {
    return { data: memCached.data, source: 'memory' }
  }

  // 2. Storage 缓存
  try {
    const key = `${DETAIL_CACHE_PREFIX}${postId}`
    const stored = wx.getStorageSync(key)
    if (stored && stored.data && Date.now() - stored.time < DETAIL_EXPIRE) {
      // 回填内存缓存
      detailMemoryCache.set(postId, { data: stored.data, time: Date.now() })
      return { data: stored.data, source: 'storage' }
    }
  } catch (e) {
    console.warn('读取详情缓存失败:', e)
  }

  return null
}

function writeDetailCache(postId, data) {
  detailMemoryCache.set(postId, { data, time: Date.now() })
  try {
    const key = `${DETAIL_CACHE_PREFIX}${postId}`
    wx.setStorageSync(key, { data, time: Date.now() })
  } catch (e) {
    console.warn('写入详情缓存失败:', e)
  }
}

function clearDetailCache(postId) {
  if (postId) {
    detailMemoryCache.delete(postId)
    try { wx.removeStorageSync(`${DETAIL_CACHE_PREFIX}${postId}`) } catch (e) {}
    return
  }
  // 清除所有详情缓存
  detailMemoryCache.clear()
  try {
    const res = wx.getStorageInfoSync()
    res.keys.forEach(key => {
      if (key.startsWith(DETAIL_CACHE_PREFIX)) {
        wx.removeStorageSync(key)
      }
    })
  } catch (e) {}
}

Page({
  data: {
    postId: '',

    statusBarHeight: 0,
    currentImage: 0,
    swiperHeight: 375,

    isLiked: false,
    isCollected: false,
    likeCount: 0,
    collectCount: 0,
    commentCount: 0,

    comments: [],
    commentPage: 1,
    commentHasMore: false,
    loadingComments: false,

    commentContent: '',
    replyTarget: null,

    post: null
  },

  onLoad(options) {
    const { postId } = options
    const { screenWidth, statusBarHeight } = wx.getWindowInfo()

    this.setData({
      postId,
      statusBarHeight
    })

    // 计算滚动区域顶部偏移
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect()
    const navBarHeight = statusBarHeight + 44
    this.setData({ navBarHeight })

    this.loadPostDetail()
    this.loadComments()
  },

  async loadPostDetail(forceRefresh = false) {
    const { postId } = this.data
    if (!postId) return

    // 尝试读取缓存（非强制刷新时）
    if (!forceRefresh) {
      const cached = readDetailCache(postId)
      if (cached) {
        const post = cached.data
        const { screenWidth } = wx.getWindowInfo()
        const firstRatio = post.imageRatios && post.imageRatios[0] ? post.imageRatios[0] : 1
        this.setData({
          post,
          isLiked: post.isLiked || false,
          isCollected: post.isCollected || false,
          likeCount: post.likeCount || 0,
          collectCount: post.collectCount || 0,
          commentCount: post.commentCount || 0,
          swiperHeight: screenWidth / firstRatio,
          currentImage: 0
        })
        // 后台静默刷新（缓存可能是旧数据）
        this._silentRefreshDetail()
        return
      }
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'detail', postId }
      })

      if (res.result.code === 0) {
        const post = res.result.data
        const { screenWidth } = wx.getWindowInfo()
        const firstRatio = post.imageRatios && post.imageRatios[0] ? post.imageRatios[0] : 1
        this.setData({
          post,
          isLiked: post.isLiked || false,
          isCollected: post.isCollected || false,
          likeCount: post.likeCount || 0,
          collectCount: post.collectCount || 0,
          commentCount: post.commentCount || 0,
          swiperHeight: screenWidth / firstRatio,
          currentImage: 0
        })
        // 写入缓存
        writeDetailCache(postId, post)
      }
    } catch (e) {
      console.error('加载详情失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  /**
   * 后台静默刷新详情
   */
  async _silentRefreshDetail() {
    const { postId } = this.data
    if (!postId) return
    try {
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'detail', postId }
      })
      if (res.result.code === 0) {
        const post = res.result.data
        const { screenWidth } = wx.getWindowInfo()
        const firstRatio = post.imageRatios && post.imageRatios[0] ? post.imageRatios[0] : 1
        this.setData({
          post,
          isLiked: post.isLiked || false,
          isCollected: post.isCollected || false,
          likeCount: post.likeCount || 0,
          collectCount: post.collectCount || 0,
          commentCount: post.commentCount || 0,
          swiperHeight: screenWidth / firstRatio
        })
        writeDetailCache(postId, post)
      }
    } catch (e) {
      console.warn('静默刷新详情失败:', e)
    }
  },

  async loadComments(append = false) {
    const { postId, commentPage } = this.data
    if (!postId) return
    if (this.data.loadingComments) return
    this.setData({ loadingComments: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: {
          action: 'getComments',
          postId,
          page: append ? commentPage : 1,
          pageSize: 20
        }
      })

      if (res.result.code === 0) {
        const { comments, hasMore } = res.result.data
        this.setData({
          comments: append ? [...this.data.comments, ...comments] : comments,
          commentPage: (append ? commentPage : 1) + 1,
          commentHasMore: hasMore,
          loadingComments: false
        })
      }
    } catch (e) {
      console.error('加载评论失败:', e)
      this.setData({ loadingComments: false })
    }
  },

  handleSwiperChange(e) {
    this.setData({ currentImage: e.detail.current })
  },

  async handleLike() {
    const { postId, isLiked, likeCount } = this.data
    this.setData({
      isLiked: !isLiked,
      likeCount: isLiked ? likeCount - 1 : likeCount + 1
    })
    try {
      await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'toggleLike', targetId: postId, targetType: 'post' }
      })
      clearDetailCache(postId)
    } catch (e) {
      this.setData({ isLiked, likeCount })
    }
  },

  async handleCollect() {
    const { postId, isCollected, collectCount } = this.data
    this.setData({
      isCollected: !isCollected,
      collectCount: isCollected ? collectCount - 1 : collectCount + 1
    })
    try {
      await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'toggleCollect', postId }
      })
      clearDetailCache(postId)
    } catch (e) {
      this.setData({ isCollected, collectCount })
    }
  },

  handleCommentInput(e) {
    this.setData({ commentContent: e.detail.value })
  },

  async handleSendComment() {
    const { postId, commentContent, replyTarget, commentCount } = this.data
    if (!commentContent || !commentContent.trim()) {
      wx.showToast({ title: '请输入评论内容', icon: 'none' })
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: {
          action: 'addComment',
          postId,
          content: commentContent.trim(),
          replyToId: replyTarget ? replyTarget.commentId : '',
          replyToName: replyTarget ? replyTarget.authorName : ''
        }
      })

      if (res.result.code === 0) {
        this.setData({ commentContent: '', replyTarget: null, commentCount: commentCount + 1 })
        clearDetailCache(postId)
        this.loadComments(false)
        wx.showToast({ title: '评论成功', icon: 'success' })
      }
    } catch (e) {
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  handleReplyComment(e) {
    const { commentId, authorName } = e.currentTarget.dataset
    this.setData({
      replyTarget: { commentId, authorName },
      commentContent: `@${authorName} `
    })
  },

  handleCancelReply() {
    this.setData({ replyTarget: null, commentContent: '' })
  },

  // 评论点赞
  async handleLikeComment(e) {
    const { commentId } = e.currentTarget.dataset
    const comments = this.data.comments
    const commentIndex = comments.findIndex(c => c._id === commentId)
    
    if (commentIndex === -1) return
    
    const comment = comments[commentIndex]
    const isLiked = comment.isLiked || false
    const likeCount = comment.likeCount || 0
    
    // 乐观更新
    comments[commentIndex] = {
      ...comment,
      isLiked: !isLiked,
      likeCount: isLiked ? likeCount - 1 : likeCount + 1
    }
    this.setData({ comments })
    
    try {
      await wx.cloud.callFunction({
        name: 'greenbookManager',
        data: { action: 'toggleLike', targetId: commentId, targetType: 'comment' }
      })
    } catch (e) {
      // 回滚
      comments[commentIndex] = comment
      this.setData({ comments })
    }
  },

  handleBack() {
    wx.navigateBack({ delta: 1 })
  },

  handleMore() {
    const { post } = this.data
    if (!post) return

    wx.showActionSheet({
      itemList: ['删除帖子'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          const confirm = await wx.showModal({
            title: '确认删除',
            content: '删除后不可恢复',
            confirmColor: '#DC2626'
          })
          if (confirm.confirm) {
            try {
              const result = await wx.cloud.callFunction({
                name: 'greenbookManager',
                data: { action: 'delete', postId: post._id }
              })
              if (result.result.code === 0) {
                clearDetailCache(post._id)
                wx.showToast({ title: '已删除', icon: 'success' })
                setTimeout(() => wx.navigateBack(), 1500)
              }
            } catch (e) {
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          }
        }
      }
    })
  },

  loadMoreComments() {
    if (this.data.commentHasMore && !this.data.loadingComments) {
      this.loadComments(true)
    }
  },

  formatTime(timestamp) {
    return utils.formatRelativeTime(timestamp)
  }
})
