const app = getApp()
const utils = require('../../../../common/utils.js')
const { getBlockTypeConfig } = require('../../../../common/form-constants.js')

Page({
  data: {
    formId: '',
    title: '',
    total: 0,
    stats: [],
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ formId: options.id })
      this.loadStats(options.id)
    }
  },

  onShow() {
    const fontStyle = app.globalData.fontStyle
    if (this.data.fontStyle !== fontStyle) {
      this.setData({ fontStyle })
    }
  },

  loadStats(formId) {
    wx.showLoading({ title: '统计中...', mask: true })
    wx.cloud.callFunction({
      name: 'contentFormManager',
      data: { action: 'getStats', params: { formId } }
    }).then(res => {
      wx.hideLoading()
      const result = res.result || {}
      if (result.code !== 0) {
        throw new Error(result.message || '加载失败')
      }
      const blocks = (result.data.blocks || []).filter(b => b.type !== 'text')
      const stats = blocks.map(b => this.decorateStat(b))
      this.setData({
        title: result.data.title || '',
        total: result.data.total || 0,
        stats,
        loading: false
      })
    }).catch(err => {
      wx.hideLoading()
      console.error('加载统计失败:', err)
      utils.showToast({ title: err.message || '加载失败', icon: 'none' })
      this.setData({ loading: false })
    })
  },

  /**
   * 为统计块附加展示字段
   */
  decorateStat(block) {
    const cfg = getBlockTypeConfig(block.type)
    const decorated = {
      ...block,
      typeLabel: cfg.label,
      typeIcon: cfg.icon,
      typeColor: cfg.color
    }
    // 活动报名名单：预转字符串（WXML 不支持 join 方法调用）
    if (block.type === 'activity') {
      decorated.groupStats = (block.groupStats || []).map(g => ({
        ...g,
        membersText: (g.members || []).join('、') || '暂无'
      }))
      decorated.ungroupedMembersText = (block.ungroupedMembers || []).join('、') || '暂无'
    }
    return decorated
  }
})
