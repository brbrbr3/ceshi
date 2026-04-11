/**
 * 意见反馈页面
 * 
 * 功能：
 * 1. 用户发表意见反馈
 * 2. 管理员可回复意见
 * 3. 所有人可见意见和回复
 */

const app = getApp()
const utils = require('../../../common/utils.js')
const paginationBehavior = require('../../../behaviors/pagination.js')

Page({
  behaviors: [paginationBehavior],

  data: {
    // 权限
    isAdmin: false,
    
    // 输入
    inputContent: '',
    
    // 回复弹窗
    showReplyModal: false,
    replyContent: '',
    currentFeedbackId: ''
  },

  onLoad() {
    this.initPagination({
      initialPageSize: 10,
      loadMorePageSize: 10
    })
    
    this.checkAdminPermission()
    this.loadListData()
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
    if (this.data.list.length === 0) {
      this.loadListData()
    }
  },

  /**
   * 检查管理员权限
   */
  checkAdminPermission() {
    app.checkUserRegistration().then((result) => {
      if (result.registered && result.user) {
        const user = result.user
        const isAdmin = user.isAdmin || user.role === 'admin'
        this.setData({ isAdmin })
      }
    }).catch(() => {})
  },

  /**
   * 返回上一页
   */
  handleBack() {
    wx.navigateBack()
  },

  /**
   * 输入框内容变化
   */
  handleInputChange(e) {
    this.setData({ inputContent: e.detail.value })
  },

  /**
   * 发送意见
   */
  async handleSend() {
    const { inputContent } = this.data
    if (!inputContent.trim()) {
      utils.showToast({ title: '请输入意见内容', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发送中...', mask: true })
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'feedbackManager',
        data: {
          action: 'createPost',
          content: inputContent.trim()
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: '发送成功', icon: 'success' })
        this.setData({ inputContent: '' })
        // 刷新列表
        this.resetPagination()
        this.loadListData()
      } else {
        utils.showToast({ title: res.result.message || '发送失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      utils.showToast({ title: '发送失败', icon: 'none' })
    }
  },

  /**
   * 显示回复弹窗
   */
  handleShowReplyInput(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      showReplyModal: true,
      currentFeedbackId: id,
      replyContent: ''
    })
  },

  /**
   * 隐藏回复弹窗
   */
  hideReplyModal() {
    this.setData({
      showReplyModal: false,
      currentFeedbackId: '',
      replyContent: ''
    })
  },

  /**
   * 回复内容输入
   */
  handleReplyInput(e) {
    this.setData({ replyContent: e.detail.value })
  },

  /**
   * 发送回复
   */
  async handleSendReply() {
    const { replyContent, currentFeedbackId } = this.data
    
    if (!replyContent.trim()) {
      utils.showToast({ title: '请输入回复内容', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发送中...', mask: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'feedbackManager',
        data: {
          action: 'createReply',
          postId: currentFeedbackId,
          content: replyContent.trim()
        }
      })

      wx.hideLoading()

      if (res.result.code === 0) {
        utils.showToast({ title: '回复成功', icon: 'success' })
        this.hideReplyModal()
        // 刷新列表
        this.resetPagination()
        this.loadListData()
      } else {
        utils.showToast({ title: res.result.message || '回复失败', icon: 'none' })
      }
    } catch (error) {
      wx.hideLoading()
      utils.showToast({ title: '回复失败', icon: 'none' })
    }
  },

  /**
   * 加载数据（实现 paginationBehavior 的抽象方法）
   */
  async loadData(params) {
    const { page, pageSize } = params

    try {
      const res = await wx.cloud.callFunction({
        name: 'feedbackManager',
        data: {
          action: 'getPosts',
          page,
          pageSize
        }
      })

      if (res.result.code === 0) {
        const data = res.result.data || {}
        const posts = (data.list || []).map(post => ({
          ...post,
          timeText: utils.formatRelativeTime(post.createdAt),
          replies: (post.replies || []).map(reply => ({
            ...reply,
            timeText: utils.formatRelativeTime(reply.createdAt)
          }))
        }))

        return {
          data: posts,
          hasMore: data.hasMore || false
        }
      }

      return { data: [], hasMore: false }
    } catch (error) {
      console.error('加载意见列表失败:', error)
      return { data: [], hasMore: false }
    }
  }
})
