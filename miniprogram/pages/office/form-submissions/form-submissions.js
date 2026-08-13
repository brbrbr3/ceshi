const app = getApp()
const utils = require('../../../common/utils.js')

Page({
  data: {
    formId: '',
    title: '',
    list: [],
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadSubmissions(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadSubmissions(formId) {
    wx.showLoading({ title: '加载中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'listSubmissions', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const form = result.data.form || {}
      const blocks = form.blocks || []
      const list = (result.data.list || []).map(s => this.formatSubmission(s, blocks))
      this.setData({
        title: form.title || '',
        list,
        loading: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载提交明细失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /**
   * 格式化单条提交记录
   */
  formatSubmission(s, blocks) {
    const answerDetails = (s.answers || []).map(a => {
      const block = blocks.find(b => b.id === a.blockId)
      return {
        blockId: a.blockId,
        title: block ? block.title : a.blockId,
        type: a.type,
        valueText: this.formatValue(a.type, a.value)
      }
    })
    return {
      ...s,
      timeText: utils.formatDateTime(s.submittedAt),
      answerDetails,
      expanded: false
    }
  },

  /**
   * 根据类型格式化答案值
   */
  formatValue(type, value) {
    if (type === 'checkbox') {
      return (value || []).join('、')
    }
    if (type === 'side_dish') {
      return (value || []).map(v => `${v.categoryName}×${v.count}`).join('、')
    }
    if (type === 'activity' && value === '报名') {
      return '已报名'
    }
    return value === undefined || value === null || value === '' ? '（空）' : value
  },

  /**
   * 展开/收起答案明细
   */
  handleToggleExpand(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = this.data.list[index]
    if (!item) return
    this.setData({
      [`list[${index}].expanded`]: !item.expanded
    })
  }
})
