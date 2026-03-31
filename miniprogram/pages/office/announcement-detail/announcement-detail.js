const app = getApp()
const utils = require('../../../common/utils.js')

// 使用统一的时间格式化函数
const formatDateTime = (timestamp) => utils.formatDateTime(timestamp)

Page({
  data: {
    announcementId: '',
    announcement: null,
    loading: true,
    currentUser: null
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      utils.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ announcementId: id })
    this.loadCurrentUser()
    this.loadAnnouncement()
  },

  /**
   * 加载当前用户信息
   */
  loadCurrentUser() {
    app.checkUserRegistration()
      .then((result) => {
        if (result.registered && result.user) {
          this.setData({ currentUser: result.user })
        }
      })
      .catch((error) => {
        console.error('获取用户信息失败:', error)
      })
  },

  /**
   * 加载通知公告详情
   */
  loadAnnouncement() {
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'announcementManager',
      data: {
        action: 'get',
        announcementId: this.data.announcementId
      }
    }).then(res => {
      const result = res.result
      if (result && result.code === 0) {
        const announcement = result.data
        const currentUser = this.data.currentUser
        const currentOpenid = app.globalData.openid

        // 判断是否可以撤回：发布者本人或管理员
        const isPublisher = announcement.publisherId === currentOpenid
        const isAdmin = currentUser && (currentUser.isAdmin || currentUser.role === 'admin')
        const canRevoke = announcement.status !== 'revoked' && (isPublisher || isAdmin)

        this.setData({
          announcement: {
            ...announcement,
            timeText: formatDateTime(announcement.publishedAt),
            typeText: this.getTypeText(announcement.type),
            typeClass: this.getTypeClass(announcement.type),
            contentHtml: this._parseContent(announcement.content),
            canRevoke
          },
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载通知公告失败:', error)
      utils.showToast({
        title: error.message || '加载失败',
        icon: 'none'
      })
      this.setData({ loading: false })
    })
  },

  /**
   * 撤回通知公告
   */
  handleRevoke() {
    wx.showModal({
      title: '确认撤回',
      content: '确定要撤回这条通知公告吗？撤回后用户将无法查看。',
      success: (res) => {
        if (res.confirm) {
          this.revokeAnnouncement()
        }
      }
    })
  },

  /**
   * 执行撤回操作
   */
  revokeAnnouncement() {
    wx.showLoading({ title: '撤回中...' })

    wx.cloud.callFunction({
      name: 'announcementManager',
      data: {
        action: 'revoke',
        announcementId: this.data.announcementId
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.code === 0) {
        utils.showToast({
          title: '撤回成功',
          icon: 'success'
        })
        // 刷新详情
        this.loadAnnouncement()
      } else {
        throw new Error(result.message || '撤回失败')
      }
    }).catch(error => {
      wx.hideLoading()
      console.error('撤回通知公告失败:', error)
      utils.showToast({
        title: error.message || '撤回失败',
        icon: 'none'
      })
    })
  },

  /**
   * 解析内容：判断是 HTML 还是纯文本，兼容老数据
   */
  _parseContent(content) {
    if (!content) return ''
    // 含有 HTML 标签则视为富文本内容
    if (/<[a-z][\s\S]*>/i.test(content)) {
      return content
    }
    // 纯文本不设置 contentHtml，由 wxml 中 wx:else 回退到 text 组件
    return ''
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
