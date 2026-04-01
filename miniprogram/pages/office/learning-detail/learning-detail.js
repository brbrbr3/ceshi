const app = getApp()
const utils = require('../../../common/utils.js')

const formatDateTime = (timestamp) => utils.formatDateTime(timestamp)

Page({
  data: {
    articleId: '',
    article: null,
    loading: true,
    currentUser: null
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      utils.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => { wx.navigateBack() }, 1500)
      return
    }

    this.setData({ articleId: id })
    this.loadCurrentUser()
    this.loadArticle()
  },

  loadCurrentUser() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered && result.user) {
          this.setData({ currentUser: result.user })
        }
      })
      .catch(() => {})
  },

  loadArticle() {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'articleManager',
      data: {
        action: 'get',
        articleId: this.data.articleId
      }
    }).then(res => {
      const result = res.result
      if (result && result.code === 0) {
        const article = result.data
        const currentUser = this.data.currentUser
        const currentOpenid = app.globalData.openid

        const isAuthor = article.authorId === currentOpenid
        const isAdmin = currentUser && (currentUser.isAdmin || currentUser.role === 'admin')
        const canDelete = isAuthor || isAdmin

        this.setData({
          article: {
            ...article,
            timeText: formatDateTime(article.createdAt),
            contentHtml: this._parseContent(article.content),
            canDelete
          },
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载文章失败:', error)
      utils.showToast({ title: error.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这篇文章吗？删除后不可恢复。',
      confirmColor: '#DC2626',
      success: (res) => {
        if (res.confirm) {
          this.deleteArticle()
        }
      }
    })
  },

  deleteArticle() {
    wx.showLoading({ title: '删除中...' })

    wx.cloud.callFunction({
      name: 'articleManager',
      data: {
        action: 'delete',
        articleId: this.data.articleId
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.code === 0) {
        utils.showToast({ title: '删除成功', icon: 'success' })
        setTimeout(() => { wx.navigateBack() }, 1500)
      } else {
        throw new Error(result.message || '删除失败')
      }
    }).catch(error => {
      wx.hideLoading()
      utils.showToast({ title: error.message || '删除失败', icon: 'none' })
    })
  },

  _parseContent(content) {
    if (!content) return ''
    if (/<[a-z][\s\S]*>/i.test(content)) {
      return content
    }
    return ''
  }
})
