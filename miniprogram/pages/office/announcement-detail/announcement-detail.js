const app = getApp()
const util = require('../../../util/util.js')

// 使用统一的时间格式化函数（GMT-3 巴西利亚时间）
const formatDateTime = util.formatDateTimeToGMT3

Page({
  data: {
    announcementId: '',
    announcement: null,
    loading: true
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      util.showToast({
        title: '参数错误',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ announcementId: id })
    this.loadAnnouncement()
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

        this.setData({
          announcement: {
            ...announcement,
            timeText: formatDateTime(announcement.publishedAt),
            typeText: this.getTypeText(announcement.type),
            typeClass: this.getTypeClass(announcement.type),
            canRevoke: announcement.status !== 'revoked'
          },
          loading: false
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    }).catch(error => {
      console.error('加载通知公告失败:', error)
      util.showToast({
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
        util.showToast({
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
      util.showToast({
        title: error.message || '撤回失败',
        icon: 'none'
      })
    })
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
