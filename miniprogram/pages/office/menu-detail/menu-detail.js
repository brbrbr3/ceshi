const app = getApp()
const utils = require('../../../common/utils.js')

function formatTime(timestamp) {
  if (!timestamp) {
    return ''
  }

  // 使用统一的时间处理函数
  return utils.formatShortDateTime(timestamp)
}

Page({
  data: {
    menuId: '',
    menu: {},
    comments: [],
    commentText: '',
    currentUser: null,
    canEdit: false,
    canDelete: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ menuId: options.id })
      this.loadMenu()
      this.loadComments()
      this.checkPermission()
    }
  },

  onShow() {
    // 每次显示页面时刷新数据（从编辑页返回时自动更新）
    if (this.data.menuId) {
      this.loadMenu()
      this.loadComments()
    }
  },

  checkPermission() {
    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          return
        }

        const currentUser = result.user
        const isWorker = currentUser.role === '工勤'
        const isAdmin = currentUser.isAdmin

        this.setData({
          currentUser,
          canEdit: isWorker || isAdmin,
          canDelete: isWorker || isAdmin
        })
      })
      .catch((error) => {
        console.error('检查权限失败', error)
      })
  },

  loadMenu() {
    const db = wx.cloud.database()
    db.collection('menus')
      .doc(this.data.menuId)
      .get()
      .then(res => {
        this.setData({
          menu: {
            ...res.data,
            timeText: formatTime(res.data.createdAt)
          }
        })
      })
      .catch(error => {
        console.error('加载菜单失败', error)
        utils.showToast({
          title: '加载失败',
          icon: 'none'
        })
      })
  },

  loadComments() {
    // 先获取当前用户信息
    app.checkUserRegistration()
      .then((result) => {
        const currentUser = result.user
        const isAdmin = result.user ? result.user.isAdmin : false
        const currentOpenid = app.globalData.openid || ''

        const db = wx.cloud.database()
        db.collection('menu_comments')
          .where({
            menuId: this.data.menuId
          })
          .orderBy('createdAt', 'asc')
          .get()
          .then(res => {
            const comments = (res.data || []).map(item => {
              return {
                ...item,
                authorName: item.authorName || '用户',
                authorOpenid: item.authorOpenid || '',
                timeText: formatTime(item.createdAt),
                avatar: (item.authorName || '用户').slice(0, 1),
                avatarBg: utils.getAvatarColor(item.authorName || '用户'),
                canDelete: isAdmin || item.authorOpenid === currentOpenid
              }
            })

            this.setData({ comments })
          })
          .catch(error => {
            console.error('加载评论失败', error)
          })
      })
      .catch(() => {
        // 未登录用户，加载评论但不设置删除权限
        const db = wx.cloud.database()
        db.collection('menu_comments')
          .where({
            menuId: this.data.menuId
          })
          .orderBy('createdAt', 'asc')
          .get()
          .then(res => {
            const comments = (res.data || []).map(item => {
              return {
                ...item,
                authorName: item.authorName || '用户',
                authorOpenid: item.authorOpenid || '',
                timeText: formatTime(item.createdAt),
                avatar: (item.authorName || '用户').slice(0, 1),
                avatarBg: utils.getAvatarColor(item.authorName || '用户'),
                canDelete: false
              }
            })

            this.setData({ comments })
          })
          .catch(error => {
            console.error('加载评论失败', error)
          })
      })
  },

  onCommentInput(e) {
    this.setData({
      commentText: e.detail.value
    })
  },

  submitComment() {
    const content = this.data.commentText.trim()
    if (!content) {
      utils.showToast({
        title: '请输入评论内容',
        icon: 'none'
      })
      return
    }

    const openid = app.globalData.openid
    if (!openid) {
      utils.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    app.checkUserRegistration()
      .then((result) => {
        if (!result.registered || !result.user) {
          utils.showToast({
            title: '请先登录',
            icon: 'none'
          })
          return
        }

        const commentData = {
          menuId: this.data.menuId,
          content: content
        }

        wx.cloud.callFunction({
          name: 'menuManager',
          data: {
            action: 'addComment',
            commentData: commentData
          }
        })
          .then(() => {
            this.setData({ commentText: '' })
            this.loadComments()
            utils.showToast({
              title: '评论成功',
              icon: 'success'
            })
          })
          .catch(error => {
            console.error('提交评论失败', error)
            utils.showToast({
              title: '提交失败',
              icon: 'none'
            })
          })
      })
      .catch(() => {
        utils.showToast({
          title: '请先登录',
          icon: 'none'
        })
      })
  },

  deleteComment(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条评论吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'deleteComment',
              menuId: id
            }
          })
            .then(() => {
              this.loadComments()
              utils.showToast({
                title: '删除成功',
                icon: 'success'
              })
            })
            .catch(error => {
              console.error('删除评论失败', error)
              utils.showToast({
                title: '删除失败',
                icon: 'none'
              })
            })
        }
      }
    })
  },

  goEdit() {
    wx.navigateTo({
      url: `/pages/office/menu-edit/menu-edit?id=${this.data.menuId}`
    })
  },

  handleDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个菜单吗？删除后无法恢复。',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'menuManager',
            data: {
              action: 'deleteMenu',
              menuId: this.data.menuId
            }
          })
            .then(() => {
              utils.showToast({
                title: '删除成功',
                icon: 'success'
              })
              setTimeout(() => {
                wx.navigateBack()
              }, 500)
            })
            .catch(error => {
              console.error('删除菜单失败', error)
              utils.showToast({
                title: '删除失败',
                icon: 'none'
              })
            })
        }
      }
    })
  },

  onLinkTap(e) {
    const url = e.detail.href
    if (!url) return
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '链接已复制，请在浏览器中打开', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})
