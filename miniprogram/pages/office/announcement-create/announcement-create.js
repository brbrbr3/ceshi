const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    title: '',
    content: '',
    type: 'normal',
    typeIndex: -1,
    typeOptions: [
      { label: '普通', value: 'normal' },
      { label: '紧急', value: 'urgent' },
      { label: '重要', value: 'important' }
    ],
    submitting: false
  },

  /**
   * 标题输入
   */
  handleTitleInput(e) {
    this.setData({
      title: e.detail.value
    })
  },

  /**
   * 内容输入
   */
  handleContentInput(e) {
    this.setData({
      content: e.detail.value
    })
  },

  /**
   * 选择通知类型
   */
  handleTypeChange(e) {
    const index = e.detail.value
    const type = this.data.typeOptions[index].value
    this.setData({
      typeIndex: index,
      type: type
    })
  },

  /**
   * 提交通知公告
   */
  handleSubmit() {
    const { title, content, type } = this.data

    // 验证表单
    if (!title || title.trim() === '') {
      utils.showToast({
        title: '请输入标题',
        icon: 'none'
      })
      return
    }

    if (!content || content.trim() === '') {
      utils.showToast({
        title: '请输入内容',
        icon: 'none'
      })
      return
    }

    if (title.length > 100) {
      utils.showToast({
        title: '标题不能超过100个字符',
        icon: 'none'
      })
      return
    }

    if (content.length > 1000) {
      utils.showToast({
        title: '内容不能超过1000个字符',
        icon: 'none'
      })
      return
    }

    // 提交
    this.submitAnnouncement()
  },

  /**
   * 提交通知公告
   */
  submitAnnouncement() {
    this.setData({ submitting: true })

    wx.showLoading({ title: '发布中...' })

    wx.cloud.callFunction({
      name: 'announcementManager',
      data: {
        action: 'create',
        data: {
          title: this.data.title.trim(),
          content: this.data.content.trim(),
          type: this.data.type
        }
      }
    }).then(res => {
      wx.hideLoading()
      const result = res.result
      if (result && result.code === 0) {
        utils.showToast({
          title: '发布成功',
          icon: 'success'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      } else {
        throw new Error(result.message || '发布失败')
      }
    }).catch(error => {
      wx.hideLoading()
      console.error('发布通知公告失败:', error)
      utils.showToast({
        title: error.message || '发布失败',
        icon: 'none'
      })
      this.setData({ submitting: false })
    })
  },

  /**
   * 取消提交
   */
  handleCancel() {
    wx.navigateBack()
  }
})
