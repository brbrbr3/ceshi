/**
 * 小绿书 - 帖子详情页
 */
const app = getApp()
const utils = require('../../../common/utils.js')

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

    this.loadPostDetail()
    this.loadComments()
  },

  async loadPostDetail() {
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
          swiperHeight: screenWidth / firstRatio,
          currentImage: 0
        })
      }
    } catch (e) {
      console.error('加载详情失败:', e)
      wx.showToast({ title: '加载失败', icon: 'none' })
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
